from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database.models import Task
from .schemas import TaskCreate, TaskUpdate, TaskRead


async def get_all_tasks(session: AsyncSession) -> list[TaskRead]:
    stmt = select(Task).order_by(Task.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_task_by_id(session: AsyncSession, task_id: int) -> TaskRead | None:
    stmt = select(Task).where(Task.id == task_id)
    result = await session.scalar(stmt)
    return result


async def create_task(session: AsyncSession, task_create: TaskCreate) -> TaskRead:
    new_task = Task(**task_create.model_dump())
    session.add(new_task)
    await session.commit()
    await session.refresh(new_task)
    return new_task


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

    await session.delete(db_task)
    await session.commit()
    return True