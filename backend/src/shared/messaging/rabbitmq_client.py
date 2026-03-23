import asyncio
import json
import uuid
import aio_pika
from aio_pika import Message, ExchangeType, connect_robust
from typing import Optional, Dict, Any, Callable, Union
from core.config import settings
from core.logger import logger


class RabbitMQClient:
    """
    Универсальный клиент для работы с RabbitMQ.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self._config = config or {
            "url": settings.rabbitmq_url,
            "exchange": settings.rabbitmq.notifications_exchange,
            "queue": settings.rabbitmq.notifications_queue,
            "dlq_queue": settings.rabbitmq.dlq_queue,
        }
        
        self._connection: Optional[aio_pika.Connection] = None
        self._channel: Optional[aio_pika.Channel] = None
        self._exchange: Optional[aio_pika.Exchange] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._dlq_queue: Optional[aio_pika.Queue] = None
        self._connected = False
        self._retry_connect = True
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 10
        
        self._consumers: Dict[str, Dict[str, Any]] = {}
        self._consumer_tasks: Dict[str, asyncio.Task] = {}
    
    async def connect(self) -> bool:
        """Установка соединения с RabbitMQ и создание очередей"""
        try:
            logger.info(f"Attempting to connect to RabbitMQ...")
            
            self._connection = await connect_robust(
                self._config["url"],
                client_properties={"connection_name": "shared-rabbitmq-client"}
            )
            
            self._channel = await self._connection.channel()
            
            # Создаем exchange
            self._exchange = await self._channel.declare_exchange(
                self._config["exchange"],
                ExchangeType.DIRECT,
                durable=True
            )
            
            # Создаем DLQ очередь
            dlq_arguments = {
                "x-max-length": 10000,
                "x-message-ttl": 86400000,  # 24 часа
                "x-max-length-bytes": 104857600,  # 100 MB
            }
            
            self._dlq_queue = await self._channel.declare_queue(
                self._config["dlq_queue"],
                durable=True,
                arguments=dlq_arguments
            )
            
            # Создаем основную очередь с DLQ настройками
            queue_arguments = {
                "x-dead-letter-exchange": "",
                "x-dead-letter-routing-key": self._config["dlq_queue"],
                "x-message-ttl": 3600000,  # 1 час TTL для сообщений
            }
            
            # Используем declare_queue с удалением существующей очереди, если нужно
            self._queue = await self._channel.declare_queue(
                self._config["queue"],
                durable=True,
                arguments=queue_arguments
            )
            
            # Привязываем очередь к exchange
            await self._queue.bind(self._exchange, routing_key=self._config["queue"])
            logger.info(f"Queue '{self._config['queue']}' bound to exchange '{self._config['exchange']}'")
            logger.info(f"DLQ '{self._config['dlq_queue']}' created")
            
            self._connected = True
            self._reconnect_attempts = 0
            logger.info("Connected to RabbitMQ successfully")
            return True
            
        except Exception as e:
            error_str = str(e)
            # Если очередь существует с несовместимыми аргументами, удаляем её и создаем заново
            if "inequivalent arg" in error_str or "PRECONDITION_FAILED" in error_str:
                logger.warning(f"Queue exists with incompatible args, deleting and recreating...")
                try:
                    await self._channel.queue_delete(self._config["queue"])
                    logger.info(f"Queue '{self._config['queue']}' deleted")
                    
                    # Создаем заново
                    queue_arguments = {
                        "x-dead-letter-exchange": "",
                        "x-dead-letter-routing-key": self._config["dlq_queue"],
                        "x-message-ttl": 3600000,
                    }
                    
                    self._queue = await self._channel.declare_queue(
                        self._config["queue"],
                        durable=True,
                        arguments=queue_arguments
                    )
                    
                    await self._queue.bind(self._exchange, routing_key=self._config["queue"])
                    logger.info(f"Queue '{self._config['queue']}' recreated and bound")
                    
                    self._connected = True
                    self._reconnect_attempts = 0
                    return True
                    
                except Exception as delete_error:
                    logger.error(f"Failed to recreate queue: {delete_error}")
                    self._connected = False
                    return False
            else:
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
        
        for name, task in self._consumer_tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                logger.info(f"Stopped consumer: {name}")
        self._consumer_tasks.clear()
        
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
    
    async def get_queue(self, queue_name: str, passive: bool = True) -> Optional[aio_pika.Queue]:
        """Получить очередь (только для существующих очередей)"""
        if not self._channel:
            return None
        
        try:
            return await self._channel.declare_queue(
                queue_name,
                durable=True,
                passive=passive
            )
        except Exception as e:
            if "NOT_FOUND" in str(e) or "not found" in str(e).lower():
                return None
            raise
    
    async def publish(
        self,
        routing_key: str,
        message: Dict[str, Any],
        priority: int = 0,
        delivery_mode: int = aio_pika.DeliveryMode.PERSISTENT,
        message_id: Optional[str] = None,
        exchange: Optional[aio_pika.Exchange] = None
    ) -> bool:
        """Публикация сообщения"""
        if not self._connected:
            logger.warning("RabbitMQ not connected, cannot publish message")
            return False
        
        exchange_to_use = exchange or self._exchange
        if not exchange_to_use:
            logger.warning("No exchange available for publishing")
            return False
        
        try:
            if not message_id:
                message_id = str(uuid.uuid4())
            
            message_body = json.dumps(message, default=str).encode()
            
            await exchange_to_use.publish(
                Message(
                    body=message_body,
                    delivery_mode=delivery_mode,
                    priority=priority,
                    content_type="application/json",
                    message_id=message_id,
                    headers={"x-published-at": asyncio.get_event_loop().time()}
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
        consumer_name: str = "default"
    ):
        """Начать потребление сообщений"""
        if not self._connected or not self._channel:
            logger.error("RabbitMQ not connected, cannot start consumer")
            return
        
        try:
            queue = await self.get_queue(queue_name, passive=False)
            if not queue:
                logger.error(f"Queue {queue_name} not found")
                return
            
            self._consumers[consumer_name] = {
                "queue": queue,
                "callback": callback
            }
            
            await queue.consume(callback)
            logger.info(f"Started consuming from queue: {queue_name} (consumer: {consumer_name})")
            
        except Exception as e:
            logger.error(f"Failed to start consumer: {e}")
            raise
    
    async def ack_message(self, message: aio_pika.IncomingMessage):
        try:
            await message.ack()
            logger.debug(f"Message {message.message_id} acknowledged")
        except Exception as e:
            logger.error(f"Failed to ack message: {e}")
    
    async def nack_message(self, message: aio_pika.IncomingMessage, requeue: bool = False):
        try:
            await message.nack(requeue=requeue)
            logger.debug(f"Message {message.message_id} nacked, requeue={requeue}")
        except Exception as e:
            logger.error(f"Failed to nack message: {e}")
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    @property
    def channel(self) -> Optional[aio_pika.Channel]:
        return self._channel
    
    @property
    def exchange(self) -> Optional[aio_pika.Exchange]:
        return self._exchange
    
    @property
    def main_queue(self) -> Optional[aio_pika.Queue]:
        return self._queue
    
    @property
    def dlq_queue(self) -> Optional[aio_pika.Queue]:
        return self._dlq_queue


# Глобальный экземпляр клиента
rabbitmq_client = RabbitMQClient()