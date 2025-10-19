from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List
from core.database.models import UserRole

if TYPE_CHECKING:
    from modules.users.schemas import UserWithRole
    from modules.projects.schemas import ProjectRead

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
    users: List[UserWithRole] = []
    projects: List[ProjectRead] = []

class GetUserRoleResponse(BaseModel):
    role: UserRole
    
class UserWithRoleSchema(BaseModel):
    user_email: str
    role: UserRole
    
class AddUsersToGroup(BaseModel):
    users: List[UserWithRoleSchema]

class RemoveUsersFromGroup(BaseModel):
    user_ids: List[int]
    
from modules.users.schemas import UserWithRole
from modules.projects.schemas import ProjectRead