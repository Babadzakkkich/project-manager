"""Абстрактный базовый класс для издателей"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
import asyncio
import uuid

from ..module import MessagingModule
from ..schemas import BaseMessage, MessagePriority
from core.logger import logger


class BasePublisher(ABC):
    """
    Абстрактный базовый класс для издателей сообщений.
    Каждый конкретный издатель должен определить свой тип сообщения.
    """
    
    def __init__(self, messaging_module: MessagingModule):
        """
        Args:
            messaging_module: Модуль обмена сообщениями для этого издателя
        """
        self.messaging = messaging_module
        self.logger = logger
    
    @abstractmethod
    def get_message_type(self) -> str:
        """Получить тип сообщения для этого издателя"""
        pass
    
    async def publish(
        self,
        routing_key: str,
        data: Dict[str, Any],
        priority: MessagePriority = MessagePriority.MEDIUM,
        correlation_id: Optional[str] = None,
        reply_to: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> bool:
        """
        Опубликовать сообщение.
        
        Args:
            routing_key: Ключ маршрутизации
            data: Данные сообщения
            priority: Приоритет сообщения
            correlation_id: ID для корреляции запросов
            reply_to: Очередь для ответов
            headers: Дополнительные заголовки
            
        Returns:
            True если успешно
        """
        # Создаем сообщение
        message = self._create_message(
            data=data,
            priority=priority,
            correlation_id=correlation_id,
            reply_to=reply_to,
            headers=headers,
            **kwargs
        )
        
        # Публикуем
        return await self.messaging.publish(
            routing_key=routing_key,
            message=message,
            priority=priority.rabbitmq_priority
        )
    
    async def publish_batch(
        self,
        messages: List[Dict[str, Any]],
        routing_key: Optional[str] = None,
        priority: MessagePriority = MessagePriority.MEDIUM,
        batch_size: int = 100
    ) -> int:
        """
        Публикация нескольких сообщений.
        
        Args:
            messages: Список данных сообщений
            routing_key: Ключ маршрутизации (если не указан, используется default)
            priority: Приоритет сообщений
            batch_size: Размер пакета
            
        Returns:
            Количество успешно опубликованных сообщений
        """
        if not routing_key:
            raise ValueError("routing_key must be specified")
        
        success_count = 0
        batch_id = str(uuid.uuid4())
        
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            
            for j, message_data in enumerate(batch):
                result = await self.publish(
                    routing_key=routing_key,
                    data=message_data,
                    priority=priority,
                    correlation_id=f"{batch_id}_batch_{i//batch_size}_{j}"
                )
                if result:
                    success_count += 1
        
        self.logger.info(f"Published {success_count}/{len(messages)} messages in batch")
        return success_count
    
    def _create_message(
        self,
        data: Dict[str, Any],
        priority: MessagePriority = MessagePriority.MEDIUM,
        correlation_id: Optional[str] = None,
        reply_to: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> BaseMessage:
        """
        Создать сообщение (может быть переопределено в наследниках).
        """
        return BaseMessage(
            type=self.get_message_type(),
            correlation_id=correlation_id,
            reply_to=reply_to,
            headers=headers or {},
            **kwargs,
            **data
        )