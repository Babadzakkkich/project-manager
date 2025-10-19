from __future__ import annotations
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.groups.schemas import GroupRead
    from modules.tasks.schemas import TaskRead

class UserCreate(BaseModel):
    login: str = Field(..., min_length=3, max_length=50)
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2, max_length=100)

class UserRead(BaseModel):
    id: int
    login: str
    email: str
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    login: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    password: Optional[str] = Field(None, min_length=6)

class UserWithRole(UserRead):
    role: str
    
    model_config = ConfigDict(from_attributes=True)

class UserWithRelations(UserRead):
    groups: List[GroupRead] = []
    assigned_tasks: List[TaskRead] = []
    
    model_config = ConfigDict(from_attributes=True)
        
from modules.groups.schemas import GroupRead
from modules.tasks.schemas import TaskRead   