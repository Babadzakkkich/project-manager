from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.database.models import Group, Project, Task, User, group_user_association
from core.utils.dependencies import ensure_user_is_admin, get_user_group_role
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

async def get_all_groups(session: AsyncSession) -> list[GroupRead]:
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_group_by_id(session: AsyncSession, group_id: int) -> GroupReadWithRelations:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()
    
    if not group:
        raise GroupNotFoundError(group_id=group_id)
    
    # Загружаем роли пользователей из ассоциативной таблицы
    roles_stmt = select(
        group_user_association.c.user_id, 
        group_user_association.c.role
    ).where(group_user_association.c.group_id == group_id)
    
    roles_result = await session.execute(roles_stmt)
    roles = {row[0]: row[1] for row in roles_result.all()}
    
    # Добавляем роли к пользователям
    for user in group.users:
        user.role = roles.get(user.id, 'member')
    
    return group

async def get_user_groups(session: AsyncSession, user_id: int) -> list[GroupReadWithRelations]:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).join(Group.users).where(User.id == user_id).order_by(Group.id)
    
    result = await session.execute(stmt)
    groups = result.scalars().all()
    
    # Для каждой группы загружаем роли пользователей
    for group in groups:
        roles_stmt = select(
            group_user_association.c.user_id, 
            group_user_association.c.role
        ).where(group_user_association.c.group_id == group.id)
        
        roles_result = await session.execute(roles_stmt)
        roles = {row[0]: row[1] for row in roles_result.all()}
        
        # Добавляем роли к пользователям
        for user in group.users:
            user.role = roles.get(user.id, 'member')
    
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
        
        await session.execute(
            group_user_association.insert().values(
                group_id=new_group.id,
                user_id=current_user.id,
                role="admin"
            )
        )

        await session.commit()
        
        # Перезагружаем группу с отношениями и ролями
        stmt = select(Group).options(
            selectinload(Group.users),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).where(Group.id == new_group.id)

        result = await session.execute(stmt)
        group = result.scalar_one()
        
        # Загружаем роли
        roles_stmt = select(
            group_user_association.c.user_id, 
            group_user_association.c.role
        ).where(group_user_association.c.group_id == group.id)
        
        roles_result = await session.execute(roles_stmt)
        roles = {row[0]: row[1] for row in roles_result.all()}
        
        # Добавляем роли к пользователям
        for user in group.users:
            user.role = roles.get(user.id, 'member')
        
        return group

    except (GroupAlreadyExistsError, InsufficientPermissionsError):
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
        stmt = select(Group).options(
            selectinload(Group.users),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()
        
        if not group:
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group.id)

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

            if role not in ["admin", "member"]:
                raise InvalidRoleError(role, ["admin", "member"])

            existing_entry = await session.execute(
                select(group_user_association.c.user_id)
                .where(
                    group_user_association.c.user_id == user.id,
                    group_user_association.c.group_id == group.id
                )
            )
            existing_user_id = existing_entry.scalar_one_or_none()

            if existing_user_id:
                raise UserAlreadyInGroupError(user_email, group.id)

            await session.execute(
                group_user_association.insert().values(
                    user_id=user.id,
                    group_id=group.id,
                    role=role
                )
            )

        await session.commit()
        
        # Перезагружаем группу с отношениями
        stmt = select(Group).options(
            selectinload(Group.users),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).where(Group.id == group_id)
        result = await session.execute(stmt)
        updated_group = result.scalar_one()
        
        # Загружаем роли пользователей из ассоциативной таблицы
        roles_stmt = select(
            group_user_association.c.user_id, 
            group_user_association.c.role
        ).where(group_user_association.c.group_id == group_id)
        
        roles_result = await session.execute(roles_stmt)
        roles = {row[0]: row[1] for row in roles_result.all()}
        
        # Добавляем роли к пользователям
        for user in updated_group.users:
            user.role = roles.get(user.id, 'member')
        
        return updated_group

    except (GroupNotFoundError, InsufficientPermissionsError, UsersNotFoundError, 
            UserAlreadyInGroupError, InvalidRoleError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось добавить пользователей в группу: {str(e)}")

async def change_user_role(
    session: AsyncSession,
    current_user_id: int,
    group_id: int,
    user_email: str,  # ✅ Принимаем email вместо user_id
    new_role: str
):
    try:
        await ensure_user_is_admin(session, current_user_id, group_id)

        if new_role not in ["admin", "member"]:
            raise InvalidRoleError(new_role, ["admin", "member"])

        # Находим пользователя по email
        user_stmt = select(User).where(User.email == user_email)
        user_result = await session.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise UserNotFoundInGroupError(user_email=user_email)

        # Обновляем роль
        stmt = (
            group_user_association.update()
            .where(
                group_user_association.c.user_id == user.id,
                group_user_association.c.group_id == group_id
            )
            .values(role=new_role)
        )
        result = await session.execute(stmt)
        await session.commit()

        if result.rowcount == 0:
            raise UserNotFoundInGroupError(user_email=user_email)

        return {"detail": "Роль успешно изменена"}

    except (InsufficientPermissionsError, InvalidRoleError):
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
        
        # Перезагружаем группу с отношениями
        stmt = select(Group).options(
            selectinload(Group.users),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).where(Group.id == db_group.id)
        result = await session.execute(stmt)
        updated_group = result.scalar_one()
        
        # Загружаем роли пользователей из ассоциативной таблицы
        roles_stmt = select(
            group_user_association.c.user_id, 
            group_user_association.c.role
        ).where(group_user_association.c.group_id == db_group.id)
        
        roles_result = await session.execute(roles_stmt)
        roles = {row[0]: row[1] for row in roles_result.all()}
        
        # Добавляем роли к пользователям
        for user in updated_group.users:
            user.role = roles.get(user.id, 'member')
        
        return updated_group

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
        # --- ИЗМЕНЕНО: Перезагрузим группу с НЕОБХОДИМЫМИ вложенными связями ---
        # Нам нужны: пользователи группы, проекты группы, задачи проектов, исполнители задач
        stmt = select(Group).options(
            selectinload(Group.users), # Пользователи группы
            selectinload(Group.projects).selectinload(Project.tasks).selectinload(Task.assignees), # Проекты -> Задачи -> Исполнители
            # Загружаем задачи самой группы тоже, если они могут быть затронуты
            selectinload(Group.tasks).selectinload(Task.assignees)
        ).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group.id)

        users_to_remove = [u for u in group.users if u.id in data.user_ids]
        if not users_to_remove:
            raise UserNotFoundInGroupError()

        user_ids_to_remove = {u.id for u in users_to_remove}

        # Удаление пользователей из задач в проектах группы
        for project in group.projects:
            for task in list(project.tasks): # list() делает снимок, чтобы избежать проблем с итерацией при модификации
                # task.assignees уже загружены благодаря selectinload(Project.tasks).selectinload(Task.assignees)
                new_assignees = [u for u in task.assignees if u.id not in user_ids_to_remove]

                if not new_assignees:
                    # Если у задачи не осталось исполнителей, удаляем задачу
                    await session.delete(task)
                else:
                    # SQLAlchemy: изменение отношения many-to-many требует прямого изменения коллекции
                    # Однако, прямое присвоение списка может не сработать корректно с ORM.
                    # Лучше удалить старые связи и добавить новые.
                    # Но так как assignees - это список объектов User, присвоение может сработать.
                    # Проверим: task.assignees = new_assignees
                    # Это может сработать, но лучше быть уверенным.
                    # Удаляем старые связи
                    task.assignees.clear() # Очищаем текущий список assignees для этой задачи в сессии
                    # Добавляем новые
                    task.assignees.extend(new_assignees) # Добавляем новых assignees

        # Удаление пользователей из задач, принадлежащих самой группе (если таковые есть)
        for task in list(group.tasks):
            new_assignees = [u for u in task.assignees if u.id not in user_ids_to_remove]
            if not new_assignees:
                await session.delete(task)
            else:
                task.assignees.clear()
                task.assignees.extend(new_assignees)

        # Удаление пользователей из самой группы
        for user in users_to_remove:
            group.users.remove(user)

        await session.commit()

        # --- ИЗМЕНЕНО: Перезагружаем группу с отношениями и ролями ---
        # Используем get_group_by_id, который уже правильно загружает связи и добавляет роли
        updated_group = await get_group_by_id(session, group_id)
        # Роли уже добавлены в get_group_by_id

        return updated_group

    except (GroupNotFoundError, InsufficientPermissionsError, UserNotFoundInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupUpdateError(f"Не удалось удалить пользователей из группы: {str(e)}")

async def delete_group(
    session: AsyncSession,
    group_id: int,
    current_user: User
) -> bool:
    try:
        stmt = (
            select(Group)
            .options(
                selectinload(Group.projects).selectinload(Project.groups),
                selectinload(Group.tasks)
            )
            .where(Group.id == group_id)
        )
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()
        if not group:
            raise GroupNotFoundError(group_id=group_id)

        await ensure_user_is_admin(session, current_user.id, group.id)

        # Удаляем связанные задачи (если есть)
        for task in list(group.tasks):
            await session.delete(task)

        # Удаляем связь с проектами без ленивых подзагрузок
        for project in list(group.projects):
            if group in project.groups:
                project.groups.remove(group)

        # Удаляем саму группу
        await session.delete(group)
        await session.commit()

        return True

    except (GroupNotFoundError, InsufficientPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise GroupDeleteError(f"Не удалось удалить группу: {str(e)}")