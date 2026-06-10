from fastapi import Response
from core.config import settings

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
        max_age=settings.security.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.run.cookie_secure,
        samesite=settings.run.cookie_samesite,
        max_age=settings.security.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )

def clear_auth_cookies(response: Response) -> None:
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