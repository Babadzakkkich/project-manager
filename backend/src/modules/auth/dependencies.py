from fastapi import Depends
from typing import Optional
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from core.config.settings import settings
from core.database.session import db_session
from core.logger import logger
from ..users.service import UserService
from .exceptions import TokenValidationError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(db_session.session_getter), 
):
    """
    Получение текущего пользователя по токену
    """
    try:
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        if payload.get("type") != "access":
            logger.warning("Token validation failed: not an access token")
            raise TokenValidationError("Требуется access токен")
        
        user_id = int(payload.get("sub"))
        
        user_service = UserService(session)
        user = await user_service.get_user_by_id(user_id)
        
        if not user:
            logger.warning(f"User with ID {user_id} not found")
            raise TokenValidationError("Пользователь не найден")
        
        logger.debug(f"User {user_id} authenticated successfully")
        return user
            
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise TokenValidationError(str(e))

async def get_optional_current_user(
    token: str = Depends(optional_oauth2_scheme),
    session: AsyncSession = Depends(db_session.session_getter), 
) -> Optional[dict]:
    """
    Получение текущего пользователя по токену (опционально)
    """
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
        
        user_service = UserService(session)
        user = await user_service.get_user_by_id(user_id)
        return user
            
    except Exception:
        return None