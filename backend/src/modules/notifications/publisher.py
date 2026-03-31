from typing import List, Dict, Any, Optional
from shared.messaging import BasePublisher, NotificationMessage, BroadcastMessage, WebSocketMessage, MessagePriority
from shared.messaging.module import MessagingModule


class NotificationPublisher(BasePublisher):
    """
    Издатель сообщений для уведомлений.
    """
    
    def __init__(self, messaging_module: MessagingModule):
        super().__init__(messaging_module)
        # Сохраняем routing_key для использования
        self._routing_key = None
    
    def get_message_type(self) -> str:
        return "notification"
    
    async def _ensure_routing_key(self):
        """Убедиться, что routing_key доступен"""
        if not self._routing_key:
            if not self.messaging.queue_name:
                raise RuntimeError("Messaging module not set up properly: queue_name is None")
            self._routing_key = self.messaging.queue_name
        return self._routing_key
    
    async def send_notification(
        self,
        user_id: int,
        notification_type: str,
        title: str,
        content: str,
        priority: MessagePriority = MessagePriority.MEDIUM,
        data: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Отправить уведомление пользователю (сохраняется в БД)
        """
        routing_key = await self._ensure_routing_key()
        
        # Добавляем notification_type в data, чтобы consumer мог его использовать
        message_data = data or {}
        message_data["notification_type"] = notification_type
        
        message = NotificationMessage(
            user_id=user_id,
            title=title,
            content=content,
            priority=priority,
            data=message_data,
            correlation_id=correlation_id
        )
        
        return await self.messaging.publish(
            routing_key=routing_key,
            message=message,
            priority=priority.rabbitmq_priority
        )
    
    async def broadcast_notification(
        self,
        user_ids: List[int],
        notification_type: str,
        title: str,
        content: str,
        priority: MessagePriority = MessagePriority.MEDIUM,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Разослать уведомление нескольким пользователям
        """
        if not user_ids:
            return True
        
        routing_key = await self._ensure_routing_key()
        
        # Добавляем notification_type в data
        message_data = data or {}
        message_data["notification_type"] = notification_type
        
        message = BroadcastMessage(
            user_ids=user_ids,
            notification_type=notification_type,
            title=title,
            content=content,
            priority=priority,
            data=message_data
        )
        
        return await self.messaging.publish(
            routing_key=routing_key,
            message=message,
            priority=priority.rabbitmq_priority
        )
    
    async def send_to_user(
        self,
        user_id: int,
        message_data: Dict[str, Any]
    ) -> bool:
        """
        Отправить произвольное сообщение пользователю через WebSocket
        (без сохранения в БД)
        """
        routing_key = await self._ensure_routing_key()
        
        message = WebSocketMessage(
            user_id=user_id,
            message=message_data
        )
        
        return await self.messaging.publish(
            routing_key=routing_key,
            message=message,
            priority=MessagePriority.HIGH.rabbitmq_priority
        )