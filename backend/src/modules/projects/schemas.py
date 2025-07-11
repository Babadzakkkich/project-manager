from __future__ import annotations
from pydantic import BaseModel
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List

if TYPE_CHECKING:
    from modules.groups.schemas import GroupRead
    from modules.tasks.schemas import TaskRead


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: datetime
    status: str
    group_ids: List[int]
    model_config = {"from_attributes": True}

class ProjectRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str
    model_config = {"from_attributes": True}
    
class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    
class ProjectReadWithRelations(ProjectRead):
    groups: List[GroupRead] = []
    tasks: List[TaskRead] = []
    
class AddGroupsToProject(BaseModel):
    group_ids: List[int]

class RemoveGroupsFromProject(AddGroupsToProject):
    pass
    
from modules.groups.schemas import GroupRead
from modules.tasks.schemas import TaskRead
