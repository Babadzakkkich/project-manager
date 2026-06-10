from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List

from shared.schemas import BaseProjectInfo, BaseUserWithRole, BaseUserInfo
from core.database.models import TaskStatus, TaskPriority

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    status: TaskStatus = Field(default=TaskStatus.BACKLOG)
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    project_id: int
    group_id: int
    tags: Optional[List[str]] = Field(default_factory=list)
    
class TaskCreateExtended(TaskCreate):
    assignee_ids: List[int] = Field(default_factory=list)

class TaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    position: int
    start_date: Optional[datetime]
    deadline: Optional[datetime]
    project_id: int
    tags: Optional[List[str]] = []
    
    model_config = ConfigDict(from_attributes=True)

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    position: Optional[int] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    tags: Optional[List[str]] = None
    
class TaskBulkUpdate(BaseModel):
    task_id: int
    status: Optional[TaskStatus] = None
    position: Optional[int] = None
    priority: Optional[TaskPriority] = None

class GroupReadForTask(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    users: List[BaseUserWithRole] = []

    model_config = ConfigDict(from_attributes=True)

class TaskReadWithRelations(TaskRead):
    project: Optional[BaseProjectInfo] = None
    group: Optional[GroupReadForTask] = None
    assignees: List[BaseUserInfo] = []
    
class AddRemoveUsersToTask(BaseModel):
    user_ids: List[int]

class BoardViewRequest(BaseModel):
    project_id: int
    group_id: int
    view_mode: str = Field("team", pattern="^(team|personal)$") 
    user_id: Optional[int] = None

class TaskHistoryRead(BaseModel):
    id: int
    action: str
    old_value: Optional[str]
    new_value: Optional[str]
    details: Optional[str]
    created_at: datetime
    user: BaseUserInfo

    model_config = ConfigDict(from_attributes=True)

class TaskCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class TaskCommentUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class TaskCommentRead(BaseModel):
    id: int
    task_id: int
    author_id: int
    parent_id: Optional[int]
    content: str
    is_edited: bool
    is_deleted: bool
    is_read: bool = True
    read_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime]
    author: BaseUserInfo
    mentioned_users: List[BaseUserInfo] = []

    model_config = ConfigDict(from_attributes=True)


class TaskTimelineItem(BaseModel):
    type: str
    id: int
    created_at: datetime
    actor: Optional[BaseUserInfo] = None
    action: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details: Optional[str] = None
    comment: Optional[TaskCommentRead] = None

    model_config = ConfigDict(from_attributes=True)