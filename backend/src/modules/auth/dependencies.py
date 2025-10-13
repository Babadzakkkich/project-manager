from fastapi import Depends
from typing import Optional
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database.session import db_session
from ..users.service import get_user_by_id
from .exceptions import TokenValidationError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(db_session.session_getter), 
):
    try:
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        if payload.get("type") != "access":
            raise TokenValidationError("Требуется access токен")
        
        user_id = int(payload.get("sub"))
        user = await get_user_by_id(session, user_id)
        
        if not user:
            raise TokenValidationError("Пользователь не найден")
            
        return user
            
    except Exception as e:
        raise TokenValidationError(str(e))

async def get_optional_current_user(
    token: str = Depends(optional_oauth2_scheme),
    session: AsyncSession = Depends(db_session.session_getter), 
) -> Optional[dict]:
    if not token:
        return None
        
    try:
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        if payload.get("type") != "access":
            return None
        
        user_id = int(payload.get("sub"))
        user = await get_user_by_id(session, user_id)
        return user
            
    except Exception:
        return None