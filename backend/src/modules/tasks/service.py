from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.utils.dependencies import ensure_user_is_admin, check_user_in_group
from core.database.models import Task, Project, User, Group, group_user_association
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead
from .exceptions import (
    TaskNotFoundError,
    TaskCreationError,
    TaskUpdateError,
    TaskDeleteError,
    ProjectNotFoundError,
    GroupNotFoundError,
    GroupNotInProjectError,
    UsersNotInGroupError,
    UsersNotInTaskError,
    TaskNoGroupError,
    TaskAccessDeniedError
)

async def get_all_tasks(session: AsyncSession) -> list[TaskRead]:
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
    stmt = (
        select(Task)
        .join(Task.assignees)
        .where(User.id == user_id)
        .options(
            selectinload(Task.project),
            # --- ИЗМЕНЕНО: Загружаем группу И её пользователей ---
            selectinload(Task.group).selectinload(Group.users),
            # --- КОНЕЦ ИЗМЕНЕНИЯ ---
            selectinload(Task.assignees)
        )
        .order_by(Task.created_at.desc())
    )

    result = await session.execute(stmt)
    tasks = result.scalars().unique().all()

    # --- НОВАЯ ЛОГИКА: Добавление ролей к пользователям в группах задач ---
    # Это нужно, потому что GroupReadForTask ожидает UserWithRole
    for task in tasks:
        if task.group and task.group.users: # Убедимся, что группа и пользователи загружены
            # Запрос ролей пользователей в текущей группе задачи
            roles_stmt = select(
                group_user_association.c.user_id,
                group_user_association.c.role
            ).where(
                group_user_association.c.group_id == task.group.id
            )
            roles_result = await session.execute(roles_stmt)
            roles_map = {row[0]: row[1] for row in roles_result.all()} # {user_id: role}

            # Присваиваем роль как атрибут каждому пользователю в группе задачи
            for user in task.group.users:
                user.role = roles_map.get(user.id, 'member') # Если роли нет, по умолчанию 'member'
    # --- КОНЕЦ НОВОЙ ЛОГИКИ ---

    return tasks

async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskReadWithRelations:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group).selectinload(Group.users) # Загружаем группу и её пользователей
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise TaskNotFoundError(task_id)

    # --- НОВАЯ ЛОГИКА: Добавление ролей к пользователям в группе задачи ---
    if task.group and task.group.users:
        roles_stmt = select(
            group_user_association.c.user_id,
            group_user_association.c.role
        ).where(
            group_user_association.c.group_id == task.group.id
        )
        roles_result = await session.execute(roles_stmt)
        roles_map = {row[0]: row[1] for row in roles_result.all()}

        for user in task.group.users:
            user.role = roles_map.get(user.id, 'member')
    # --- КОНЕЦ НОВОЙ ЛОГИКИ ---
    
    return task

async def get_team_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
    # Получаем группы, где пользователь является администратором
    from modules.groups.service import get_user_groups
    user_groups = await get_user_groups(session, user_id)
    admin_groups = [group for group in user_groups if
               any(u.id == user_id and u.role == 'admin' for u in group.users)]

    if not admin_groups:
        return []

    # Получаем ID админских групп
    admin_group_ids = [group.id for group in admin_groups]

    # Получаем задачи из админских групп
    stmt = (
        select(Task)
        .where(Task.group_id.in_(admin_group_ids))
        .options(
            selectinload(Task.project),
            selectinload(Task.group).selectinload(Group.users), # Загружаем группу и её пользователей
            selectinload(Task.assignees)
        )
        .order_by(Task.created_at.desc())
    )

    result = await session.execute(stmt)
    tasks = result.scalars().unique().all()

    # --- НОВАЯ ЛОГИКА: Добавление ролей к пользователям в группах задач ---
    for task in tasks:
        if task.group and task.group.users: # Убедимся, что группа и пользователи загружены
            # Запрос ролей пользователей в текущей группе задачи
            roles_stmt = select(
                group_user_association.c.user_id,
                group_user_association.c.role
            ).where(
                group_user_association.c.group_id == task.group.id
            )
            roles_result = await session.execute(roles_stmt)
            roles_map = {row[0]: row[1] for row in roles_result.all()} # {user_id: role}

            # Присваиваем роль как атрибут каждому пользователю в группе задачи
            for user in task.group.users:
                user.role = roles_map.get(user.id, 'member') # Если роли нет, по умолчанию 'member'
    # --- КОНЕЦ НОВОЙ ЛОГИКИ ---

    return tasks

async def create_task(
    session: AsyncSession,
    task_data: TaskCreate,
    current_user: User
) -> TaskReadWithRelations:
    try:
        stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == task_data.project_id)
        result_project = await session.execute(stmt_project)
        project = result_project.scalar_one_or_none()

        if not project:
            raise ProjectNotFoundError(task_data.project_id)

        stmt_group = select(Group).where(Group.id == task_data.group_id)
        result_group = await session.execute(stmt_group)
        group = result_group.scalar_one_or_none()

        if not group:
            raise GroupNotFoundError(task_data.group_id)

        if group not in project.groups:
            raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

        new_task = Task(**task_data.model_dump(exclude={"project_id", "group_id"}))
        new_task.project_id = task_data.project_id
        new_task.group_id = task_data.group_id
        new_task.assignees.append(current_user)

        session.add(new_task)
        await session.commit()
        await session.refresh(new_task)

        # --- ИЗМЕНЕНО: Загружаем также пользователей группы ---
        stmt = select(Task).options(
            selectinload(Task.project),
            selectinload(Task.group).selectinload(Group.users), # Загружаем группу и её пользователей
            selectinload(Task.assignees)
        ).where(Task.id == new_task.id)
        result = await session.execute(stmt)
        created_task = result.scalar_one()

        # --- НОВАЯ ЛОГИКА: Добавление ролей к пользователям в группе новой задачи ---
        if created_task.group and created_task.group.users:
            roles_stmt = select(
                group_user_association.c.user_id,
                group_user_association.c.role
            ).where(
                group_user_association.c.group_id == created_task.group.id
            )
            roles_result = await session.execute(roles_stmt)
            roles_map = {row[0]: row[1] for row in roles_result.all()}

            for user in created_task.group.users:
                user.role = roles_map.get(user.id, 'member')
        # --- КОНЕЦ НОВОЙ ЛОГИКИ ---

        return created_task

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")

async def add_users_to_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask,
    current_user: User
) -> TaskReadWithRelations:
    try:
        task = await get_task_by_id(session, task_id) # Использует обновленную версию get_task_by_id

        # Разрешаем добавление пользователей администраторам группы и исполнителям задачи
        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

        valid_users_query = (
            select(User.id)
            .join(Group.users)
            .where(Group.id == task.group_id)
            .where(User.id.in_(data.user_ids))
        )
        result_valid_users = await session.execute(valid_users_query)
        valid_user_ids = {u[0] for u in result_valid_users}

        if len(valid_user_ids) != len(data.user_ids):
            invalid_ids = set(data.user_ids) - valid_user_ids
            raise UsersNotInGroupError(list(invalid_ids))

        users_stmt = select(User).where(User.id.in_(data.user_ids))
        users_result = await session.execute(users_stmt)
        users = users_result.scalars().all()

        for user in users:
            if user not in task.assignees:
                task.assignees.append(user)

        await session.commit()
        await session.refresh(task)

        return task

    except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось добавить пользователей в задачу: {str(e)}")

async def update_task(
    session: AsyncSession,
    db_task: Task,
    task_update: TaskUpdate,
    current_user: User
) -> TaskRead:
    try:
        # Разрешаем обновление задачи исполнителям и администраторам группы
        is_assignee = any(u.id == current_user.id for u in db_task.assignees)
        
        if not is_assignee:
            # Если пользователь не исполнитель, проверяем права администратора
            await ensure_user_is_admin(session, current_user.id, db_task.group_id)

        for key, value in task_update.model_dump(exclude_unset=True).items():
            setattr(db_task, key, value)

        await session.commit()
        await session.refresh(db_task)
        return db_task

    except (TaskAccessDeniedError, TaskNotFoundError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось обновить задачу: {str(e)}")

async def remove_users_from_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask,
    current_user: User
) -> Optional[TaskReadWithRelations]:
    try:
        task = await get_task_by_id(session, task_id) # Использует обновленную версию get_task_by_id

        if not task.group:
            raise TaskNoGroupError()

        # Разрешаем удаление пользователей исполнителям и администраторам группы
        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group.id)

        users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
        if not users_to_remove:
            raise UsersNotInTaskError(data.user_ids)

        # Проверяем, не пытается ли пользователь удалить самого себя
        # (это разрешено, но если удаляются все исполнители - задача удаляется)
        for user in users_to_remove:
            task.assignees.remove(user)

        # Если после удаления не осталось исполнителей, удаляем задачу
        if not task.assignees:
            await session.delete(task)
            await session.commit()
            return None

        await session.commit()
        await session.refresh(task)
        return task

    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось удалить пользователей из задачи: {str(e)}")

async def delete_task(session: AsyncSession, task_id: int, current_user: User) -> bool:
    try:
        db_task = await get_task_by_id(session, task_id) # Использует обновленную версию get_task_by_id

        if not db_task.group_id:
            raise TaskNoGroupError()

        # Проверяем, может ли пользователь удалить задачу
        is_assignee = any(u.id == current_user.id for u in db_task.assignees)
        if not is_assignee:
            # Проверяем наличие прав администратора
            await ensure_user_is_admin(session, current_user.id, db_task.group_id)

        await session.delete(db_task)
        await session.commit()
        return True

    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskDeleteError(f"Не удалось удалить задачу: {str(e)}")