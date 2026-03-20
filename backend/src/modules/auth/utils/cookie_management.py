from fastapi import Response
from core.config import settings

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