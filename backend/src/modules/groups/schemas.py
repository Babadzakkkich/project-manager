from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List

from shared.schemas import BaseUserWithRole, BaseProjectInfo
from core.database.models import UserRole

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    
class GroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class GroupReadWithRelations(GroupRead):
    users: List[BaseUserWithRole] = []
    projects: List[BaseProjectInfo] = []

class GetUserRoleResponse(BaseModel):
    role: UserRole
    
class UserWithRoleSchema(BaseModel):
    user_email: str
    role: UserRole
    
class AddUsersToGroup(BaseModel):
    users: List[UserWithRoleSchema]

class RemoveUsersFromGroup(BaseModel):
    user_ids: List[int]