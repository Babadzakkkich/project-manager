from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional

from core.database.models import TaskPriority, TaskStatus

# Базовые схемы для групп
class BaseGroupInfo(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Базовые схемы для проектов
class BaseProjectInfo(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    
    model_config = ConfigDict(from_attributes=True)

# Базовые схемы для задач
class BaseTaskInfo(BaseModel):
    id: int
    title: str
    status: TaskStatus
    priority: TaskPriority
    deadline: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

# Базовые схемы для пользователей
class BaseUserInfo(BaseModel):
    id: int
    login: str
    email: str
    name: str
    
    model_config = ConfigDict(from_attributes=True)

class BaseUserWithRole(BaseUserInfo):
    role: str