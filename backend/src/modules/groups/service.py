from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from modules.projects.service import delete_project, delete_project_auto
from core.database.models import Group, User, GroupMember, UserRole, Project, Task, project_group_association, task_user_association
from core.utils.dependencies import ensure_user_is_admin, get_user_group_role, get_group_member, ensure_user_is_super_admin_global
from .schemas import AddUsersToGroup, GetUserRoleResponse, RemoveUsersFromGroup, GroupCreate, GroupRead, GroupReadWithRelations, GroupUpdate
from .exceptions import (
    GroupNotFoundError,
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupUpdateError,
    GroupDeleteError,
    UserNotInGroupError,
    UserAlreadyInGroupError,
    UserNotFoundInGroupError,
    UsersNotFoundError,
    InsufficientPermissionsError,
    InvalidRoleError
)

async def get_all_groups(session: AsyncSession, current_user_id: int) -> list[GroupRead]:
    # Только супер-админ может видеть все группы
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_group_by_id(session: AsyncSession, group_id: int) -> GroupReadWithRelations:
    stmt = select(Group).options(
        selectinload(Group.group_members).selectinload(GroupMember.user),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()
    
    if not group:
        raise GroupNotFoundError(group_id=group_id)
    
    # Преобразуем GroupMember в пользователей с ролями
    group.users = []
    for group_member in group.group_members:
        user_with_role = group_member.user
        user_with_role.role = group_member.role.value
        group.users.append(user_with_role)
    
    return group

async def get_user_groups(session: AsyncSession, user_id: int) -> list[GroupReadWithRelations]:
    stmt = select(Group).options(
        selectinload(Group.group_members).selectinload(GroupMember.user),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).join(Group.group_members).where(GroupMember.user_id == user_id).order_by(Group.id)
    
    result = await session.execute(stmt)
    groups = result.scalars().all()
    
    # Преобразуем GroupMember в пользователей с ролями для каждой группы
    for group in groups:
        group.users = []
        for group_member in group.group_members:
            user_with_role = group_member.user
            user_with_role.role = group_member.role.value
            group.users.append(user_with_role)
    
    return groups

async def get_role_for_user_in_group(
    session: AsyncSession,
    current_user_id: int,
    group_id: int
) -> GetUserRoleResponse:
    role = await get_user_group_role(session, current_user_id, group_id)
    if role is None:
        raise UserNotInGroupError(user_id=current_user_id, group_id=group_id)
    
    return GetUserRoleResponse(role=role)

async def create_group(
    session: AsyncSession,
    group_create: GroupCreate,
    current_user: User
) -> GroupReadWithRelations:
    try:
        existing_group_stmt = select(Group).where(Group.name == group_create.name)
        existing_group_result = await session.execute(existing_group_stmt)
        existing_group = existing_group_result.scalar_one_or_none()
        
        if existing_group:
            raise GroupAlreadyExistsError(group_create.name)

        new_group = Group(**group_create.model_dump())
        session.add(new_group)
        
        await session.flush()
        
        # Создаем запись GroupMember для создателя группы с ролью ADMIN
        group_member = GroupMember(
            user_id=current_user.id,
            group_id=new_group.id,
            role=UserRole.ADMIN
        )
        session.add(group_member)

        await session.commit()
        
        # Перезагружаем группу с отношениями
        return await get_group_by_id(session, new_group.id)

    except (GroupAlreadyExistsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupCreationError(f"Не удалось создать группу: {str(e)}")

async def add_users_to_group(
    session: AsyncSession,
    group_id: int,
    data: AddUsersToGroup,
    current_user: User
) -> GroupReadWithRelations:
    try:
        # Проверяем существование группы
        group_exists_stmt = select(Group).where(Group.id == group_id)
        group_exists_result = await session.execute(group_exists_stmt)
        if not group_exists_result.scalar_one_or_none():
            raise GroupNotFoundError(group_id=group_id)

        # Проверяем права администратора
        await ensure_user_is_admin(session, current_user.id, group_id)

        user_emails = [user_with_role.user_email for user_with_role in data.users]
        
        # Находим пользователей по email
        users_stmt = select(User).where(User.email.in_(user_emails))
        users_result = await session.execute(users_stmt)
        users = users_result.scalars().all()

        if len(users) != len(user_emails):
            found_emails = {u.email for u in users}
            missing_emails = set(user_emails) - found_emails
            raise UsersNotFoundError(list(missing_emails))

        email_to_user = {user.email: user for user in users}

        # Добавляем пользователей в группу
        for user_with_role in data.users:
            user_email = user_with_role.user_email
            role = user_with_role.role
            user = email_to_user[user_email]

            # Проверяем существующее членство
            existing_member_stmt = select(GroupMember).where(
                GroupMember.user_id == user.id,
                GroupMember.group_id == group_id
            )
            existing_member_result = await session.execute(existing_member_stmt)
            if existing_member_result.scalar_one_or_none():
                raise UserAlreadyInGroupError(user_email, group_id)

            # Создаем новую запись GroupMember
            group_member = GroupMember(
                user_id=user.id,
                group_id=group_id,
                role=role
            )
            session.add(group_member)

        await session.commit()
        
        # Перезагружаем группу с обновленными данными
        return await get_group_by_id(session, group_id)

    except (GroupNotFoundError, InsufficientPermissionsError, UsersNotFoundError, 
            UserAlreadyInGroupError) as e:
        await session.rollback()
        raise e
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось добавить пользователей в группу: {str(e)}")

async def change_user_role(
    session: AsyncSession,
    current_user_id: int,
    group_id: int,
    user_email: str,
    new_role: UserRole
):
    try:
        await ensure_user_is_admin(session, current_user_id, group_id)

        # Находим пользователя по email
        user_stmt = select(User).where(User.email == user_email)
        user_result = await session.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise UserNotFoundInGroupError(user_email=user_email)

        # Находим запись GroupMember
        group_member_stmt = select(GroupMember).where(
            GroupMember.user_id == user.id,
            GroupMember.group_id == group_id
        )
        group_member_result = await session.execute(group_member_stmt)
        group_member = group_member_result.scalar_one_or_none()

        if not group_member:
            raise UserNotFoundInGroupError(user_email=user_email)

        # Обновляем роль
        group_member.role = new_role
        await session.commit()

        return {"detail": "Роль успешно изменена"}

    except (InsufficientPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось изменить роль пользователя: {str(e)}")

async def update_group(
    session: AsyncSession,
    db_group: Group,
    group_update: GroupUpdate,
    current_user: User
) -> GroupReadWithRelations:
    try:
        await ensure_user_is_admin(session, current_user.id, db_group.id)

        if group_update.name:
            existing_group_stmt = select(Group).where(
                Group.name == group_update.name,
                Group.id != db_group.id
            )
            existing_group_result = await session.execute(existing_group_stmt)
            existing_group = existing_group_result.scalar_one_or_none()
            
            if existing_group:
                raise GroupAlreadyExistsError(group_update.name)

        for key, value in group_update.model_dump(exclude_unset=True).items():
            setattr(db_group, key, value)

        await session.commit()
        
        # Перезагружаем группу с обновленными данными
        return await get_group_by_id(session, db_group.id)

    except (InsufficientPermissionsError, GroupAlreadyExistsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось обновить группу: {str(e)}")

async def remove_users_from_group(
    session: AsyncSession,
    group_id: int,
    data: RemoveUsersFromGroup,
    current_user: User
) -> GroupReadWithRelations:
    try:
        # Проверяем существование группы
        group_exists_stmt = select(Group).where(Group.id == group_id)
        group_exists_result = await session.execute(group_exists_stmt)
        if not group_exists_result.scalar_one_or_none():
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group_id)

        # Получаем все задачи группы
        tasks_stmt = select(Task).options(selectinload(Task.assignees)).where(Task.group_id == group_id)
        tasks_result = await session.execute(tasks_stmt)
        tasks = tasks_result.scalars().all()

        # Обрабатываем каждую задачу
        for task in tasks:
            # Получаем текущих исполнителей задачи
            current_assignees = list(task.assignees)
            
            # Удаляем пользователей, которых нужно исключить из группы
            users_to_remove_from_task = [user for user in current_assignees if user.id in data.user_ids]
            
            for user in users_to_remove_from_task:
                task.assignees.remove(user)
            
            # Если после удаления не осталось исполнителей, удаляем задачу
            if not task.assignees:
                await session.delete(task)

        # Удаляем записи GroupMember
        delete_members_stmt = delete(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id.in_(data.user_ids)
        )
        result = await session.execute(delete_members_stmt)
        
        if result.rowcount == 0:
            raise UserNotFoundInGroupError()

        # Проверяем, не осталась ли группа пустой
        remaining_members_stmt = select(GroupMember).where(GroupMember.group_id == group_id)
        remaining_members_result = await session.execute(remaining_members_stmt)
        remaining_members = remaining_members_result.scalars().all()
        
        if not remaining_members:
            # Группа осталась без участников - удаляем её автоматически
            await delete_group_auto(session, group_id)
            raise GroupDeleteError("Группа удалена, так как в ней не осталось участников")

        await session.commit()

        # Перезагружаем группу с актуальными данными
        return await get_group_by_id(session, group_id)

    except (GroupNotFoundError, InsufficientPermissionsError, UserNotFoundInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось удалить пользователей из группы: {str(e)}")

async def delete_group_auto(
    session: AsyncSession,
    group_id: int
) -> bool:
    try:
        # Загружаем группу с минимальными отношениями
        group_stmt = select(Group).where(Group.id == group_id)
        group_result = await session.execute(group_stmt)
        group = group_result.scalar_one_or_none()
        
        if not group:
            return True  # Группа уже удалена

        # Получаем проекты, связанные с этой группой
        project_links_stmt = select(project_group_association).where(
            project_group_association.c.group_id == group_id
        )
        project_links_result = await session.execute(project_links_stmt)
        project_links = project_links_result.all()
        
        project_ids = [link.project_id for link in project_links]

        # Удаляем задачи группы через bulk delete
        delete_tasks_stmt = delete(Task).where(Task.group_id == group_id)
        await session.execute(delete_tasks_stmt)

        # Удаляем связи с проектами через ассоциативную таблицу
        delete_project_links_stmt = delete(project_group_association).where(
            project_group_association.c.group_id == group_id
        )
        await session.execute(delete_project_links_stmt)

        # Удаляем членства в группе
        delete_members_stmt = delete(GroupMember).where(GroupMember.group_id == group_id)
        await session.execute(delete_members_stmt)

        # Удаляем саму группу
        delete_group_stmt = delete(Group).where(Group.id == group_id)
        await session.execute(delete_group_stmt)

        # Проверяем и удаляем проекты, которые остались без групп
        for project_id in project_ids:
            # Проверяем, остались ли у проекта другие группы
            remaining_groups_stmt = select(project_group_association).where(
                project_group_association.c.project_id == project_id
            )
            remaining_groups_result = await session.execute(remaining_groups_stmt)
            remaining_groups = remaining_groups_result.all()
            
            if not remaining_groups:
                # Проект остался без групп - удаляем его
                await delete_project_auto(session, project_id)

        await session.commit()
        return True

    except Exception as e:
        await session.rollback()
        raise GroupDeleteError(f"Не удалось автоматически удалить группу: {str(e)}")

async def delete_group(
    session: AsyncSession,
    group_id: int,
    current_user: User
) -> bool:
    try:
        # Загружаем группу с минимальными отношениями
        group_stmt = select(Group).where(Group.id == group_id)
        group_result = await session.execute(group_stmt)
        group = group_result.scalar_one_or_none()
        
        if not group:
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group_id)

        # Используем автоматическое удаление, но с предварительной проверкой прав
        await delete_group_auto(session, group_id)
        await session.commit()

        return True

    except (GroupNotFoundError, InsufficientPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupDeleteError(f"Не удалось удалить группу: {str(e)}")
