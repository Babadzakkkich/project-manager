from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from core.database.models import SystemRole, TaskPriority, TaskStatus


class AdminStatsRead(BaseModel):
    users_total: int
    users_blocked: int
    users_global_admins: int
    groups_total: int
    projects_total: int
    tasks_total: int
    tasks_overdue: int
    active_conferences_total: int
    audit_events_total: int


class AdminShortUserRead(BaseModel):
    id: int
    login: str
    email: str
    name: str
    system_role: SystemRole
    is_blocked: bool

    model_config = ConfigDict(from_attributes=True)


class AdminUserRead(AdminShortUserRead):
    blocked_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    groups_count: int = 0
    assigned_tasks_count: int = 0


class UserBlockRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class AdminGroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    users_count: int
    projects_count: int
    tasks_count: int
    admins: list[AdminShortUserRead] = Field(default_factory=list)


class AdminShortGroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None


class AdminProjectRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    groups: list[AdminShortGroupRead] = Field(default_factory=list)
    tasks_count: int


class AdminShortProjectRead(BaseModel):
    id: int
    title: str
    status: str


class AdminTaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    position: int
    created_at: datetime
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    project: Optional[AdminShortProjectRead] = None
    group: Optional[AdminShortGroupRead] = None
    assignees: list[AdminShortUserRead] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    is_overdue: bool = False




class AdminGroupMemberRead(BaseModel):
    id: int
    login: str
    email: str
    name: str
    system_role: SystemRole
    is_blocked: bool
    role: str
    joined_at: Optional[datetime] = None


class AdminShortTaskRead(BaseModel):
    id: int
    title: str
    status: TaskStatus
    priority: TaskPriority
    deadline: Optional[datetime] = None
    project_id: Optional[int] = None
    group_id: Optional[int] = None
    is_overdue: bool = False


class AdminGroupDetailRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    users_count: int
    projects_count: int
    tasks_count: int
    users: list[AdminGroupMemberRead] = Field(default_factory=list)
    projects: list[AdminShortProjectRead] = Field(default_factory=list)
    tasks: list[AdminShortTaskRead] = Field(default_factory=list)


class AdminProjectDetailRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    groups: list[AdminGroupRead] = Field(default_factory=list)
    tasks: list[AdminShortTaskRead] = Field(default_factory=list)


class AdminTaskDetailRead(AdminTaskRead):
    pass


class AdminTaskHistoryRead(BaseModel):
    id: int
    task_id: int
    user: Optional[AdminShortUserRead] = None
    user_id: Optional[int] = None
    action: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

class AdminAuditLogRead(BaseModel):
    id: int
    actor: Optional[AdminShortUserRead] = None
    actor_id: Optional[int] = None
    action: str
    target_type: str
    target_id: Optional[int] = None
    details: Optional[dict[str, Any]] = None
    created_at: datetime


class AdminActionResult(BaseModel):
    detail: str