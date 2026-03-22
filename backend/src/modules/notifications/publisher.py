import uuid
from typing import List, Dict, Any, Optional
from core.config import settings
from core.logger import logger
from .rabbitmq_client import rabbitmq_client


class NotificationPublisher:
    """Издатель сообщений для уведомлений"""
    
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
        """
        Отправить уведомление пользователю
        Возвращает True при успешной публикации
        """
        if not message_id:
            message_id = str(uuid.uuid4())
        
        message = {
            "type": "send_notification",
            "user_id": user_id,
            "notification_type": notification_type,
            "title": title,
            "content": content,
            "priority": priority,
            "data": data or {}
        }
        
        return await rabbitmq_client.publish(
            routing_key=settings.rabbitmq.notifications_queue,
            message=message,
            priority=self._get_priority_value(priority),
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
        """
        Разослать уведомление нескольким пользователям
        """
        if not user_ids:
            return True
        
        # Для большого количества пользователей разбиваем на пачки
        batch_size = 100
        success = True
        batch_message_id = str(uuid.uuid4())
        
        for i in range(0, len(user_ids), batch_size):
            batch = user_ids[i:i + batch_size]
            message = {
                "type": "broadcast_notification",
                "user_ids": batch,
                "notification_type": notification_type,
                "title": title,
                "content": content,
                "priority": priority,
                "data": data or {}
            }
            
            result = await rabbitmq_client.publish(
                routing_key=settings.rabbitmq.notifications_queue,
                message=message,
                priority=self._get_priority_value(priority),
                message_id=f"{batch_message_id}_batch_{i}"
            )
            if not result:
                success = False
                logger.warning(f"Failed to publish batch {i//batch_size + 1}")
        
        return success
    
    async def send_to_user(
        self,
        user_id: int,
        message: Dict[str, Any]
    ) -> bool:
        """
        Отправить произвольное сообщение пользователю через WebSocket
        (без сохранения в БД)
        """
        payload = {
            "type": "send_to_user",
            "user_id": user_id,
            "message": message
        }
        
        return await rabbitmq_client.publish(
            routing_key=settings.rabbitmq.notifications_queue,
            message=payload,
            message_id=str(uuid.uuid4())
        )
    
    def _get_priority_value(self, priority: str) -> int:
        """Преобразует текстовый приоритет в числовой для RabbitMQ"""
        priority_map = {
            "low": 0,
            "medium": 5,
            "high": 8,
            "urgent": 10
        }
        return priority_map.get(priority, 5)


# Глобальный экземпляр издателя
notification_publisher = NotificationPublisher()