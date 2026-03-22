import asyncio
import json
import uuid
import aio_pika
from aio_pika import Message, ExchangeType, connect_robust
from typing import Optional, Dict, Any, Callable
from core.config import settings
from core.logger import logger


class RabbitMQClient:
    """Клиент для работы с RabbitMQ"""
    
    def __init__(self):
        self._connection: Optional[aio_pika.Connection] = None
        self._channel: Optional[aio_pika.Channel] = None
        self._exchange: Optional[aio_pika.Exchange] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._dlq_queue: Optional[aio_pika.Queue] = None
        self._connected = False
        self._consumers: Dict[str, Callable] = {}
        self._consumer_tasks: Dict[str, asyncio.Task] = {}
        self._retry_connect = True
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 10
    
    async def connect(self) -> bool:
        """Установка соединения с RabbitMQ"""
        try:
            logger.info(f"Attempting to connect to RabbitMQ at {settings.rabbitmq.host}:{settings.rabbitmq.port}")
            
            self._connection = await connect_robust(
                settings.rabbitmq_url,
                client_properties={
                    "connection_name": "notification-service"
                }
            )
            
            self._channel = await self._connection.channel()
            
            # Настройка Dead Letter Queue для гарантированной доставки
            # Сначала пытаемся объявить DLQ
            try:
                self._dlq_queue = await self._channel.declare_queue(
                    settings.rabbitmq.dlq_queue,
                    durable=True,
                    passive=False,
                    arguments={
                        "x-max-length": 10000,
                        "x-message-ttl": 86400000,  # 24 часа TTL
                        "x-max-length-bytes": 104857600,  # 100 MB
                    }
                )
            except aio_pika.exceptions.ChannelInvalidStateError as e:
                # Если очередь существует с другими параметрами, удаляем и создаем заново
                if "inequivalent arg" in str(e):
                    logger.warning(f"Queue {settings.rabbitmq.dlq_queue} exists with different args, deleting...")
                    await self._channel.queue_delete(settings.rabbitmq.dlq_queue)
                    self._dlq_queue = await self._channel.declare_queue(
                        settings.rabbitmq.dlq_queue,
                        durable=True,
                        arguments={
                            "x-max-length": 10000,
                            "x-message-ttl": 86400000,
                            "x-max-length-bytes": 104857600,
                        }
                    )
                else:
                    raise
            
            # Объявляем exchange для уведомлений
            self._exchange = await self._channel.declare_exchange(
                settings.rabbitmq.notifications_exchange,
                ExchangeType.DIRECT,
                durable=True
            )
            
            # Объявляем основную очередь с DLQ
            try:
                self._queue = await self._channel.declare_queue(
                    settings.rabbitmq.notifications_queue,
                    durable=True,
                    passive=False,
                    arguments={
                        "x-dead-letter-exchange": "",
                        "x-dead-letter-routing-key": settings.rabbitmq.dlq_queue,
                        "x-message-ttl": 3600000,  # 1 час TTL для сообщений
                        "x-max-retries": 3,
                    }
                )
            except aio_pika.exceptions.ChannelInvalidStateError as e:
                if "inequivalent arg" in str(e):
                    logger.warning(f"Queue {settings.rabbitmq.notifications_queue} exists with different args, deleting...")
                    await self._channel.queue_delete(settings.rabbitmq.notifications_queue)
                    self._queue = await self._channel.declare_queue(
                        settings.rabbitmq.notifications_queue,
                        durable=True,
                        arguments={
                            "x-dead-letter-exchange": "",
                            "x-dead-letter-routing-key": settings.rabbitmq.dlq_queue,
                            "x-message-ttl": 3600000,
                            "x-max-retries": 3,
                        }
                    )
                else:
                    raise
            
            # Привязываем очередь к exchange
            await self._queue.bind(self._exchange, routing_key=settings.rabbitmq.notifications_queue)
            
            self._connected = True
            self._reconnect_attempts = 0
            logger.info(f"Connected to RabbitMQ at {settings.rabbitmq.host}:{settings.rabbitmq.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self._connected = False
            
            if self._retry_connect and self._reconnect_attempts < self._max_reconnect_attempts:
                self._reconnect_attempts += 1
                wait_time = min(2 ** self._reconnect_attempts, 30)
                logger.info(f"Retrying connection in {wait_time}s (attempt {self._reconnect_attempts}/{self._max_reconnect_attempts})")
                await asyncio.sleep(wait_time)
                return await self.connect()
            
            return False
    
    async def disconnect(self):
        """Закрытие соединения"""
        self._connected = False
        self._retry_connect = False
        
        # Останавливаем все consumer задачи
        for task_name, task in self._consumer_tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                logger.info(f"Stopped consumer: {task_name}")
        
        if self._channel and not self._channel.is_closed:
            try:
                await self._channel.close()
            except Exception as e:
                logger.error(f"Error closing channel: {e}")
        
        if self._connection and not self._connection.is_closed:
            try:
                await self._connection.close()
            except Exception as e:
                logger.error(f"Error closing connection: {e}")
        
        logger.info("Disconnected from RabbitMQ")
    
    async def publish(
        self,
        routing_key: str,
        message: Dict[str, Any],
        priority: int = 0,
        delivery_mode: int = aio_pika.DeliveryMode.PERSISTENT,
        message_id: Optional[str] = None
    ) -> bool:
        """
        Публикация сообщения в очередь
        Возвращает True при успешной публикации
        """
        if not self._connected or not self._exchange:
            logger.warning(f"RabbitMQ not connected, cannot publish message to {routing_key}")
            return False
        
        try:
            if not message_id:
                message_id = str(uuid.uuid4())
            
            message_body = json.dumps(message, default=str).encode()
            
            await self._exchange.publish(
                Message(
                    body=message_body,
                    delivery_mode=delivery_mode,
                    priority=priority,
                    content_type="application/json",
                    message_id=message_id,
                    headers={
                        "x-retry-count": 0,
                        "x-published-at": asyncio.get_event_loop().time(),
                        "message_id": message_id
                    }
                ),
                routing_key=routing_key
            )
            
            logger.debug(f"Message {message_id} published to {routing_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish message: {e}")
            return False
    
    async def consume(
        self,
        queue_name: str,
        callback: Callable[[aio_pika.IncomingMessage], Any],
        prefetch_count: int = 10,
        consumer_name: str = "default"
    ):
        """Начать потребление сообщений из очереди"""
        if not self._connected:
            logger.error("RabbitMQ not connected, cannot start consumer")
            return
        
        try:
            # Используем passive=True чтобы не создавать очередь заново
            queue = await self._channel.declare_queue(
                queue_name,
                durable=True,
                passive=True
            )
            
            # Запускаем потребление
            await queue.consume(callback, prefetch_count=prefetch_count)
            logger.info(f"Started consuming from queue: {queue_name} (consumer: {consumer_name})")
            
        except aio_pika.exceptions.QueueNotFound:
            # Если очередь не найдена, создаем её
            logger.warning(f"Queue {queue_name} not found, creating...")
            queue = await self._channel.declare_queue(
                queue_name,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": settings.rabbitmq.dlq_queue,
                    "x-message-ttl": 3600000,
                    "x-max-retries": 3,
                }
            )
            await queue.consume(callback, prefetch_count=prefetch_count)
            logger.info(f"Created and started consuming from queue: {queue_name} (consumer: {consumer_name})")
        except Exception as e:
            logger.error(f"Failed to start consumer: {e}")
            raise
    
    async def get_queue_size(self, queue_name: str) -> int:
        """Получить размер очереди"""
        if not self._connected or not self._channel:
            return 0
        
        try:
            queue = await self._channel.declare_queue(
                queue_name,
                durable=True,
                passive=True
            )
            return queue.declaration_result.message_count
        except Exception as e:
            logger.error(f"Failed to get queue size: {e}")
            return 0
    
    async def ack_message(self, message: aio_pika.IncomingMessage):
        """Подтверждение обработки сообщения"""
        try:
            await message.ack()
            logger.debug(f"Message {message.message_id} acknowledged")
        except Exception as e:
            logger.error(f"Failed to ack message {message.message_id}: {e}")
    
    async def nack_message(self, message: aio_pika.IncomingMessage, requeue: bool = False):
        """Отказ от обработки сообщения"""
        try:
            await message.nack(requeue=requeue)
            logger.debug(f"Message {message.message_id} nacked, requeue={requeue}")
        except Exception as e:
            logger.error(f"Failed to nack message {message.message_id}: {e}")
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    @property
    def channel(self) -> Optional[aio_pika.Channel]:
        """Получить канал (для использования в consumer)"""
        return self._channel


rabbitmq_client = RabbitMQClient()