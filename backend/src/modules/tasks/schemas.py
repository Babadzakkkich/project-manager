# modules/tasks/schemas.py

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Импорты из других модулей
from modules.projects.schemas import ProjectRead
from modules.users.schemas import UserRead


# === Схемы для создания задачи ===

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str
    deadline: datetime
    project_id: int


# === Схемы для чтения данных ===

class TaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    created_at: datetime
    deadline: datetime
    project_id: int


class TaskReadWithRelations(TaskRead):
    project: ProjectRead | None = None
    assignees: List[UserRead] = []



class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[datetime] = None
    project_id: Optional[int] = None