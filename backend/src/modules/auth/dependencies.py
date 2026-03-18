from fastapi import Depends, Request
from typing import Optional
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from core.config.settings import settings
from core.database.session import db_session
from core.logger import logger
from ..users.service import UserService
from .exceptions import TokenValidationError

async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter), 
):
    """
    Получение текущего пользователя по токену из httpOnly cookie
    """
    token = request.cookies.get("access_token")
    
    if not token:
        logger.warning("No access token found in cookies")
        raise TokenValidationError("Токен не найден")
    
    try:
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        # Проверяем тип токена
        if payload.get("type") != "access":
            logger.warning("Token validation failed: not an access token")
            raise TokenValidationError("Требуется access токен")
        
        user_id = int(payload.get("sub"))
        
        user_service = UserService(session)
        user = await user_service.get_user_by_id(user_id)
        
        if not user:
            logger.warning(f"User with ID {user_id} not found")
            raise TokenValidationError("Пользователь не найден")
        
        logger.debug(f"User {user_id} authenticated successfully via cookie")
        return user
            
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise TokenValidationError("Срок действия токена истек")
    except jwt.JWTError as e:
        logger.error(f"JWT validation error: {e}")
        raise TokenValidationError("Невалидный токен")
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise TokenValidationError(str(e))

async def get_optional_current_user(
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter), 
) -> Optional[dict]:
    """
    Получение текущего пользователя по токену из cookie (опционально)
    """
    token = request.cookies.get("access_token")
    
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