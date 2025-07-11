from fastapi import Depends, HTTPException, status
from typing import Optional

from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.users.schemas import TokenData
from core.config import settings
from core.database.models import User, group_user_association
from core.database.session import db_session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login")

async def get_user_by_login(session: AsyncSession, login: str) -> Optional[User]:
    stmt = select(User).where(User.login == login)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(db_session.session_getter), 
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.security.secret_key, algorithms=[settings.security.algorithm])
        login: str = payload.get("sub")
        if login is None:
            raise credentials_exception
        token_data = TokenData(login=login)
    except JWTError:
        raise credentials_exception

    user = await get_user_by_login(session, token_data.login)
    if user is None:
        raise credentials_exception
    return user

async def get_user_group_role(session: AsyncSession, user_id: int, group_id: int) -> str | None:
    """Получить роль пользователя в конкретной группе"""
    stmt = select(group_user_association.c.role).where(
        group_user_association.c.user_id == user_id,
        group_user_association.c.group_id == group_id
    )
    result = await session.execute(stmt)
    row = result.fetchone()
    return row[0] if row else None

async def check_user_in_group(session: AsyncSession, user_id: int, group_id: int) -> bool:
    """Проверить, состоит ли пользователь в группе"""
    role = await get_user_group_role(session, user_id, group_id)
    return role is not None

async def ensure_user_is_admin(session: AsyncSession, user_id: int, group_id: int):
    in_group = await check_user_in_group(session, user_id, group_id)
    if not in_group:
        raise HTTPException(status_code=403, detail="Пользователь не состоит в группе")
    
    role = await get_user_group_role(session, user_id, group_id)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")