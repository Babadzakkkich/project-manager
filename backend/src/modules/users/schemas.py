from __future__ import annotations
from pydantic import BaseModel
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.groups.schemas import GroupRead
    from modules.tasks.schemas import TaskRead

class UserCreate(BaseModel):
    login: str
    password: str
    name: str

class UserLogin(BaseModel):
    login: str
    password: str

class UserRead(BaseModel):
    id: int
    login: str
    name: str
    created_at: datetime

class UserUpdate(BaseModel):
    login: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None
    
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    login: Optional[str] = None

class UserWithRelations(UserRead):
    groups: List[GroupRead] = []
    assigned_tasks: List[TaskRead] = []
    
from modules.groups.schemas import GroupRead
from modules.tasks.schemas import TaskRead   