# modules/projects/schemas.py

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Импорты из других модулей
# from modules.groups.schemas import GroupRead
# from modules.tasks.schemas import TaskRead


# === Схемы для создания проекта ===

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: datetime
    status: str
    group_id: int


# === Схемы для чтения данных ===

class ProjectRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str
    group_id: int


# class ProjectReadWithRelations(ProjectRead):
#     group: GroupRead | None = None
#     tasks: List[TaskRead] = []



# === Схемы для обновления проекта ===

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None