from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Импорты схем из других модулей
# from modules.users.schemas import UserRead
# from modules.projects.schemas import ProjectRead

# === Схемы для создания группы ===

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

# === Схемы для чтения данных ===

class GroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime



# class GroupReadWithRelations(GroupRead):
#     users: List[UserRead] = []
#     projects: List[ProjectRead] = []

# === Схемы для обновления ===

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None