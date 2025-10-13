from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from modules.tasks.exceptions import TaskAccessDeniedError
from core.database.models import group_user_association
from modules.groups.exceptions import InsufficientPermissionsError, UserNotInGroupError

async def get_user_group_role(session: AsyncSession, user_id: int, group_id: int) -> str | None:
    stmt = select(group_user_association.c.role).where(
        group_user_association.c.user_id == user_id,
        group_user_association.c.group_id == group_id
    )
    result = await session.execute(stmt)
    row = result.fetchone()
    return row[0] if row else None

async def check_user_in_group(session: AsyncSession, user_id: int, group_id: int) -> bool:
    role = await get_user_group_role(session, user_id, group_id)
    return role is not None

async def ensure_user_is_admin(session, user_id: int, group_id: int):
    stmt = (
        select(group_user_association.c.role)
        .where(group_user_association.c.user_id == user_id)
        .where(group_user_association.c.group_id == group_id)
    )
    result = await session.execute(stmt)
    role = result.scalar_one_or_none()

    if role != "admin":
        raise TaskAccessDeniedError(f"Пользователь {user_id} не является администратором группы {group_id}")