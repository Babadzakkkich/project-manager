from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, and_
from sqlalchemy.orm import selectinload

from modules.groups.exceptions import InsufficientPermissionsError
from core.utils.dependencies import ensure_user_is_admin, check_user_in_group, ensure_user_is_super_admin_global
from core.database.models import Task, Project, User, Group, GroupMember, TaskHistory, TaskStatus, TaskPriority
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead, TaskBulkUpdate
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

# Получить все задачи (только для супер-админа)
async def get_all_tasks(session: AsyncSession, current_user_id: int) -> list[TaskRead]:
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()

# Получить задачи пользователя
async def get_user_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
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

    for task in tasks:
        if task.group and task.group.group_members:
            task.group.users = []
            for group_member in task.group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                task.group.users.append(user_with_role)
    
    return tasks

# Получить задачу по ID
async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskReadWithRelations:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise TaskNotFoundError(task_id)

    if task.group and task.group.group_members:
        task.group.users = []
        for group_member in task.group.group_members:
            user_with_role = group_member.user
            user_with_role.role = group_member.role.value
            task.group.users.append(user_with_role)
    
    return task

# Получить задачи команд (где пользователь администратор)
async def get_team_tasks(session: AsyncSession, user_id: int) -> list[TaskReadWithRelations]:
    from modules.groups.service import get_user_groups
    user_groups = await get_user_groups(session, user_id)
    
    admin_groups = []
    for group in user_groups:
        for user in group.users:
            if user.id == user_id and user.role in ['admin', 'super_admin']:
                admin_groups.append(group)
                break

    if not admin_groups:
        return []

    admin_group_ids = [group.id for group in admin_groups]

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

    for task in tasks:
        if task.group and task.group.group_members:
            task.group.users = []
            for group_member in task.group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                task.group.users.append(user_with_role)
    
    return tasks

# Создать новую задачу
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

        if not await check_user_in_group(session, current_user.id, task_data.group_id):
            raise TaskAccessDeniedError("Вы не состоите в указанной группе")

        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            priority=task_data.priority,
            start_date=task_data.start_date,
            deadline=task_data.deadline,
            project_id=task_data.project_id,
            group_id=task_data.group_id,
            tags=task_data.tags
        )
        
        new_task.assignees.append(current_user)

        session.add(new_task)
        await session.commit()
        
        return await get_task_by_id(session, new_task.id)

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")

# Создать задачу для указанных пользователей
async def create_task_for_users(
    session: AsyncSession,
    task_data: TaskCreate,
    assignee_ids: List[int],
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

        is_admin = False
        try:
            await ensure_user_is_admin(session, current_user.id, task_data.group_id)
            is_admin = True
        except InsufficientPermissionsError:
            if len(assignee_ids) > 1 or (assignee_ids and assignee_ids[0] != current_user.id):
                raise TaskAccessDeniedError("Только администраторы могут создавать задачи для других пользователей")

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

        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            priority=task_data.priority,
            start_date=task_data.start_date,
            deadline=task_data.deadline,
            project_id=task_data.project_id,
            group_id=task_data.group_id,
            tags=task_data.tags
        )

        if assignee_ids:
            users_stmt = select(User).where(User.id.in_(assignee_ids))
            users_result = await session.execute(users_stmt)
            users = users_result.scalars().all()
            
            for user in users:
                new_task.assignees.append(user)
        else:
            new_task.assignees.append(current_user)

        session.add(new_task)
        await session.commit()
        
        return await get_task_by_id(session, new_task.id)

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
            TaskAccessDeniedError, UsersNotInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")

# Добавить пользователей в задачу
async def add_users_to_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask,
    current_user: User
) -> TaskReadWithRelations:
    try:
        task = await get_task_by_id(session, task_id)

        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

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
        
        return await get_task_by_id(session, task_id)

    except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось добавить пользователей в задачу: {str(e)}")

# Обновить задачу
async def update_task(
    session: AsyncSession,
    db_task: Task,
    task_update: TaskUpdate,
    current_user: User
) -> TaskRead:
    try:
        is_assignee = any(u.id == current_user.id for u in db_task.assignees)
        
        if not is_assignee:
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

# Удалить пользователей из задачи (только для администраторов группы)
async def remove_users_from_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask,
    current_user: User
) -> dict:
    try:
        task = await get_task_by_id(session, task_id)

        if not task.group:
            raise TaskNoGroupError()

        await ensure_user_is_admin(session, current_user.id, task.group.id)

        users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
        if not users_to_remove:
            raise UsersNotInTaskError(data.user_ids)

        for user in users_to_remove:
            task.assignees.remove(user)

        if not task.assignees:
            delete_history_stmt = delete(TaskHistory).where(TaskHistory.task_id == task_id)
            await session.execute(delete_history_stmt)
            
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

# Удалить задачу
async def delete_task(session: AsyncSession, task_id: int, current_user: User) -> bool:
    try:
        db_task = await get_task_by_id(session, task_id)

        if not db_task.group_id:
            raise TaskNoGroupError()

        is_assignee = any(u.id == current_user.id for u in db_task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, db_task.group_id)

        stmt_history = select(TaskHistory).where(TaskHistory.task_id == task_id)
        result_history = await session.execute(stmt_history)
        history_entries = result_history.scalars().all()
        
        for history_entry in history_entries:
            await session.delete(history_entry)

        await session.delete(db_task)
        await session.commit()
        return True

    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskDeleteError(f"Не удалось удалить задачу: {str(e)}")
    
# Получить задачи для Kanban доски проекта
async def get_project_board_tasks(
    session: AsyncSession,
    project_id: int,
    group_id: int,
    view_mode: str,
    current_user: User
) -> List[TaskReadWithRelations]:
    try:
        stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        result_project = await session.execute(stmt_project)
        project = result_project.scalar_one_or_none()

        if not project:
            raise ProjectNotFoundError(project_id)

        stmt_group = select(Group).where(Group.id == group_id)
        result_group = await session.execute(stmt_group)
        group = result_group.scalar_one_or_none()

        if not group:
            raise GroupNotFoundError(group_id)

        if group not in project.groups:
            raise GroupNotInProjectError(group_id, project_id)

        if not await check_user_in_group(session, current_user.id, group_id):
            raise TaskAccessDeniedError("Вы не состоите в указанной группе")

        stmt = (
            select(Task)
            .where(
                and_(
                    Task.project_id == project_id,
                    Task.group_id == group_id
                )
            )
            .options(
                selectinload(Task.project),
                selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
                selectinload(Task.assignees)
            )
        )

        if view_mode == "personal":
            stmt = stmt.join(Task.assignees).where(User.id == current_user.id)

        stmt = stmt.order_by(Task.status, Task.position, Task.created_at)

        result = await session.execute(stmt)
        tasks = result.scalars().unique().all()

        for task in tasks:
            if task.group and task.group.group_members:
                task.group.users = []
                for group_member in task.group.group_members:
                    user_with_role = group_member.user
                    user_with_role.role = group_member.role.value
                    task.group.users.append(user_with_role)

        return tasks

    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError):
        raise
    except Exception as e:
        raise TaskUpdateError(f"Не удалось загрузить доску проекта: {str(e)}")

# Обновить статус задачи
async def update_task_status(
    session: AsyncSession,
    task_id: int,
    new_status: TaskStatus,
    current_user: User
) -> TaskRead:
    try:
        task = await get_task_by_id(session, task_id)

        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

        old_status = task.status
        task.status = new_status

        history_entry = TaskHistory(
            task_id=task_id,
            user_id=current_user.id,
            action="status_change",
            old_value=old_status.value,
            new_value=new_status.value
        )
        session.add(history_entry)

        await session.commit()
        await session.refresh(task)
        return task

    except (TaskNotFoundError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось обновить статус задачи: {str(e)}")

# Обновить позицию задачи в колонке
async def update_task_position(
    session: AsyncSession,
    task_id: int,
    new_position: int,
    current_user: User
) -> TaskRead:
    try:
        task = await get_task_by_id(session, task_id)

        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

        task.position = new_position

        await session.commit()
        await session.refresh(task)
        return task

    except (TaskNotFoundError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось обновить позицию задачи: {str(e)}")

# Обновить приоритет задачи
async def update_task_priority(
    session: AsyncSession,
    task_id: int,
    new_priority: TaskPriority,
    current_user: User
) -> TaskRead:
    try:
        task = await get_task_by_id(session, task_id)

        is_assignee = any(u.id == current_user.id for u in task.assignees)
        if not is_assignee:
            await ensure_user_is_admin(session, current_user.id, task.group_id)

        old_priority = task.priority
        task.priority = new_priority

        history_entry = TaskHistory(
            task_id=task_id,
            user_id=current_user.id,
            action="priority_change",
            old_value=old_priority.value,
            new_value=new_priority.value
        )
        session.add(history_entry)

        await session.commit()
        await session.refresh(task)
        return task

    except (TaskNotFoundError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось обновить приоритет задачи: {str(e)}")

# Массовое обновление задач (для drag & drop)
async def bulk_update_tasks(
    session: AsyncSession,
    updates: List[TaskBulkUpdate],
    current_user: User
) -> List[TaskRead]:
    try:
        updated_tasks = []
        
        for update in updates:
            task = await get_task_by_id(session, update.task_id)

            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(session, current_user.id, task.group_id)

            if update.status is not None:
                old_status = task.status
                task.status = update.status
                
                history_entry = TaskHistory(
                    task_id=task.id,
                    user_id=current_user.id,
                    action="status_change",
                    old_value=old_status.value,
                    new_value=update.status.value
                )
                session.add(history_entry)

            if update.position is not None:
                task.position = update.position

            if update.priority is not None:
                old_priority = task.priority
                task.priority = update.priority
                
                history_entry = TaskHistory(
                    task_id=task.id,
                    user_id=current_user.id,
                    action="priority_change",
                    old_value=old_priority.value,
                    new_value=update.priority.value
                )
                session.add(history_entry)

            updated_tasks.append(task)

        await session.commit()
        
        for task in updated_tasks:
            await session.refresh(task)
            
        return updated_tasks

    except (TaskNotFoundError, TaskAccessDeniedError):
        raise
    except Exception as e:
        await session.rollback()
        raise TaskUpdateError(f"Не удалось выполнить массовое обновление: {str(e)}")

# Быстрое создание задачи
async def quick_create_task(
    session: AsyncSession,
    task_data: TaskCreate,
    current_user: User
) -> TaskReadWithRelations:
    try:
        return await create_task_for_users(
            session, 
            task_data, 
            [current_user.id], 
            current_user
        )
        
    except Exception as e:
        await session.rollback()
        raise TaskCreationError(f"Не удалось быстро создать задачу: {str(e)}")

# Получить историю изменений задачи
async def get_task_history(
    session: AsyncSession,
    task_id: int
) -> List[TaskHistory]:
    stmt = (
        select(TaskHistory)
        .options(selectinload(TaskHistory.user))
        .where(TaskHistory.task_id == task_id)
        .order_by(TaskHistory.created_at.desc())
    )
    
    result = await session.execute(stmt)
    return result.scalars().all()