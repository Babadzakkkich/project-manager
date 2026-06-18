from __future__ import annotations
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from datetime import datetime
from typing import Optional, List

from shared.schemas import BaseGroupInfo, BaseTaskInfo
from core.database.models import SystemRole

class UserCreate(BaseModel):
    login: str = Field(..., min_length=3, max_length=50)
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2, max_length=100)
    personal_data_accepted: bool = Field(...)

    @field_validator('personal_data_accepted')
    @classmethod
    def validate_personal_data_accepted(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError('Необходимо дать согласие на обработку персональных данных')
        return value

class UserRead(BaseModel):
    id: int
    login: str
    email: str
    name: str
    system_role: SystemRole
    is_blocked: bool
    blocked_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    login: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    password: Optional[str] = Field(None, min_length=6)

class UserPasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)

    @field_validator('current_password', 'new_password')
    @classmethod
    def validate_password_not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError('Пароль не может быть пустым')
        return value

class UserWithRole(UserRead):
    role: str
    
    model_config = ConfigDict(from_attributes=True)

class UserWithRelations(UserRead):
    groups: List[BaseGroupInfo] = []
    assigned_tasks: List[BaseTaskInfo] = []
    
    model_config = ConfigDict(from_attributes=True)