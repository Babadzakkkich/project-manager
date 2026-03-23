import json
import aio_pika
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from shared.messaging import BaseConsumer, NotificationMessage, BroadcastMessage, WebSocketMessage, MessageType, MessagePriority
from shared.messaging.module import MessagingModule
from core.database.session import db_session
from .redis_client import redis_client
from .websocket_manager import manager
from .service import NotificationService


class NotificationConsumer(BaseConsumer):
    """
    Потребитель сообщений для уведомлений.
    """
    
    def __init__(self, messaging_module: MessagingModule):
        super().__init__(messaging_module, redis_client, prefetch_count=10)
    
    async def handle_message(self, body: Dict[str, Any], message: aio_pika.IncomingMessage) -> bool:
        """Обработка входящего сообщения"""
        message_type = body.get("type")
        
        if message_type == "notification" or message_type == MessageType.NOTIFICATION:
            return await self._process_notification(body, message.message_id)
        elif message_type == "broadcast" or message_type == MessageType.BROADCAST:
            return await self._process_broadcast(body, message.message_id)
        elif message_type == "websocket" or message_type == MessageType.WEBSOCKET:
            return await self._process_websocket(body, message.message_id)
        else:
            self.logger.warning(f"Unknown message type: {message_type}")
            return True
    
    async def _process_notification(self, body: dict, message_id: str) -> bool:
        """Обработка уведомления с сохранением в БД"""
        session = None
        
        try:
            # Валидируем сообщение через Pydantic
            notification = NotificationMessage(**body)
            
            self.logger.info(f"Processing notification for user {notification.user_id}: {notification.title}")
            
            session = db_session.get_consumer_session()
            
            async with session.begin():
                from core.database.models import NotificationType, NotificationPriority
                notification_service = NotificationService(session)
                
                # Преобразуем строку в Enum
                # notification.type может быть 'notification' (MessageType) или конкретный тип уведомления
                notification_type_str = notification.data.get("notification_type") if notification.data else None
                
                if notification_type_str:
                    # Если в data есть notification_type, используем его
                    notification_type = NotificationType(notification_type_str)
                else:
                    # Иначе используем тип из сообщения (может быть невалидным)
                    # Для обратной совместимости
                    try:
                        notification_type = NotificationType(notification.type)
                    except ValueError:
                        # Если тип не валидный, используем дефолтный
                        self.logger.warning(f"Invalid notification type: {notification.type}, using TASK_CREATED as default")
                        notification_type = NotificationType.TASK_CREATED
                
                # notification.priority уже строка из-за use_enum_values=True
                priority = NotificationPriority(notification.priority)
                
                db_notification = await notification_service.create(
                    user_id=notification.user_id,
                    notification_type=notification_type,
                    title=notification.title,
                    content=notification.content,
                    priority=priority,
                    data=notification.data
                )
                
                self.logger.info(f"Notification {db_notification.id} saved to database")
                
                # Отправляем через WebSocket
                ws_message = {
                    "id": db_notification.id,
                    "type": db_notification.type.value,
                    "priority": db_notification.priority.value,
                    "title": db_notification.title,
                    "content": db_notification.content,
                    "data": db_notification.data,
                    "created_at": db_notification.created_at.isoformat(),
                    "is_read": db_notification.is_read,
                    "message_id": message_id
                }
                
                sent = await manager.send_to_user(notification.user_id, ws_message)
                self.logger.info(f"Notification sent via WebSocket, delivered={sent}")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing notification: {e}", exc_info=True)
            return False
        finally:
            if session:
                await session.close()
    
    async def _process_broadcast(self, body: dict, message_id: str) -> bool:
        """Обработка широковещательного уведомления"""
        session = None
        
        try:
            broadcast = BroadcastMessage(**body)
            
            session = db_session.get_consumer_session()
            
            async with session.begin():
                from core.database.models import NotificationType, NotificationPriority
                notification_service = NotificationService(session)
                
                # Получаем тип уведомления из данных
                notification_type_value = broadcast.notification_type
                if not notification_type_value:
                    self.logger.error("Missing notification_type in broadcast message")
                    return False
                
                # Преобразуем строки в Enum
                notification_type = NotificationType(notification_type_value)
                # broadcast.priority уже строка из-за use_enum_values=True
                priority = NotificationPriority(broadcast.priority)
                
                notifications = []
                for user_id in broadcast.user_ids:
                    notification = await notification_service.create(
                        user_id=user_id,
                        notification_type=notification_type,
                        title=broadcast.title,
                        content=broadcast.content,
                        priority=priority,
                        data=broadcast.data
                    )
                    notifications.append(notification)
                
                # Рассылка WebSocket сообщений
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
                    await manager.send_to_user(notification.user_id, ws_message)
                
                self.logger.info(f"Broadcasted {len(notifications)} notifications")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing broadcast: {e}", exc_info=True)
            return False
        finally:
            if session:
                await session.close()
    
    async def _process_websocket(self, body: dict, message_id: str) -> bool:
        """Отправка сообщения через WebSocket без сохранения в БД"""
        try:
            ws_message = WebSocketMessage(**body)
            
            self.logger.info(f"Sending custom message to user {ws_message.user_id}")
            
            sent = await manager.send_to_user(ws_message.user_id, ws_message.message)
            self.logger.info(f"Sent to user {ws_message.user_id}: delivered={sent}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing websocket message: {e}", exc_info=True)
            return False