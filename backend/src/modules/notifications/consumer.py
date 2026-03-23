import asyncio
import json
import aio_pika
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from core.database.session import db_session
from shared.messaging import BaseConsumer, rabbitmq_client
from .redis_client import redis_client
from .websocket_manager import manager
from .service import NotificationService


class NotificationConsumer(BaseConsumer):
    """
    Потребитель сообщений для уведомлений с поддержкой DLQ.
    """
    
    queue_name = settings.rabbitmq.notifications_queue
    prefetch_count = 10
    
    def __init__(self):
        super().__init__(rabbitmq_client, redis_client)
    
    async def handle_message(self, body: Dict[str, Any], message: aio_pika.IncomingMessage) -> bool:
        """Обработка входящего сообщения"""
        self.logger.info(f"Handling message: type={body.get('type')}, user_id={body.get('user_id')}")
        
        message_type = body.get("type")
        
        if message_type == "notification":
            return await self._process_notification(body, message.message_id)
        elif message_type == "broadcast":
            return await self._process_broadcast(body, message.message_id)
        elif message_type == "send_to_user":
            return await self._process_send_to_user(body, message.message_id)
        else:
            self.logger.warning(f"Unknown message type: {message_type}")
            return True
    
    async def _process_notification(self, body: dict, message_id: str) -> bool:
        """Обработка уведомления с сохранением в БД"""
        session = None
        
        try:
            # Проверяем обязательные поля
            required_fields = ["user_id", "notification_type", "title", "content"]
            missing_fields = [field for field in required_fields if field not in body]
            
            if missing_fields:
                self.logger.error(f"Missing required fields in message {message_id}: {missing_fields}")
                self.logger.error(f"Message body: {body}")
                return False
            
            self.logger.info(f"Processing notification for user {body['user_id']}: {body['title']}")
            
            session = db_session.get_consumer_session()
            
            async with session.begin():
                from core.database.models import NotificationType, NotificationPriority
                notification_service = NotificationService(session)
                
                notification_type = NotificationType(body["notification_type"])
                priority = NotificationPriority(body.get("priority", "medium"))
                
                notification = await notification_service.create(
                    user_id=body["user_id"],
                    notification_type=notification_type,
                    title=body["title"],
                    content=body["content"],
                    priority=priority,
                    data=body.get("data")
                )
                
                self.logger.info(f"Notification {notification.id} saved to database for user {body['user_id']}")
                
                # Отправляем через WebSocket
                ws_message = {
                    "id": notification.id,
                    "type": notification.type.value,
                    "priority": notification.priority.value,
                    "title": notification.title,
                    "content": notification.content,
                    "data": notification.data,
                    "created_at": notification.created_at.isoformat(),
                    "is_read": notification.is_read,
                    "message_id": message_id
                }
                
                sent = await manager.send_to_user(body["user_id"], ws_message)
                self.logger.info(f"Notification sent via WebSocket, delivered={sent}")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing notification: {e}", exc_info=True)
            self.logger.error(f"Message body that caused error: {body}")
            return False
        finally:
            if session:
                await session.close()
    
    async def _process_broadcast(self, body: dict, message_id: str) -> bool:
        """Обработка широковещательного уведомления"""
        session = None
        
        try:
            session = db_session.get_consumer_session()
            
            async with session.begin():
                from core.database.models import NotificationType, NotificationPriority
                notification_service = NotificationService(session)
                
                user_ids = body.get("user_ids", [])
                notification_type = NotificationType(body["notification_type"])
                priority = NotificationPriority(body.get("priority", "medium"))
                
                self.logger.info(f"Broadcasting to {len(user_ids)} users")
                
                notifications = []
                for user_id in user_ids:
                    notification = await notification_service.create(
                        user_id=user_id,
                        notification_type=notification_type,
                        title=body["title"],
                        content=body["content"],
                        priority=priority,
                        data=body.get("data")
                    )
                    notifications.append(notification)
                
                # Рассылка WebSocket сообщений
                ws_messages = []
                for notification in notifications:
                    ws_message = {
                        "id": notification.id,
                        "type": notification.type.value,
                        "priority": notification.priority.value,
                        "title": notification.title,
                        "content": notification.content,
                        "data": notification.data,
                        "created_at": notification.created_at.isoformat(),
                        "is_read": notification.is_read,
                        "message_id": f"{message_id}_{notification.id}"
                    }
                    ws_messages.append((notification.user_id, ws_message))
                
                await asyncio.gather(*[
                    manager.send_to_user(user_id, message)
                    for user_id, message in ws_messages
                ])
                
                self.logger.info(f"Broadcasted {len(notifications)} notifications")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing broadcast: {e}", exc_info=True)
            return False
        finally:
            if session:
                await session.close()
    
    async def _process_send_to_user(self, body: dict, message_id: str) -> bool:
        """Отправка сообщения через WebSocket без сохранения в БД"""
        try:
            user_id = body["user_id"]
            ws_message = body.get("message", {})
            
            self.logger.info(f"Sending custom message to user {user_id}: {ws_message.get('type')}")
            
            sent = await manager.send_to_user(user_id, ws_message)
            self.logger.info(f"Sent to user {user_id}: delivered={sent}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing send_to_user: {e}", exc_info=True)
            return False


# Глобальный экземпляр потребителя
notification_consumer = NotificationConsumer()