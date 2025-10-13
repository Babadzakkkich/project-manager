from fastapi import HTTPException, status
from typing import Optional, List

class ProjectException(HTTPException):
    def __init__(self, status_code: int, detail: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)

class ProjectNotFoundError(ProjectException):
    def __init__(self, project_id: Optional[int] = None):
        if project_id:
            detail = f"Проект с ID {project_id} не найден"
        else:
            detail = "Проект не найден"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class ProjectCreationError(ProjectException):
    def __init__(self, detail: str = "Ошибка создания проекта"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class ProjectUpdateError(ProjectException):
    def __init__(self, detail: str = "Ошибка обновления проекта"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class ProjectDeleteError(ProjectException):
    def __init__(self, detail: str = "Ошибка удаления проекта"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

class GroupsNotFoundError(ProjectException):
    def __init__(self, group_ids: List[int]):
        ids_str = ", ".join(map(str, group_ids))
        detail = f"Группы с ID {ids_str} не найдены"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class GroupsNotInProjectError(ProjectException):
    def __init__(self, group_ids: List[int]):
        ids_str = ", ".join(map(str, group_ids))
        detail = f"Группы с ID {ids_str} не найдены в проекте"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class InsufficientProjectPermissionsError(ProjectException):
    def __init__(self, detail: str = "Недостаточно прав для выполнения операции с проектом"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)