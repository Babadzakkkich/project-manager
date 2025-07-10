from __future__ import annotations
from pydantic import BaseModel
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.users.schemas import UserRead
    from modules.projects.schemas import ProjectRead

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    
class GroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class GroupReadWithRelations(GroupRead):
    users: List[UserRead] = []
    projects: List[ProjectRead] = []
    
class UserWithRoleSchema(BaseModel):
    user_id: int
    role: Optional[str] = "member"
    
class AddUsersToGroup(BaseModel):
    users: List[UserWithRoleSchema]

class RemoveUsersFromGroup(BaseModel):
    user_ids: List[int]
    
from modules.users.schemas import UserRead
from modules.projects.schemas import ProjectRead