import uuid
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod
from core.logger import logger
from .rabbitmq_client import rabbitmq_client


class BasePublisher(ABC):
    """
    Базовый класс для издателей сообщений.
    """
    
    exchange: str = None
    default_routing_key: str = None
    priority_map: Dict[str, int] = {
        "low": 0,
        "medium": 5,
        "high": 8,
        "urgent": 10
    }
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logger
    
    async def publish(
        self,
        routing_key: Optional[str] = None,
        message: Optional[Dict[str, Any]] = None,
        priority: str = "medium",
        message_id: Optional[str] = None,
        message_type: Optional[str] = None,  # Добавляем возможность указать тип
        **kwargs
    ) -> bool:
        """
        Публикация сообщения.
        
        Args:
            routing_key: Ключ маршрутизации
            message: Сообщение
            priority: Приоритет сообщения
            message_id: ID сообщения
            message_type: Тип сообщения (если не указан, используется _get_message_type)
            **kwargs: Дополнительные поля для сообщения
        """
        if not self.exchange:
            self.logger.error("Exchange not defined for publisher")
            return False
        
        routing_key = routing_key or self.default_routing_key
        if not routing_key:
            self.logger.error("No routing key specified")
            return False
        
        exchange_obj = rabbitmq_client.exchange
        if not exchange_obj:
            self.logger.error("RabbitMQ exchange not available")
            return False
        
        # Формируем сообщение
        message_data = self._prepare_message(message, message_type=message_type, **kwargs)
        
        priority_value = self._get_priority_value(priority)
        
        result = await rabbitmq_client.publish(
            routing_key=routing_key,
            message=message_data,
            priority=priority_value,
            message_id=message_id,
            exchange=exchange_obj
        )
        
        if result:
            self.logger.debug(f"Message published: {message_data.get('type')}")
        
        return result
    
    async def publish_batch(
        self,
        messages: List[Dict[str, Any]],
        routing_key: Optional[str] = None,
        priority: str = "medium",
        batch_size: int = 100
    ) -> int:
        """
        Публикация нескольких сообщений.
        """
        routing_key = routing_key or self.default_routing_key
        if not routing_key:
            self.logger.error("No routing key specified")
            return 0
        
        success_count = 0
        batch_id = str(uuid.uuid4())
        
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            
            for j, message in enumerate(batch):
                result = await self.publish(
                    routing_key=routing_key,
                    message=message,
                    priority=priority,
                    message_id=f"{batch_id}_batch_{i//batch_size}_{j}"
                )
                if result:
                    success_count += 1
        
        return success_count
    
    def _prepare_message(self, message: Optional[Dict[str, Any]], message_type: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """
        Подготовка сообщения перед публикацией.
        """
        base_message = {
            "type": message_type or self._get_message_type()
        }
        
        base_message.update(kwargs)
        
        if message:
            base_message.update(message)
        
        return base_message
    
    def _get_message_type(self) -> str:
        """Получить тип сообщения"""
        return self.__class__.__name__.replace("Publisher", "").lower()
    
    def _get_priority_value(self, priority: str) -> int:
        return self.priority_map.get(priority, 5)