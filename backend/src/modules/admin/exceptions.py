"""Исключения административного модуля."""


class AdminError(Exception):
    """Базовое исключение административного модуля."""
    pass


class AdminPermissionError(AdminError):
    """Ошибка прав доступа к административному действию."""
    pass


class AdminObjectNotFoundError(AdminError):
    """Администрируемый объект не найден."""
    pass


class AdminActionError(AdminError):
    """Ошибка выполнения административного действия."""
    pass