from fastapi import HTTPException, status
from typing import Optional, List

class TaskException(HTTPException):
    def __init__(self, status_code: int, detail: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)

class TaskNotFoundError(TaskException):
    def __init__(self, task_id: Optional[int] = None):
        if task_id:
            detail = f"Задача с ID {task_id} не найдена"
        else:
            detail = "Задача не найдена"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class TaskCreationError(TaskException):
    def __init__(self, detail: str = "Ошибка создания задачи"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class TaskUpdateError(TaskException):
    def __init__(self, detail: str = "Ошибка обновления задачи"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class TaskDeleteError(TaskException):
    def __init__(self, detail: str = "Ошибка удаления задачи"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class ProjectNotFoundError(TaskException):
    def __init__(self, project_id: int):
        detail = f"Проект с ID {project_id} не найден"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class GroupNotFoundError(TaskException):
    def __init__(self, group_id: int):
        detail = f"Группа с ID {group_id} не найдена"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class GroupNotInProjectError(TaskException):
    def __init__(self, group_id: int, project_id: int):
        detail = f"Группа {group_id} не привязана к проекту {project_id}"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UsersNotInGroupError(TaskException):
    def __init__(self, user_ids: List[int]):
        ids_str = ", ".join(map(str, user_ids))
        detail = f"Пользователи {ids_str} не состоят в группе"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class UsersNotInTaskError(TaskException):
    def __init__(self, user_ids: List[int]):
        ids_str = ", ".join(map(str, user_ids))
        detail = f"Пользователи {ids_str} не найдены в задаче"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class TaskNoGroupError(TaskException):
    def __init__(self):
        detail = "Задача не закреплена за группой"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class TaskAccessDeniedError(TaskException):
    def __init__(self, detail: str = "Недостаточно прав для выполнения операции с задачей"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
        
class InvalidTaskStatusError(TaskException):
    def __init__(self, status: str, valid_statuses: List[str] = None):
        if valid_statuses:
            detail = f"Статус '{status}' недопустим. Допустимые статусы: {', '.join(valid_statuses)}"
        else:
            detail = f"Статус '{status}' недопустим"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class InvalidTaskPriorityError(TaskException):
    def __init__(self, priority: str, valid_priorities: List[str] = None):
        if valid_priorities:
            detail = f"Приоритет '{priority}' недопустим. Допустимые приоритеты: {', '.join(valid_priorities)}"
        else:
            detail = f"Приоритет '{priority}' недопустим"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class BulkUpdateError(TaskException):
    def __init__(self, detail: str = "Ошибка массового обновления задач"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)