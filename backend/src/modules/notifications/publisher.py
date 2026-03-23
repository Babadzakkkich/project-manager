import uuid
from typing import List, Dict, Any, Optional
from core.config import settings
from shared.messaging import BasePublisher, rabbitmq_client


class NotificationPublisher(BasePublisher):
    """
    Издатель сообщений для уведомлений.
    """
    
    exchange = settings.rabbitmq.notifications_exchange
    default_routing_key = settings.rabbitmq.notifications_queue
    
    async def send_notification(
        self,
        user_id: int,
        notification_type: str,
        title: str,
        content: str,
        priority: str = "medium",
        data: Optional[Dict[str, Any]] = None,
        message_id: Optional[str] = None
    ) -> bool:
        """Отправить уведомление пользователю (сохраняется в БД)"""
        return await self.publish(
            message={
                "user_id": user_id,
                "notification_type": notification_type,
                "title": title,
                "content": content,
                "data": data or {}
            },
            priority=priority,
            message_id=message_id
        )
    
    async def broadcast_notification(
        self,
        user_ids: List[int],
        notification_type: str,
        title: str,
        content: str,
        priority: str = "medium",
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Разослать уведомление нескольким пользователям"""
        if not user_ids:
            return True
        
        messages = []
        for user_id in user_ids:
            messages.append({
                "user_id": user_id,
                "notification_type": notification_type,
                "title": title,
                "content": content,
                "data": data or {}
            })
        
        success_count = await self.publish_batch(
            messages=messages,
            priority=priority,
            batch_size=100
        )
        
        return success_count == len(messages)
    
    async def send_to_user(
        self,
        user_id: int,
        message: Dict[str, Any]
    ) -> bool:
        """
        Отправить произвольное сообщение пользователю через WebSocket
        (без сохранения в БД)
        """
        return await self.publish(
            message={
                "user_id": user_id,
                "message": message
            },
            message_type="send_to_user",  # Указываем специальный тип
            priority="high",
            message_id=str(uuid.uuid4())
        )
    
    def _get_message_type(self) -> str:
        return "notification"


# Глобальный экземпляр издателя
notification_publisher = NotificationPublisher()