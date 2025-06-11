from __future__ import annotations
from pydantic import BaseModel
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.projects.schemas import ProjectRead
    from modules.users.schemas import UserRead
    from modules.groups.schemas import GroupRead

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str
    deadline: datetime
    project_id: int
    group_id: int
    assignee_ids: List[int]

class TaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    created_at: datetime
    deadline: datetime
    project_id: int
    
class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[datetime] = None

class TaskReadWithRelations(TaskRead):
    project: ProjectRead | None = None
    group: GroupRead | None = None
    assignees: List[UserRead] = []
    
class AddRemoveUsersToTask(BaseModel):
    user_ids: List[int]

from modules.groups.schemas import GroupRead
from modules.projects.schemas import ProjectRead
from modules.users.schemas import UserRead
