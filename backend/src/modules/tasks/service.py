from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from core.database.models import Task, Project, User, Group
from .schemas import TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead


async def get_all_tasks(session: AsyncSession) -> list[TaskRead]:
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskReadWithRelations | None:
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees)
    ).where(Task.id == task_id)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_task(session: AsyncSession, task_data: TaskCreate) -> TaskReadWithRelations:
    # 1. Проверяем, существует ли проект
    stmt_project = select(Project).options(
        selectinload(Project.groups)
    ).where(Project.id == task_data.project_id)

    result_project = await session.execute(stmt_project)
    project = result_project.scalar_one_or_none()

    if not project:
        raise ValueError("Проект не найден")

    # 2. Проверяем, что проект привязан к группам
    if not project.groups:
        raise ValueError("Проект не привязан к группе")

    # 3. Проверяем, что все указанные пользователи принадлежат группам проекта
    stmt_valid_users = (
        select(User.id)
        .join(Group, User.groups)
        .join(Project, Group.projects)
        .where(Project.id == project.id)
        .where(User.id.in_(task_data.assignee_ids))
    )

    result_valid_users = await session.execute(stmt_valid_users)
    valid_user_ids = {u[0] for u in result_valid_users}

    if len(valid_user_ids) != len(task_data.assignee_ids):
        invalid_ids = set(task_data.assignee_ids) - valid_user_ids
        raise ValueError(f"Пользователи {invalid_ids} не состоят в группах проекта")

    # 4. Получаем сами объекты User
    stmt_users = select(User).where(User.id.in_(task_data.assignee_ids))
    result_users = await session.execute(stmt_users)
    users = result_users.scalars().all()

    # 5. Создаём задачу
    new_task = Task(**task_data.model_dump(exclude={"assignee_ids", "project_id"}))
    new_task.project = project
    new_task.assignees = users

    session.add(new_task)
    await session.commit()
    await session.refresh(new_task)

    # 6. Возвращаем с relations
    stmt = select(Task).options(
        selectinload(Task.project),
        selectinload(Task.assignees)
    ).where(Task.id == new_task.id)

    result = await session.execute(stmt)
    return result.scalar_one()


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


async def delete_task(session: AsyncSession, task_id: int) -> bool:
    db_task = await get_task_by_id(session, task_id)
    if not db_task:
        return False

    # Удаляем все связи вручную
    for user in list(db_task.assignees):
        db_task.assignees.remove(user)

    await session.delete(db_task)
    await session.commit()
    return True