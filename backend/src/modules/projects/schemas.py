from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.users.schemas import UserWithRole
    from modules.tasks.schemas import TaskRead

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str
    group_ids: List[int]

class ProjectRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str

    model_config = ConfigDict(from_attributes=True)
    
class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None

class SimpleGroupForProject(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    users: List[UserWithRole] = []

    model_config = ConfigDict(from_attributes=True)

class ProjectReadWithRelations(ProjectRead):
    groups: List[SimpleGroupForProject] = [] 
    tasks: List[TaskRead] = []
    
    model_config = ConfigDict(from_attributes=True)
    
class AddGroupsToProject(BaseModel):
    group_ids: List[int]

class RemoveGroupsFromProject(AddGroupsToProject):
    pass
    
from modules.users.schemas import UserWithRole
from modules.tasks.schemas import TaskRead