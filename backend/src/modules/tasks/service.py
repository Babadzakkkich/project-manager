from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from modules.groups.exceptions import InsufficientPermissionsError
from core.utils.dependencies import ensure_user_is_admin, check_user_in_group, ensure_user_is_super_admin_global
from core.database.models import Task, Project, User, Group, GroupMember
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

async def get_all_tasks(session: AsyncSession, current_user_id: int) -> list[TaskRead]:
    """Получить все задачи (только для супер-админа)"""
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
    """Получить задачи пользователя"""
    stmt = (
        select(Task)
        .join(Task.assignees)
        .where(User.id == user_id)
        .options(
            selectinload(Task.project),
            selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Task.assignees)
        )
        .order_by(Task.created_at.desc())
    )

    result = await session.execute(stmt)
    tasks = result.scalars().unique().all()

    # Преобразуем GroupMember в пользователей с ролями для каждой группы задачи
    for task in tasks:
        if task.group and task.group.group_members:
            task.group.users = []
            for group_member in task.group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                task.group.users.append(user_with_role)
    
    return tasks

async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskReadWithRelations:
    """Получить задачу по ID"""
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise TaskNotFoundError(task_id)

    # Преобразуем GroupMember в пользователей с ролями для группы задачи
    if task.group and task.group.group_members:
        task.group.users = []
        for group_member in task.group.group_members:
            user_with_role = group_member.user
            user_with_role.role = group_member.role.value
            task.group.users.append(user_with_role)
    
    return task

async def get_team_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
    """Получить задачи команд (где пользователь администратор)"""
    # Получаем группы, где пользователь является администратором
    from modules.groups.service import get_user_groups
    user_groups = await get_user_groups(session, user_id)
    
    # Фильтруем группы, где пользователь администратор
    admin_groups = []
    for group in user_groups:
        for user in group.users:
            if user.id == user_id and user.role in ['admin', 'super_admin']:
                admin_groups.append(group)
                break

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
            selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Task.assignees)
        )
        .order_by(Task.created_at.desc())
    )

    result = await session.execute(stmt)
    tasks = result.scalars().unique().all()

    # Преобразуем GroupMember в пользователей с ролями для каждой группы задачи
    for task in tasks:
        if task.group and task.group.group_members:
            task.group.users = []
            for group_member in task.group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                task.group.users.append(user_with_role)
    
    return tasks

async def create_task(
    session: AsyncSession,
    task_data: TaskCreate,
    current_user: User
) -> TaskReadWithRelations:
    """Создать новую задачу"""
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

        # Проверяем, что группа привязана к проекту
        if group not in project.groups:
            raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

        # Проверяем, что пользователь состоит в группе
        if not await check_user_in_group(session, current_user.id, task_data.group_id):
            raise TaskAccessDeniedError("Вы не состоите в указанной группе")

        new_task = Task(**task_data.model_dump(exclude={"project_id", "group_id"}))
        new_task.project_id = task_data.project_id
        new_task.group_id = task_data.group_id
        
        # Добавляем текущего пользователя как исполнителя по умолчанию
        new_task.assignees.append(current_user)

        session.add(new_task)
        await session.commit()
        
        # Загружаем задачу с полными отношениями
        return await get_task_by_id(session, new_task.id)

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")

async def create_task_for_users(
    session: AsyncSession,
    task_data: TaskCreate,  # Используем базовую схему, а не расширенную
    assignee_ids: List[int],
    current_user: User
) -> TaskReadWithRelations:
    """Создать задачу для указанных пользователей"""
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

        # Проверяем, что группа привязана к проекту
        if group not in project.groups:
            raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

        # Проверяем права пользователя - только администраторы могут создавать задачи для других
        is_admin = False
        try:
            await ensure_user_is_admin(session, current_user.id, task_data.group_id)
            is_admin = True
        except InsufficientPermissionsError:
            # Если не админ, проверяем что создает задачу только для себя
            if len(assignee_ids) > 1 or (assignee_ids and assignee_ids[0] != current_user.id):
                raise TaskAccessDeniedError("Только администраторы могут создавать задачи для других пользователей")

        # Проверяем, что все указанные пользователи состоят в группе
        if assignee_ids:
            valid_users_query = (
                select(User.id)
                .join(GroupMember)
                .where(GroupMember.group_id == task_data.group_id)
                .where(User.id.in_(assignee_ids))
            )
            result_valid_users = await session.execute(valid_users_query)
            valid_user_ids = {u[0] for u in result_valid_users}

            if len(valid_user_ids) != len(assignee_ids):
                invalid_ids = set(assignee_ids) - valid_user_ids
                raise UsersNotInGroupError(list(invalid_ids))

        # Создаем задачу без assignee_ids, так как этого поля нет в модели Task
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            start_date=task_data.start_date,
            deadline=task_data.deadline,
            project_id=task_data.project_id,
            group_id=task_data.group_id
        )

        # Добавляем исполнителей через связь many-to-many
        if assignee_ids:
            users_stmt = select(User).where(User.id.in_(assignee_ids))
            users_result = await session.execute(users_stmt)
            users = users_result.scalars().all()
            
            for user in users:
                new_task.assignees.append(user)
        else:
            # Если исполнители не указаны, добавляем текущего пользователя
            new_task.assignees.append(current_user)

        session.add(new_task)
        await session.commit()
        
        # Загружаем задачу с полными отношениями
        return await get_task_by_id(session, new_task.id)

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
            TaskAccessDeniedError, UsersNotInGroupError):
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
    """Добавить пользователей в задачу"""
    try:
        task = await get_task_by_id(session, task_id)

        # Разрешаем добавление пользователей администраторам группы и исполнителям задачи
        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

        # Проверяем, что пользователи состоят в группе задачи
        valid_users_query = (
            select(User.id)
            .join(GroupMember)
            .where(GroupMember.group_id == task.group_id)
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
        
        # Перезагружаем задачу с актуальными данными
        return await get_task_by_id(session, task_id)

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
    """Обновить задачу"""
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
) -> dict:
    """Удалить пользователей из задачи (только для администраторов группы)"""
    try:
        task = await get_task_by_id(session, task_id)

        if not task.group:
            raise TaskNoGroupError()

        # Разрешаем удаление пользователей ТОЛЬКО администраторам группы
        # Убираем возможность для обычных исполнителей удалять пользователей
        await ensure_user_is_admin(session, current_user.id, task.group.id)

        users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
        if not users_to_remove:
            raise UsersNotInTaskError(data.user_ids)

        # Удаляем пользователей из задачи
        for user in users_to_remove:
            task.assignees.remove(user)

        # Если после удаления не осталось исполнителей, удаляем задачу
        if not task.assignees:
            await session.delete(task)
            await session.commit()
            return {"detail": "Задача удалена, так как не осталось исполнителей"}

        await session.commit()
        
        return {"detail": "Пользователи успешно удалены из задачи"}

    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось удалить пользователей из задачи: {str(e)}")

async def delete_task(session: AsyncSession, task_id: int, current_user: User) -> bool:
    """Удалить задачу"""
    try:
        db_task = await get_task_by_id(session, task_id)

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