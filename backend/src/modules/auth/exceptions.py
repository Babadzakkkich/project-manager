from fastapi import HTTPException, status
from typing import Optional

class AuthException(HTTPException):
    def __init__(self, status_code: int, detail: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)

class InvalidCredentialsError(AuthException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный логин или пароль"
        )

class TokenValidationError(AuthException):
    def __init__(self, detail: str = "Ошибка валидации токена"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"}
        )

class RefreshTokenError(AuthException):
    def __init__(self, detail: str = "Ошибка refresh токена"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )