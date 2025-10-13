from fastapi import HTTPException, status
from typing import Optional

class UserException(HTTPException):
    def __init__(self, status_code: int, detail: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)

class UserNotFoundError(UserException):
    def __init__(self, user_id: Optional[int] = None, login: Optional[str] = None):
        if user_id:
            detail = f"Пользователь с ID {user_id} не найден"
        elif login:
            detail = f"Пользователь с логином '{login}' не найден"
        else:
            detail = "Пользователь не найден"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class UserAlreadyExistsError(UserException):
    def __init__(self, login: Optional[str] = None, email: Optional[str] = None):
        if login and email:
            detail = "Пользователь с таким логином и email уже существует"
        elif login:
            detail = f"Пользователь с логином '{login}' уже существует"
        elif email:
            detail = f"Пользователь с email '{email}' уже существует"
        else:
            detail = "Пользователь уже существует"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserUpdateError(UserException):
    def __init__(self, detail: str = "Ошибка обновления пользователя"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserDeleteError(UserException):
    def __init__(self, detail: str = "Ошибка удаления пользователя"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserCreationError(UserException):
    def __init__(self, detail: str = "Ошибка создания пользователя"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserAccessDeniedError(UserException):
    def __init__(self, detail: str = "Доступ запрещен"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail
        )