from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from core.database.models import Task, Project, User, Group
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead


async def get_all_tasks(session: AsyncSession) -> list[TaskRead]:
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskReadWithRelations | None:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def create_task(session: AsyncSession, task_data: TaskCreate) -> TaskReadWithRelations:
    stmt_project = select(Project).options(
        selectinload(Project.groups)
    ).where(Project.id == task_data.project_id)

    result_project = await session.execute(stmt_project)
    project = result_project.scalar_one_or_none()

    if not project:
        raise ValueError("Проект не найден")

    stmt_group = select(Group).where(Group.id == task_data.group_id)
    result_group = await session.execute(stmt_group)
    group = result_group.scalar_one_or_none()

    if not group:
        raise ValueError("Группа не найдена")

    if group not in project.groups:
        raise ValueError("Группа не привязана к проекту")

    valid_users_query = (
        select(User.id)
        .join(Group.users)
        .where(Group.id == group.id)
        .where(User.id.in_(task_data.assignee_ids))
    )
    result_valid_users = await session.execute(valid_users_query)
    valid_user_ids = {u[0] for u in result_valid_users}

    if len(valid_user_ids) != len(task_data.assignee_ids):
        invalid_ids = set(task_data.assignee_ids) - valid_user_ids
        raise ValueError(f"Пользователи {invalid_ids} не состоят в группе")

    stmt_users = select(User).where(User.id.in_(task_data.assignee_ids))
    result_users = await session.execute(stmt_users)
    users = result_users.scalars().all()

    new_task = Task(**task_data.model_dump(exclude={"assignee_ids", "project_id", "group_id"}))
    new_task.project = project
    new_task.group = group 
    new_task.assignees = users

    session.add(new_task)
    await session.commit()
    await session.refresh(new_task)

    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group)
    ).where(Task.id == new_task.id)

    result = await session.execute(stmt)
    return result.scalar_one()

async def add_users_to_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask
) -> TaskReadWithRelations:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise ValueError("Задача не найдена")

    group = task.group
    if not group:
        raise ValueError("Задача не закреплена за группой")

    valid_users_query = (
        select(User.id)
        .join(Group.users)
        .where(Group.id == group.id)
        .where(User.id.in_(data.user_ids))
    )
    result_valid_users = await session.execute(valid_users_query)
    valid_user_ids = {u[0] for u in result_valid_users}

    if len(valid_user_ids) != len(data.user_ids):
        invalid_ids = set(data.user_ids) - valid_user_ids
        raise ValueError(f"Пользователи {invalid_ids} не состоят в группе задачи")

    users_stmt = select(User).where(User.id.in_(data.user_ids))
    users_result = await session.execute(users_stmt)
    users = users_result.scalars().all()

    for user in users:
        if user not in task.assignees:
            task.assignees.append(user)

    await session.commit()
    await session.refresh(task)

    return task

async def update_task(
    session: AsyncSession,
    db_task: Task,
    task_update: TaskUpdate
) -> TaskRead:
    for key, value in task_update.model_dump(exclude_unset=True).items():
        setattr(db_task, key, value)

    await session.commit()
    await session.refresh(db_task)
    return db_task

async def remove_users_from_task(
    session: AsyncSession,
    task_id: int,
    data: AddRemoveUsersToTask
) -> Optional[TaskReadWithRelations]:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees),
        selectinload(Task.group)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise ValueError("Задача не найдена")

    group = task.group
    if not group:
        raise ValueError("Задача не закреплена за группой")

    users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
    if not users_to_remove:
        raise ValueError("Нет таких пользователей в задаче")

    for user in users_to_remove:
        task.assignees.remove(user)

    if not task.assignees:
        await session.delete(task)
        await session.commit()
        return None 

    await session.commit()
    await session.refresh(task)
    
    return task 

async def delete_task(session: AsyncSession, task_id: int) -> bool:
    db_task = await get_task_by_id(session, task_id)
    if not db_task:
        return False

    for user in list(db_task.assignees):
        db_task.assignees.remove(user)

    if db_task.group:
        db_task.group = None

    await session.delete(db_task)
    await session.commit()
    return True