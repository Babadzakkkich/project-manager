from fastapi import APIRouter, Depends, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from jose import jwt

from core.config import settings
from core.database.models import User
from core.database.session import db_session
from core.logger import logger
from .dependencies import get_current_user, get_optional_current_user
from .service import AuthService
from .jwt import verify_refresh_token, create_access_token, create_refresh_token
from .refresh_token import revoke_all_user_tokens
from ..users.service import UserService
from .schemas import Token, TokenRefresh, TokenPayload, RefreshTokenResponse
from .exceptions import RefreshTokenError
from ..users.exceptions import UserNotFoundError

router = APIRouter()

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """
    Устанавливает оба токена в httpOnly cookies
    """
    # Access token cookie - доступен для всех путей
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
        max_age=settings.security.access_token_expire_minutes * 60,
        path="/",
    )
    
    # Refresh token cookie - также доступен для всех путей, но используется только для /auth/refresh
    # Убираем ограничение по пути, чтобы кука была видна
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
        max_age=settings.security.refresh_token_expire_days * 24 * 60 * 60,
        path="/",  # Изменяем на /, чтобы кука была доступна для всех путей
    )

def clear_auth_cookies(response: Response) -> None:
    """
    Очищает cookies с токенами
    """
    response.delete_cookie(
        key="access_token",
        path="/",
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
    )
    response.delete_cookie(
        key="refresh_token",
        path="/",
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
    )

@router.post("/login", response_model=dict)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(db_session.session_getter),
):
    """
    Вход в систему.
    Устанавливает оба токена в httpOnly cookies.
    """
    logger.info(f"Login attempt for user: {form_data.username}")
    auth_service = AuthService(session)
    
    # Аутентифицируем пользователя и получаем токены
    tokens = await auth_service.login_user(form_data.username, form_data.password)
    
    # Устанавливаем оба токена в httpOnly cookies
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    
    logger.info(f"User logged in successfully, tokens set in cookies")
    
    return {"message": "Успешный вход в систему"}


@router.post("/refresh", response_model=dict)
async def refresh_access_token(
    response: Response,
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter),
):
    """
    Обновление токенов.
    Использует refresh token из cookie для генерации новой пары токенов.
    """
    logger.info("Token refresh attempt")
    
    # Получаем refresh token из cookie
    refresh_token = request.cookies.get("refresh_token")
    
    if not refresh_token:
        logger.warning("No refresh token found in cookies")
        raise RefreshTokenError("Refresh token не найден")
    
    try:
        # Проверяем refresh token и получаем payload
        token_payload = await verify_refresh_token(session, refresh_token)
        
        # Получаем пользователя
        user_service = UserService(session)
        user = await user_service.get_user_by_id(token_payload.sub)
        if not user:
            logger.warning(f"User {token_payload.sub} not found for token refresh")
            raise UserNotFoundError(user_id=token_payload.sub)
        
        # Создаем новую пару токенов
        new_access_token = create_access_token(token_payload)
        new_refresh_token = await create_refresh_token(session, user.id, user.login)
        
        # Устанавливаем новые токены в cookies
        set_auth_cookies(response, new_access_token, new_refresh_token)
        
        logger.info(f"Token refreshed successfully for user {user.id}")
        
        return {"message": "Токены успешно обновлены"}
        
    except ValueError as e:
        logger.error(f"Token refresh error: {e}")
        raise RefreshTokenError(str(e))


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter)
):
    """
    Выход из системы.
    Отзывает все refresh токены пользователя и очищает cookies.
    """
    # Пытаемся получить пользователя из токена
    try:
        token = request.cookies.get("access_token")
        if token:
            payload = jwt.decode(
                token, 
                settings.security.secret_key, 
                algorithms=[settings.security.algorithm],
                options={"verify_exp": False}
            )
            if payload.get("type") == "access":
                user_id = int(payload.get("sub"))
                await revoke_all_user_tokens(session, user_id)
                logger.info(f"Logout for user {user_id}")
    except Exception as e:
        logger.error(f"Error during logout: {e}")
    
    # Очищаем cookies в любом случае
    clear_auth_cookies(response)
    
    logger.info("User logged out, tokens cleared")
    return {"detail": "Успешный выход из системы"}


@router.get("/check", response_model=dict)
async def check_auth(
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter)
):
    """
    Проверка статуса аутентификации.
    Возвращает информацию о текущем пользователе, если он аутентифицирован.
    """
    token = request.cookies.get("access_token")
    
    if not token:
        return {"authenticated": False}
    
    try:
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        if payload.get("type") != "access":
            return {"authenticated": False}
        
        user_id = int(payload.get("sub"))
        
        user_service = UserService(session)
        user = await user_service.get_user_by_id(user_id)
        
        if user:
            return {
                "authenticated": True,
                "user": {
                    "id": user.id,
                    "login": user.login,
                    "email": user.email,
                    "name": user.name
                }
            }
    except jwt.ExpiredSignatureError:
        # Токен истек, но пользователь может быть все еще аутентифицирован
        # Проверяем наличие refresh token
        refresh_token = request.cookies.get("refresh_token")
        if refresh_token:
            try:
                user_id = await verify_refresh_token(session, refresh_token)
                user_service = UserService(session)
                user = await user_service.get_user_by_id(user_id)
                if user:
                    # Создаем новый access token
                    token_payload = TokenPayload(
                        sub=user.id,
                        login=user.login,
                        type="access"
                    )
                    new_access_token = create_access_token(token_payload)
                    # Обновляем cookie с access token
                    response = Response()
                    response.set_cookie(
                        key="access_token",
                        value=new_access_token,
                        httponly=True,
                        secure=settings.run.cookie_secure,
                        samesite=settings.run.cookie_samesite,
                        max_age=settings.security.access_token_expire_minutes * 60,
                        path="/",
                    )
                    
                    return {
                        "authenticated": True,
                        "user": {
                            "id": user.id,
                            "login": user.login,
                            "email": user.email,
                            "name": user.name
                        }
                    }
            except Exception as e:
                logger.error(f"Refresh token check failed: {e}")
                pass
        
    except Exception as e:
        logger.error(f"Auth check error: {e}")
    
    return {"authenticated": False}