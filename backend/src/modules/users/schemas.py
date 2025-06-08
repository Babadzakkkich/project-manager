from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

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

# class UserWithRelations(UserRead):
#     groups: List[GroupRead] = []
#     assigned_tasks: List[TaskRead] = []