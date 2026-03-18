from fastapi import APIRouter, Depends, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.config import settings
from core.database.models import User
from core.database.session import db_session
from core.logger import logger
from .dependencies import get_current_user
from .service import AuthService
from .jwt import verify_refresh_token, create_access_token, create_refresh_token
from .refresh_token import revoke_all_user_tokens
from ..users.service import UserService
from .schemas import Token, TokenRefresh, TokenPayload, RefreshTokenResponse
from .exceptions import RefreshTokenError
from ..users.exceptions import UserNotFoundError

router = APIRouter()

def set_access_token_cookie(response: Response, access_token: str) -> None:
    """
    Устанавливает access token в httpOnly cookie
    """
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
        max_age=settings.security.access_token_expire_minutes * 60,
        path="/",
    )

def clear_access_token_cookie(response: Response) -> None:
    """
    Очищает cookie с access token
    """
    response.delete_cookie(
        key="access_token",
        path="/",
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
    )

@router.post("/login", response_model=RefreshTokenResponse)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(db_session.session_getter),
):
    """
    Вход в систему.
    Устанавливает access token в httpOnly cookie и возвращает refresh token.
    """
    logger.info(f"Login attempt for user: {form_data.username}")
    auth_service = AuthService(session)
    
    # Аутентифицируем пользователя и получаем токены
    tokens = await auth_service.login_user(form_data.username, form_data.password)
    
    # Устанавливаем access token в httpOnly cookie
    set_access_token_cookie(response, tokens["access_token"])
    
    logger.info(f"User logged in successfully, access token set in cookie")
    
    # Возвращаем только refresh token в теле ответа
    return RefreshTokenResponse(refresh_token=tokens["refresh_token"])


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_access_token(
    response: Response,
    token_data: TokenRefresh,
    session: AsyncSession = Depends(db_session.session_getter),
):
    """
    Обновление access token.
    Принимает refresh token, проверяет его и устанавливает новый access token в cookie.
    """
    logger.info("Token refresh attempt")
    
    try:
        # Проверяем refresh token и получаем payload
        token_payload = await verify_refresh_token(session, token_data.refresh_token)
        
        # Получаем пользователя
        user_service = UserService(session)
        user = await user_service.get_user_by_id(token_payload.sub)
        if not user:
            logger.warning(f"User {token_payload.sub} not found for token refresh")
            raise UserNotFoundError(user_id=token_payload.sub)
        
        # Создаем новую пару токенов
        new_access_token = create_access_token(token_payload)
        new_refresh_token = await create_refresh_token(session, user.id, user.login)
        
        # Устанавливаем новый access token в cookie
        set_access_token_cookie(response, new_access_token)
        
        logger.info(f"Token refreshed successfully for user {user.id}")
        
        # Возвращаем новый refresh token
        return RefreshTokenResponse(refresh_token=new_refresh_token)
        
    except ValueError as e:
        logger.error(f"Token refresh error: {e}")
        raise RefreshTokenError(str(e))


@router.post("/logout")
async def logout(
    response: Response,
    current_user: Optional[User] = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    """
    Выход из системы.
    Отзывает все refresh токены пользователя и очищает cookie.
    """
    if current_user:
        logger.info(f"Logout for user {current_user.id}")
        await revoke_all_user_tokens(session, current_user.id)
    
    # Очищаем cookie с access token
    clear_access_token_cookie(response)
    
    logger.info("User logged out, access token cookie cleared")
    return {"detail": "Успешный выход из системы"}


@router.get("/check", response_model=dict)
async def check_auth(
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Проверка статуса аутентификации.
    Возвращает информацию о текущем пользователе, если он аутентифицирован.
    """
    if current_user:
        return {
            "authenticated": True,
            "user": {
                "id": current_user.id,
                "login": current_user.login,
                "email": current_user.email,
                "name": current_user.name
            }
        }
    return {"authenticated": False}