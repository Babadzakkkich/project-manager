from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, Dict, Any, List
from core.database.models import NotificationType, NotificationPriority

class NotificationRead(BaseModel):
    id: int
    user_id: int
    type: NotificationType
    priority: NotificationPriority
    title: str
    content: str
    data: Optional[Dict[str, Any]] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class NotificationListResponse(BaseModel):
    items: List[NotificationRead]
    total: int
    unread_count: int
    limit: int
    offset: int

class UnreadCountResponse(BaseModel):
    count: int

class MarkReadResponse(BaseModel):
    success: bool
    notification_id: Optional[int] = None
    count: Optional[int] = None