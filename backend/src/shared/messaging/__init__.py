"""Модуль для обмена сообщениями через RabbitMQ"""

from .client import RabbitMQClient
from .module import MessagingModule
from .base.publisher import BasePublisher
from .base.consumer import BaseConsumer
from .schemas import (
    BaseMessage,
    NotificationMessage,
    BroadcastMessage,
    WebSocketMessage,
    AuditMessage,
    AnalyticsMessage,
    MessageType,
    MessagePriority
)
from .exceptions import (
    MessagingError,
    ConnectionError,
    QueueError,
    PublishError,
    ConsumerError
)

__all__ = [
    'RabbitMQClient',
    'MessagingModule',
    'BasePublisher',
    'BaseConsumer',
    'BaseMessage',
    'NotificationMessage',
    'BroadcastMessage',
    'WebSocketMessage',
    'AuditMessage',
    'AnalyticsMessage',
    'MessageType',
    'MessagePriority',
    'MessagingError',
    'ConnectionError',
    'QueueError',
    'PublishError',
    'ConsumerError',
]