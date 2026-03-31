"""Pydantic схемы для сообщений"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
import uuid


class MessageType(str, Enum):
    """Типы сообщений"""
    NOTIFICATION = "notification"
    BROADCAST = "broadcast"
    WEBSOCKET = "websocket"
    ANALYTICS = "analytics"
    AUDIT = "audit"


class MessagePriority(str, Enum):
    """Приоритет сообщений"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    
    @property
    def rabbitmq_priority(self) -> int:
        """Преобразование в числовой приоритет RabbitMQ (0-10)"""
        mapping = {
            MessagePriority.LOW: 0,
            MessagePriority.MEDIUM: 5,
            MessagePriority.HIGH: 8,
            MessagePriority.URGENT: 10
        }
        return mapping[self]


class BaseMessage(BaseModel):
    """Базовое сообщение"""
    type: MessageType
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    correlation_id: Optional[str] = None
    reply_to: Optional[str] = None
    headers: Dict[str, str] = Field(default_factory=dict)
    
    class Config:
        use_enum_values = True


class NotificationMessage(BaseMessage):
    """Сообщение для уведомления"""
    type: MessageType = MessageType.NOTIFICATION
    user_id: int
    title: str
    content: str
    priority: MessagePriority = MessagePriority.MEDIUM
    data: Optional[Dict[str, Any]] = None


class BroadcastMessage(BaseMessage):
    """Широковещательное сообщение"""
    type: MessageType = MessageType.BROADCAST
    user_ids: List[int]
    notification_type: str
    title: str
    content: str
    priority: MessagePriority = MessagePriority.MEDIUM
    data: Optional[Dict[str, Any]] = None


class WebSocketMessage(BaseMessage):
    """Сообщение для WebSocket"""
    type: MessageType = MessageType.WEBSOCKET
    user_id: int
    message: Dict[str, Any]


class AuditMessage(BaseMessage):
    """Сообщение для аудита"""
    type: MessageType = MessageType.AUDIT
    user_id: int
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AnalyticsMessage(BaseMessage):
    """Сообщение для аналитики"""
    type: MessageType = MessageType.ANALYTICS
    event_type: str
    user_id: int
    group_id: Optional[int] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)