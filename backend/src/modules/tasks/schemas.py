from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.projects.schemas import ProjectRead
    from modules.users.schemas import UserRead, UserWithRole
    
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str
    start_date: datetime
    deadline: datetime
    project_id: int
    group_id: int
    
class TaskCreateExtended(TaskCreate):
    assignee_ids: List[int] = Field(default_factory=list)

class TaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    start_date: datetime
    deadline: datetime
    project_id: int
    
class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    
class GroupReadForTask(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    users: List[UserWithRole] = []

    model_config = ConfigDict(from_attributes=True)

class TaskReadWithRelations(TaskRead):
    project: ProjectRead | None = None
    group: GroupReadForTask | None = None
    assignees: List[UserRead] = []
    
class AddRemoveUsersToTask(BaseModel):
    user_ids: List[int]

from modules.projects.schemas import ProjectRead
from modules.users.schemas import UserRead, UserWithRole