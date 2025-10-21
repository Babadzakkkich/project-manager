from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from modules.projects.service import delete_project_auto
from core.database.models import Group, User, GroupMember, UserRole, Task, project_group_association, task_user_association
from core.utils.dependencies import ensure_user_is_admin, get_user_group_role, ensure_user_is_super_admin_global
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
)

# Получить все группы (только для супер-админа)
async def get_all_groups(session: AsyncSession, current_user_id: int) -> list[GroupRead]:
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()

# Получить группу по ID
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
    
    group.users = []
    for group_member in group.group_members:
        user_with_role = group_member.user
        user_with_role.role = group_member.role.value
        group.users.append(user_with_role)
    
    return group

# Получить группы пользователя
async def get_user_groups(session: AsyncSession, user_id: int) -> list[GroupReadWithRelations]:
    stmt = select(Group).options(
        selectinload(Group.group_members).selectinload(GroupMember.user),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).join(Group.group_members).where(GroupMember.user_id == user_id).order_by(Group.id)
    
    result = await session.execute(stmt)
    groups = result.scalars().all()
    
    for group in groups:
        group.users = []
        for group_member in group.group_members:
            user_with_role = group_member.user
            user_with_role.role = group_member.role.value
            group.users.append(user_with_role)
    
    return groups

# Получить роль пользователя в группе
async def get_role_for_user_in_group(
    session: AsyncSession,
    current_user_id: int,
    group_id: int
) -> GetUserRoleResponse:
    role = await get_user_group_role(session, current_user_id, group_id)
    if role is None:
        raise UserNotInGroupError(user_id=current_user_id, group_id=group_id)
    
    return GetUserRoleResponse(role=role)

# Создать группу
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
        
        group_member = GroupMember(
            user_id=current_user.id,
            group_id=new_group.id,
            role=UserRole.ADMIN
        )
        session.add(group_member)

        await session.commit()
        
        return await get_group_by_id(session, new_group.id)

    except (GroupAlreadyExistsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupCreationError(f"Не удалось создать группу: {str(e)}")

# Добавить пользователей в группу
async def add_users_to_group(
    session: AsyncSession,
    group_id: int,
    data: AddUsersToGroup,
    current_user: User
) -> GroupReadWithRelations:
    try:
        group_exists_stmt = select(Group).where(Group.id == group_id)
        group_exists_result = await session.execute(group_exists_stmt)
        if not group_exists_result.scalar_one_or_none():
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group_id)

        user_emails = [user_with_role.user_email for user_with_role in data.users]
        
        users_stmt = select(User).where(User.email.in_(user_emails))
        users_result = await session.execute(users_stmt)
        users = users_result.scalars().all()

        if len(users) != len(user_emails):
            found_emails = {u.email for u in users}
            missing_emails = set(user_emails) - found_emails
            raise UsersNotFoundError(list(missing_emails))

        email_to_user = {user.email: user for user in users}

        for user_with_role in data.users:
            user_email = user_with_role.user_email
            role = user_with_role.role
            user = email_to_user[user_email]

            existing_member_stmt = select(GroupMember).where(
                GroupMember.user_id == user.id,
                GroupMember.group_id == group_id
            )
            existing_member_result = await session.execute(existing_member_stmt)
            if existing_member_result.scalar_one_or_none():
                raise UserAlreadyInGroupError(user_email, group_id)

            group_member = GroupMember(
                user_id=user.id,
                group_id=group_id,
                role=role
            )
            session.add(group_member)

        await session.commit()
        
        return await get_group_by_id(session, group_id)

    except (GroupNotFoundError, InsufficientPermissionsError, UsersNotFoundError, 
            UserAlreadyInGroupError) as e:
        await session.rollback()
        raise e
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось добавить пользователей в группу: {str(e)}")

# Изменить роль пользователя в группе
async def change_user_role(
    session: AsyncSession,
    current_user_id: int,
    group_id: int,
    user_email: str,
    new_role: UserRole
):
    try:
        await ensure_user_is_admin(session, current_user_id, group_id)

        user_stmt = select(User).where(User.email == user_email)
        user_result = await session.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise UserNotFoundInGroupError(user_email=user_email)

        group_member_stmt = select(GroupMember).where(
            GroupMember.user_id == user.id,
            GroupMember.group_id == group_id
        )
        group_member_result = await session.execute(group_member_stmt)
        group_member = group_member_result.scalar_one_or_none()

        if not group_member:
            raise UserNotFoundInGroupError(user_email=user_email)

        group_member.role = new_role
        await session.commit()

        return {"detail": "Роль успешно изменена"}

    except (InsufficientPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось изменить роль пользователя: {str(e)}")

# Обновить группу
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
        
        return await get_group_by_id(session, db_group.id)

    except (InsufficientPermissionsError, GroupAlreadyExistsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось обновить группу: {str(e)}")

# Удалить пользователей из группы
async def remove_users_from_group(
    session: AsyncSession,
    group_id: int,
    data: RemoveUsersFromGroup,
    current_user: User
) -> GroupReadWithRelations:
    try:
        group_exists_stmt = select(Group).where(Group.id == group_id)
        group_exists_result = await session.execute(group_exists_stmt)
        if not group_exists_result.scalar_one_or_none():
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group_id)

        tasks_stmt = select(Task).options(selectinload(Task.assignees)).where(Task.group_id == group_id)
        tasks_result = await session.execute(tasks_stmt)
        tasks = tasks_result.scalars().all()

        task_ids = [task.id for task in tasks]

        if task_ids and data.user_ids:
            from core.database.models import TaskHistory
            delete_user_history_stmt = delete(TaskHistory).where(
                TaskHistory.task_id.in_(task_ids),
                TaskHistory.user_id.in_(data.user_ids)
            )
            await session.execute(delete_user_history_stmt)

        for task in tasks:
            current_assignees = list(task.assignees)
            
            users_to_remove_from_task = [user for user in current_assignees if user.id in data.user_ids]
            
            for user in users_to_remove_from_task:
                task.assignees.remove(user)
            
            if not task.assignees:
                from core.database.models import TaskHistory
                delete_task_history_stmt = delete(TaskHistory).where(
                    TaskHistory.task_id == task.id
                )
                await session.execute(delete_task_history_stmt)
                await session.delete(task)

        delete_members_stmt = delete(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id.in_(data.user_ids)
        )
        result = await session.execute(delete_members_stmt)
        
        if result.rowcount == 0:
            raise UserNotFoundInGroupError()

        remaining_members_stmt = select(GroupMember).where(GroupMember.group_id == group_id)
        remaining_members_result = await session.execute(remaining_members_stmt)
        remaining_members = remaining_members_result.scalars().all()
        
        if not remaining_members:
            await delete_group_auto(session, group_id)
            raise GroupDeleteError("Группа удалена, так как в ней не осталось участников")

        await session.commit()

        return await get_group_by_id(session, group_id)

    except (GroupNotFoundError, InsufficientPermissionsError, UserNotFoundInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось удалить пользователей из группы: {str(e)}")

# Автоматически удалить группу
async def delete_group_auto(
    session: AsyncSession,
    group_id: int
) -> bool:
    try:
        group_stmt = select(Group).options(
            selectinload(Group.tasks),
            selectinload(Group.projects),
            selectinload(Group.group_members)
        ).where(Group.id == group_id)
        
        group_result = await session.execute(group_stmt)
        group = group_result.scalar_one_or_none()
        
        if not group:
            return True

        task_ids = [task.id for task in group.tasks]
        if task_ids:
            from core.database.models import TaskHistory
            delete_history_stmt = delete(TaskHistory).where(
                TaskHistory.task_id.in_(task_ids)
            )
            await session.execute(delete_history_stmt)

        if task_ids:
            delete_user_associations_stmt = delete(task_user_association).where(
                task_user_association.c.task_id.in_(task_ids)
            )
            await session.execute(delete_user_associations_stmt)

        for task in group.tasks:
            await session.delete(task)

        project_ids = [project.id for project in group.projects]

        delete_project_links_stmt = delete(project_group_association).where(
            project_group_association.c.group_id == group_id
        )
        await session.execute(delete_project_links_stmt)

        for membership in group.group_members:
            await session.delete(membership)

        await session.delete(group)

        for project_id in project_ids:
            remaining_groups_stmt = select(project_group_association).where(
                project_group_association.c.project_id == project_id
            )
            remaining_groups_result = await session.execute(remaining_groups_stmt)
            remaining_groups = remaining_groups_result.all()
            
            if not remaining_groups:
                await delete_project_auto(session, project_id)

        await session.commit()
        return True

    except Exception as e:
        await session.rollback()
        raise GroupDeleteError(f"Не удалось автоматически удалить группу: {str(e)}")

# Удалить группу
async def delete_group(
    session: AsyncSession,
    group_id: int,
    current_user: User
) -> bool:
    try:
        group_stmt = select(Group).where(Group.id == group_id)
        group_result = await session.execute(group_stmt)
        group = group_result.scalar_one_or_none()
        
        if not group:
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group_id)

        await delete_group_auto(session, group_id)
        await session.commit()

        return True

    except (GroupNotFoundError, InsufficientPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupDeleteError(f"Не удалось удалить группу: {str(e)}")