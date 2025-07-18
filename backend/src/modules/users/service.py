from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.security.password_hasher import hash_password
from core.database.models import User
from .schemas import UserCreate, UserUpdate

async def get_all_users(session: AsyncSession) -> list[User]:
    stmt = select(User).order_by(User.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[User]:
    stmt = select(User).options(
        selectinload(User.groups),
        selectinload(User.assigned_tasks)
    ).where(User.id == user_id)
    
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def create_user(session: AsyncSession, user_create: UserCreate) -> User:
    hashed_password = hash_password(user_create.password)

    new_user = User(
        login=user_create.login,
        password_hash=hashed_password,
        name=user_create.name,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return new_user

async def update_user(session: AsyncSession, user_id: int, user_update: UserUpdate) -> User | None:
    stmt = (
        select(User)
        .options(
            selectinload(User.groups),
            selectinload(User.assigned_tasks)
        )
        .where(User.id == user_id)
    )

    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        return None

    update_data = user_update.model_dump(exclude_unset=True)

    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))

    for key, value in update_data.items():
        setattr(user, key, value)

    await session.commit()
    await session.refresh(user)
    return user

async def delete_user(session: AsyncSession, user_id: int) -> bool:
    user = await get_user_by_id(session, user_id)
    if not user:
        return False

    for task in list(user.assigned_tasks):
        await session.delete(task)

    user.groups.clear()

    await session.delete(user)
    await session.commit()
    return True