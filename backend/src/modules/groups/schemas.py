from __future__ import annotations
from pydantic import BaseModel, ConfigDict, EmailStr, Field
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

class InviteUserToGroup(BaseModel):
    email: EmailStr = Field(..., description="Email пользователя для приглашения")
    role: UserRole = Field(UserRole.MEMBER, description="Роль в группе")

class InvitationResponse(BaseModel):
    message: str
    invitation_id: int

class PendingInvitation(BaseModel):
    id: int
    token: str
    group_id: int
    group_name: str
    invited_by: str
    role: str
    expires_at: datetime
    created_at: datetime

class AcceptInvitationResponse(BaseModel):
    success: bool
    message: str
    group_id: Optional[int] = None
    group_name: Optional[str] = None

class DeclineInvitationResponse(BaseModel):
    success: bool
    message: str

class RemoveUsersFromGroup(BaseModel):
    user_ids: List[int]