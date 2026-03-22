import asyncio
import json
import uuid
import aio_pika
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from core.database.session import db_session
from core.logger import logger
from .rabbitmq_client import rabbitmq_client
from .redis_client import redis_client
from .websocket_manager import manager
from .service import NotificationService


class NotificationConsumer:
    """Потребитель сообщений из RabbitMQ для уведомлений"""
    
    def __init__(self):
        self._running = False
        self._consumer_tasks: Dict[str, asyncio.Task] = {}
        self._retry_count = 0
        self._max_retries = 5
        self._message_count = 0
        self._failed_messages: Dict[str, int] = {}  # message_id -> failure_count
    
    async def start(self):
        """Запуск потребителя"""
        if self._running:
            logger.warning("Consumer already running")
            return
        
        if not rabbitmq_client.is_connected:
            logger.error("RabbitMQ not connected, cannot start consumer")
            return
        
        self._running = True
        
        # Запускаем основной потребитель
        self._consumer_tasks["main"] = asyncio.create_task(self._consume_loop())
        
        # Запускаем потребитель для DLQ
        self._consumer_tasks["dlq"] = asyncio.create_task(self._consume_dlq_loop())
        
        logger.info("Notification consumers started")
    
    async def stop(self):
        """Остановка потребителя"""
        self._running = False
        
        for name, task in self._consumer_tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                logger.info(f"Stopped consumer: {name}")
        
        self._consumer_tasks.clear()
        logger.info("All notification consumers stopped")
    
    async def _consume_loop(self):
        """Основной цикл потребления сообщений"""
        logger.info("Entering main consume loop")
        
        while self._running:
            try:
                # Получаем канал из клиента
                channel = rabbitmq_client.channel
                if not channel:
                    logger.error("No channel available")
                    await asyncio.sleep(5)
                    continue
                
                # Устанавливаем QoS (prefetch count)
                await channel.set_qos(prefetch_count=10)
                
                # Получаем очередь
                try:
                    queue = await channel.declare_queue(
                        settings.rabbitmq.notifications_queue,
                        durable=True,
                        passive=True
                    )
                except aio_pika.exceptions.QueueNotFound:
                    logger.warning(f"Queue {settings.rabbitmq.notifications_queue} not found, creating...")
                    queue = await channel.declare_queue(
                        settings.rabbitmq.notifications_queue,
                        durable=True,
                        arguments={
                            "x-dead-letter-exchange": "",
                            "x-dead-letter-routing-key": settings.rabbitmq.dlq_queue,
                            "x-message-ttl": 3600000,
                            "x-max-retries": 3,
                        }
                    )
                
                logger.info(f"Queue '{settings.rabbitmq.notifications_queue}' ready, starting consumer...")
                
                # Запускаем потребление с callback
                await queue.consume(self._handle_message)
                
                logger.info("Main consumer is now listening for messages")
                
                # Ждем, пока consumer работает
                await asyncio.Event().wait()
                
            except asyncio.CancelledError:
                logger.info("Main consumer loop cancelled")
                raise
            except Exception as e:
                logger.error(f"Error in consumer loop: {e}", exc_info=True)
                if self._running:
                    await asyncio.sleep(5)
        
        logger.info("Exited main consume loop")
    
    async def _consume_dlq_loop(self):
        """Цикл потребления сообщений из Dead Letter Queue"""
        logger.info("Entering DLQ consume loop")
        
        while self._running:
            try:
                channel = rabbitmq_client.channel
                if not channel:
                    await asyncio.sleep(5)
                    continue
                
                # Получаем DLQ
                dlq_queue = await channel.declare_queue(
                    settings.rabbitmq.dlq_queue,
                    durable=True,
                    passive=True
                )
                
                logger.info(f"DLQ '{settings.rabbitmq.dlq_queue}' ready, starting consumer...")
                
                # Запускаем потребление с callback
                await dlq_queue.consume(self._handle_dlq_message)
                
                logger.info("DLQ consumer is now listening for messages")
                
                await asyncio.Event().wait()
                
            except asyncio.CancelledError:
                logger.info("DLQ consumer loop cancelled")
                raise
            except Exception as e:
                logger.error(f"Error in DLQ consumer loop: {e}", exc_info=True)
                if self._running:
                    await asyncio.sleep(10)
        
        logger.info("Exited DLQ consume loop")
    
    async def _handle_message(self, message: aio_pika.IncomingMessage):
        """Обработка входящего сообщения"""
        message_id = message.message_id or str(uuid.uuid4())
        self._message_count += 1
        
        logger.info(f"=== Processing message {message_id} (#{self._message_count}) ===")
        
        try:
            # Проверяем идемпотентность
            if await redis_client.is_message_processed(message_id):
                logger.info(f"Message {message_id} already processed, acknowledging")
                await message.ack()
                return
            
            body = json.loads(message.body.decode())
            logger.info(f"Message type: {body.get('type')}")
            
            # Обрабатываем сообщение в транзакции
            success = await self._process_message_with_transaction(body, message_id)
            
            if success:
                # Отмечаем сообщение как обработанное
                await redis_client.mark_message_processed(message_id)
                await message.ack()
                logger.info(f"Message {message_id} processed and acknowledged successfully")
            else:
                # Сообщение не удалось обработать
                await self._handle_failed_message(message, message_id, body)
                
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode message {message_id}: {e}")
            await message.ack()  # Невалидный JSON, удаляем из очереди
        except Exception as e:
            logger.error(f"Error processing message {message_id}: {e}", exc_info=True)
            await self._handle_failed_message(message, message_id, None)
    
    async def _process_message_with_transaction(self, body: Dict[str, Any], message_id: str) -> bool:
        """Обработка сообщения в транзакции"""
        session = None
        
        try:
            session = db_session.get_consumer_session()
            
            async with session.begin():
                message_type = body.get("type")
                
                if message_type == "send_notification":
                    success = await self._process_notification(session, body, message_id)
                elif message_type == "broadcast_notification":
                    success = await self._process_broadcast(session, body, message_id)
                elif message_type == "send_to_user":
                    success = await self._process_send_to_user(session, body, message_id)
                else:
                    logger.warning(f"Unknown message type: {message_type}")
                    return True
                
                return success
                
        except Exception as e:
            logger.error(f"Transaction failed for message {message_id}: {e}", exc_info=True)
            return False
        finally:
            if session:
                await session.close()
    
    async def _process_notification(self, session: AsyncSession, body: dict, message_id: str) -> bool:
        """Обработка уведомления с сохранением в БД"""
        try:
            logger.info(f"Creating notification for user {body['user_id']}")
            
            from core.database.models import NotificationType, NotificationPriority
            notification_service = NotificationService(session)
            
            notification_type = NotificationType(body["notification_type"])
            priority = NotificationPriority(body.get("priority", "medium"))
            
            # Создаем уведомление в БД
            notification = await notification_service.create(
                user_id=body["user_id"],
                notification_type=notification_type,
                title=body["title"],
                content=body["content"],
                priority=priority,
                data=body.get("data")
            )
            
            logger.info(f"Notification {notification.id} saved to database")
            
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
            logger.info(f"Notification sent via WebSocket, delivered={sent}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error processing notification: {e}", exc_info=True)
            raise  # Пробрасываем для отката транзакции
    
    async def _process_broadcast(self, session: AsyncSession, body: dict, message_id: str) -> bool:
        """Обработка широковещательного уведомления"""
        try:
            from core.database.models import NotificationType, NotificationPriority
            notification_service = NotificationService(session)
            
            user_ids = body.get("user_ids", [])
            notification_type = NotificationType(body["notification_type"])
            priority = NotificationPriority(body.get("priority", "medium"))
            
            logger.info(f"Broadcasting to {len(user_ids)} users")
            
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
            
            # Параллельная отправка
            await asyncio.gather(*[
                manager.send_to_user(user_id, message)
                for user_id, message in ws_messages
            ])
            
            logger.info(f"Broadcasted {len(notifications)} notifications")
            return True
            
        except Exception as e:
            logger.error(f"Error processing broadcast: {e}", exc_info=True)
            raise
    
    async def _process_send_to_user(self, session: AsyncSession, body: dict, message_id: str) -> bool:
        """Отправка сообщения через WebSocket без сохранения в БД"""
        try:
            ws_message = body.get("message", {})
            user_id = body["user_id"]
            
            logger.info(f"Sending custom message to user {user_id}: {ws_message.get('type')}")
            
            sent = await manager.send_to_user(user_id, ws_message)
            logger.info(f"Sent to user {user_id}: delivered={sent}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error processing send_to_user: {e}", exc_info=True)
            raise
    
    async def _handle_failed_message(self, message: aio_pika.IncomingMessage, message_id: str, body: Optional[dict]):
        """Обработка неудачного сообщения"""
        # Увеличиваем счетчик неудач
        self._failed_messages[message_id] = self._failed_messages.get(message_id, 0) + 1
        failure_count = self._failed_messages[message_id]
        
        # Получаем retry count из заголовков
        retry_count = 0
        if message.headers:
            retry_count = message.headers.get("x-retry-count", 0)
        
        if failure_count <= 3 and retry_count <= 3:
            # Отправляем в DLQ для повторной обработки
            logger.warning(f"Message {message_id} failed {failure_count} times, moving to DLQ")
            await message.nack(requeue=False)
        else:
            # Слишком много неудач, удаляем из очереди
            logger.error(f"Message {message_id} failed permanently, discarding")
            
            # Отправляем уведомление администратору о проблеме
            if body:
                await self._notify_admin_about_failure(body, message_id)
            
            await message.ack()
        
        # Очищаем старые записи о неудачных сообщениях
        self._cleanup_failed_messages()
    
    async def _handle_dlq_message(self, message: aio_pika.IncomingMessage):
        """Обработка сообщений из Dead Letter Queue"""
        message_id = message.message_id or str(uuid.uuid4())
        
        try:
            body = json.loads(message.body.decode())
            logger.warning(f"Processing DLQ message {message_id}: {body.get('type')}")
            
            # Логируем информацию о сообщении для мониторинга
            failed_at = datetime.now().isoformat()
            error_info = {
                "message_id": message_id,
                "failed_at": failed_at,
                "body": body,
                "headers": dict(message.headers) if message.headers else {}
            }
            
            # Сохраняем в Redis для мониторинга
            await redis_client.set_json(
                f"dlq:{message_id}",
                error_info,
                ttl=86400  # Храним 24 часа
            )
            
            # Отправляем уведомление администратору
            await self._notify_admin_about_failure(body, message_id, is_dlq=True)
            
            # Подтверждаем обработку DLQ сообщения
            await message.ack()
            logger.info(f"DLQ message {message_id} processed and acknowledged")
            
        except Exception as e:
            logger.error(f"Error processing DLQ message {message_id}: {e}", exc_info=True)
            await message.nack(requeue=False)
    
    async def _notify_admin_about_failure(self, body: dict, message_id: str, is_dlq: bool = False):
        """Отправить уведомление администратору о проблеме"""
        try:
            # Находим администраторов системы
            session = db_session.get_consumer_session()
            async with session:
                from core.database.models import User, GroupMember, UserRole
                
                # Находим супер-админов
                stmt = select(User).join(GroupMember).where(
                    GroupMember.role == UserRole.SUPER_ADMIN
                )
                result = await session.execute(stmt)
                admins = result.scalars().all()
                
                if admins:
                    notification_service = NotificationService(session)
                    
                    for admin in admins:
                        await notification_service.send(
                            user_id=admin.id,
                            notification_type="system_error",
                            title="Ошибка обработки уведомления",
                            content=f"Сообщение {message_id} {'попало в DLQ' if is_dlq else 'не удалось обработать'}",
                            priority="high",
                            data={
                                "message_id": message_id,
                                "message_type": body.get("type"),
                                "is_dlq": is_dlq
                            }
                        )
        except Exception as e:
            logger.error(f"Failed to notify admin about failure: {e}")
    
    def _cleanup_failed_messages(self):
        """Очистка старых записей о неудачных сообщениях"""
        # Ограничиваем размер словаря
        if len(self._failed_messages) > 1000:
            # Удаляем половину старых записей
            keys_to_remove = list(self._failed_messages.keys())[:500]
            for key in keys_to_remove:
                del self._failed_messages[key]
    
    @property
    def is_running(self) -> bool:
        return self._running
    
    @property
    def failed_messages_count(self) -> int:
        return len(self._failed_messages)


# Глобальный экземпляр потребителя
notification_consumer = NotificationConsumer()