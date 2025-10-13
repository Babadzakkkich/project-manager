from fastapi import HTTPException, status
from typing import Optional, List

class GroupException(HTTPException):
    def __init__(self, status_code: int, detail: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)

class GroupNotFoundError(GroupException):
    def __init__(self, group_id: Optional[int] = None, group_name: Optional[str] = None):
        if group_id:
            detail = f"Группа с ID {group_id} не найдена"
        elif group_name:
            detail = f"Группа с названием '{group_name}' не найдена"
        else:
            detail = "Группа не найдена"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class GroupAlreadyExistsError(GroupException):
    def __init__(self, group_name: str):
        detail = f"Группа с названием '{group_name}' уже существует"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class GroupCreationError(GroupException):
    def __init__(self, detail: str = "Ошибка создания группы"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class GroupUpdateError(GroupException):
    def __init__(self, detail: str = "Ошибка обновления группы"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class GroupDeleteError(GroupException):
    def __init__(self, detail: str = "Ошибка удаления группы"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserNotInGroupError(GroupException):
    def __init__(self, user_id: Optional[int] = None, group_id: Optional[int] = None):
        if user_id and group_id:
            detail = f"Пользователь с ID {user_id} не состоит в группе {group_id}"
        else:
            detail = "Пользователь не состоит в группе"
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

class UserAlreadyInGroupError(GroupException):
    def __init__(self, user_email: str, group_id: int):
        detail = f"Пользователь с email '{user_email}' уже состоит в группе {group_id}"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UserNotFoundInGroupError(GroupException):
    def __init__(self, user_id: Optional[int] = None, user_email: Optional[str] = None):
        if user_id:
            detail = f"Пользователь с ID {user_id} не найден в группе"
        elif user_email:
            detail = f"Пользователь с email '{user_email}' не найден в группе" 
        else:
            detail = "Пользователь не найден в группе"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class UsersNotFoundError(GroupException):
    def __init__(self, user_emails: List[str]):
        emails_str = ", ".join(user_emails)
        detail = f"Пользователи с email {emails_str} не найдены"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class InsufficientPermissionsError(GroupException):
    def __init__(self, detail: str = "Недостаточно прав для выполнения операции"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

class InvalidRoleError(GroupException):
    def __init__(self, role: str, valid_roles: List[str] = None):
        if valid_roles:
            detail = f"Роль '{role}' недопустима. Допустимые роли: {', '.join(valid_roles)}"
        else:
            detail = f"Роль '{role}' недопустима"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)