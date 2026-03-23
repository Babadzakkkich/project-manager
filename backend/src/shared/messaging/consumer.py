import asyncio
import json
import uuid
import aio_pika
from typing import Optional, Dict, Any, Callable, List, Type
from abc import ABC, abstractmethod
from datetime import datetime
from core.logger import logger


class BaseConsumer(ABC):
    """
    Базовый класс для потребителей сообщений.
    """
    
    queue_name: str = None
    prefetch_count: int = 10
    
    def __init__(self, rabbitmq_client, redis_client=None):
        self.rabbitmq = rabbitmq_client
        self.redis = redis_client
        self._running = False
        self._consumer_task: Optional[asyncio.Task] = None
        self._message_count = 0
        self.logger = logger
    
    async def start(self):
        """Запуск потребителя"""
        if self._running:
            self.logger.warning(f"Consumer {self.__class__.__name__} already running")
            return
        
        if not self.rabbitmq.is_connected:
            self.logger.error("RabbitMQ not connected, cannot start consumer")
            return
        
        self._running = True
        self._consumer_task = asyncio.create_task(self._consume_loop())
        
        self.logger.info(f"Consumer {self.__class__.__name__} started")
    
    async def stop(self):
        """Остановка потребителя"""
        self._running = False
        
        if self._consumer_task and not self._consumer_task.done():
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass
        
        self._consumer_task = None
        self.logger.info(f"Consumer {self.__class__.__name__} stopped")
    
    async def _consume_loop(self):
        """Основной цикл потребления сообщений"""
        if not self.queue_name:
            self.logger.error("queue_name not defined for consumer")
            return
        
        self.logger.info(f"Entering consume loop for queue: {self.queue_name}")
        
        while self._running:
            try:
                channel = self.rabbitmq.channel
                if not channel:
                    self.logger.error("No channel available")
                    await asyncio.sleep(5)
                    continue
                
                await channel.set_qos(prefetch_count=self.prefetch_count)
                
                # Используем основную очередь из rabbitmq клиента (она уже создана)
                queue = self.rabbitmq.main_queue
                if not queue:
                    self.logger.error(f"Queue {self.queue_name} not available")
                    await asyncio.sleep(5)
                    continue
                
                self.logger.info(f"Queue '{self.queue_name}' ready, starting consumer...")
                await queue.consume(self._handle_message)
                self.logger.info(f"Consumer is now listening for messages on {self.queue_name}")
                
                await asyncio.Event().wait()
                
            except asyncio.CancelledError:
                self.logger.info(f"Consumer loop cancelled for {self.queue_name}")
                break
            except Exception as e:
                self.logger.error(f"Error in consumer loop: {e}", exc_info=True)
                if self._running:
                    await asyncio.sleep(5)
        
        self.logger.info(f"Exited consume loop for {self.queue_name}")
    
    async def _handle_message(self, message: aio_pika.IncomingMessage):
        """Обработка входящего сообщения"""
        message_id = message.message_id or str(uuid.uuid4())
        self._message_count += 1
        
        self.logger.info(f"Processing message {message_id} (#{self._message_count})")
        
        try:
            # Проверка идемпотентности
            if self.redis and await self._is_message_processed(message_id):
                self.logger.info(f"Message {message_id} already processed, acknowledging")
                await self.rabbitmq.ack_message(message)
                return
            
            body = json.loads(message.body.decode())
            self.logger.info(f"Message type: {body.get('type')}")
            
            # Обработка сообщения
            success = await self.handle_message(body, message)
            
            if success:
                if self.redis:
                    await self._mark_message_processed(message_id)
                await self.rabbitmq.ack_message(message)
                self.logger.info(f"Message {message_id} processed successfully")
            else:
                # Если обработка не удалась, отправляем в DLQ
                self.logger.warning(f"Message {message_id} processing failed, moving to DLQ")
                await self.rabbitmq.nack_message(message, requeue=False)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to decode message {message_id}: {e}")
            await self.rabbitmq.ack_message(message)
        except Exception as e:
            self.logger.error(f"Error processing message {message_id}: {e}", exc_info=True)
            # При ошибке отправляем в DLQ
            await self.rabbitmq.nack_message(message, requeue=False)
    
    async def _is_message_processed(self, message_id: str) -> bool:
        if self.redis:
            return await self.redis.exists(f"processed:{message_id}")
        return False
    
    async def _mark_message_processed(self, message_id: str, ttl: int = 3600):
        if self.redis:
            await self.redis.set(f"processed:{message_id}", "1", ttl)
    
    @abstractmethod
    async def handle_message(self, body: Dict[str, Any], message: aio_pika.IncomingMessage) -> bool:
        """Обработка сообщения. Возвращает True при успехе."""
        pass
    
    @property
    def is_running(self) -> bool:
        return self._running