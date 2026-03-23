"""Абстрактный базовый класс для потребителей"""

import asyncio
import json
import uuid
from typing import Optional, Dict, Any, Callable
from abc import ABC, abstractmethod
import aio_pika

from ..module import MessagingModule
from ..schemas import BaseMessage, MessagePriority
from core.logger import logger


class BaseConsumer(ABC):
    """
    Абстрактный базовый класс для потребителей сообщений.
    Каждый конкретный потребитель должен реализовать handle_message.
    """
    
    def __init__(
        self,
        messaging_module: MessagingModule,
        redis_client=None,
        prefetch_count: int = 10
    ):
        """
        Args:
            messaging_module: Модуль обмена сообщениями для этого потребителя
            redis_client: Клиент Redis для идемпотентности (опционально)
            prefetch_count: Количество сообщений, получаемых за раз
        """
        self.messaging = messaging_module
        self.redis = redis_client
        self.prefetch_count = prefetch_count
        self._running = False
        self._consumer_task: Optional[asyncio.Task] = None
        self._message_count = 0
        self.logger = logger
    
    async def start(self):
        """Запуск потребителя"""
        if self._running:
            self.logger.warning(f"Consumer {self.__class__.__name__} already running")
            return
        
        if not self.messaging.is_setup:
            self.logger.error("Messaging module not set up, cannot start consumer")
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
        self.logger.info(f"Entering consume loop for {self.__class__.__name__}")
        
        while self._running:
            try:
                await self.messaging.consume(
                    callback=self._handle_message,
                    prefetch_count=self.prefetch_count
                )
                
                # Ждем пока работает потребитель
                await asyncio.Event().wait()
                
            except asyncio.CancelledError:
                self.logger.info(f"Consumer loop cancelled for {self.__class__.__name__}")
                break
            except Exception as e:
                self.logger.error(f"Error in consumer loop: {e}", exc_info=True)
                if self._running:
                    await asyncio.sleep(5)
        
        self.logger.info(f"Exited consume loop for {self.__class__.__name__}")
    
    async def _handle_message(self, message: aio_pika.IncomingMessage):
        """Обработка входящего сообщения"""
        message_id = message.message_id or str(uuid.uuid4())
        self._message_count += 1
        
        self.logger.info(f"Processing message {message_id} (#{self._message_count})")
        
        try:
            # Проверка идемпотентности
            if self.redis and await self._is_message_processed(message_id):
                self.logger.info(f"Message {message_id} already processed, acknowledging")
                await self.messaging.client.ack_message(message)
                return
            
            # Декодируем сообщение
            body = json.loads(message.body.decode())
            
            # Обработка сообщения
            success = await self.handle_message(body, message)
            
            if success:
                if self.redis:
                    await self._mark_message_processed(message_id)
                await self.messaging.client.ack_message(message)
                self.logger.info(f"Message {message_id} processed successfully")
            else:
                # Если обработка не удалась, отправляем в DLQ
                self.logger.warning(f"Message {message_id} processing failed, moving to DLQ")
                await self.messaging.client.nack_message(message, requeue=False)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to decode message {message_id}: {e}")
            await self.messaging.client.ack_message(message)
        except Exception as e:
            self.logger.error(f"Error processing message {message_id}: {e}", exc_info=True)
            await self.messaging.client.nack_message(message, requeue=False)
    
    async def _is_message_processed(self, message_id: str) -> bool:
        """Проверить, обработано ли сообщение"""
        if self.redis:
            return await self.redis.exists(f"processed:{message_id}") > 0
        return False
    
    async def _mark_message_processed(self, message_id: str, ttl: int = 3600):
        """Отметить сообщение как обработанное"""
        if self.redis:
            await self.redis.setex(f"processed:{message_id}", ttl, "1")
    
    @abstractmethod
    async def handle_message(self, body: Dict[str, Any], message: aio_pika.IncomingMessage) -> bool:
        """
        Обработка сообщения.
        
        Args:
            body: Тело сообщения (уже декодированный JSON)
            message: Исходное сообщение RabbitMQ
            
        Returns:
            True при успешной обработке, False при ошибке
        """
        pass
    
    @property
    def is_running(self) -> bool:
        return self._running