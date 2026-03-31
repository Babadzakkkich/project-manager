from fastapi import APIRouter, Depends, Response, Request
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt

from core.config import settings
from core.database.session import db_session
from core.logger import logger
from .service import AuthService
from .jwt import verify_refresh_token, create_access_token, create_refresh_token
from .refresh_token import revoke_all_user_tokens
from ..users.service import UserService
from .schemas import TokenPayload
from .exceptions import RefreshTokenError
from ..users.exceptions import UserNotFoundError
from .utils.cookie_management import set_auth_cookies, clear_auth_cookies

router = APIRouter()

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


@router.get("/check")
async def check_auth(
    request: Request,
    session: AsyncSession = Depends(db_session.session_getter)
):
    """Проверка статуса аутентификации с автоматическим обновлением access token"""
    
    token = request.cookies.get("access_token")
    
    if not token:
        return JSONResponse({"authenticated": False})
    
    try:
        # Пробуем проверить access token
        payload = jwt.decode(
            token, 
            settings.security.secret_key, 
            algorithms=[settings.security.algorithm]
        )
        
        if payload.get("type") != "access":
            return JSONResponse({"authenticated": False})
        
        user_id = int(payload.get("sub"))
        user_service = UserService(session)
        user = await user_service.get_user_by_id(user_id)
        
        if user:
            return JSONResponse({
                "authenticated": True,
                "user": {
                    "id": user.id,
                    "login": user.login,
                    "email": user.email,
                    "name": user.name
                }
            })
            
    except jwt.ExpiredSignatureError:
        # Access token истек - пробуем обновить через refresh token
        refresh_token = request.cookies.get("refresh_token")
        
        if refresh_token:
            try:
                # Проверяем refresh token (возвращает TokenPayload)
                token_payload = await verify_refresh_token(session, refresh_token)
                
                # Загружаем пользователя
                user_service = UserService(session)
                user = await user_service.get_user_by_id(token_payload.sub)
                
                if user:
                    # Создаем новый access token
                    new_token_payload = TokenPayload(
                        sub=user.id,
                        login=user.login,
                        type="access"
                    )
                    new_access_token = create_access_token(new_token_payload)
                    
                    # Формируем ответ с обновленным cookie
                    response = JSONResponse({
                        "authenticated": True,
                        "user": {
                            "id": user.id,
                            "login": user.login,
                            "email": user.email,
                            "name": user.name
                        }
                    })
                    
                    response.set_cookie(
                        key="access_token",
                        value=new_access_token,
                        httponly=True,
                        secure=settings.run.cookie_secure,
                        samesite=settings.run.cookie_samesite,
                        max_age=settings.security.access_token_expire_minutes * 60,
                        path="/",
                    )
                    
                    logger.info(f"Access token refreshed for user {user.id} via /auth/check")
                    return response
                    
            except Exception as e:
                logger.error(f"Refresh token validation failed in /auth/check: {e}")
        else:
            logger.debug("No refresh token found for expired access token")
            
    except jwt.JWTError as e:
        logger.error(f"JWT decode error in /auth/check: {e}")
    except Exception as e:
        logger.error(f"Unexpected error in /auth/check: {e}", exc_info=True)
    
    # Если ничего не сработало - пользователь не аутентифицирован
    return JSONResponse({"authenticated": False})