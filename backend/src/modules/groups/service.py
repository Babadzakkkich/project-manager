from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import Group
from .schemas import GroupCreate, GroupRead, GroupUpdate

async def get_all_groups(session: AsyncSession) -> list[GroupRead]:
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_group_by_id(session: AsyncSession, group_id: int) -> GroupRead | None:
    stmt = select(Group).where(Group.id == group_id)
    result = await session.scalar(stmt)
    return result


async def create_group(session: AsyncSession, group_create: GroupCreate) -> GroupRead:
    new_group = Group(**group_create.model_dump())
    session.add(new_group)
    await session.commit()
    await session.refresh(new_group)
    return new_group


async def update_group(session: AsyncSession, db_group: Group, group_update: GroupUpdate) -> GroupRead:
    for key, value in group_update.model_dump(exclude_unset=True).items():
        setattr(db_group, key, value)

    await session.commit()
    await session.refresh(db_group)
    return db_group


async def delete_group(session: AsyncSession, group_id: int) -> bool:
    group = await get_group_by_id(session, group_id)
    if not group:
        return False

    await session.delete(group)
    await session.commit()
    return True