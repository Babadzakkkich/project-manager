from typing import Optional, Dict, Any, Callable
import aio_pika
from aio_pika import ExchangeType

from .client import RabbitMQClient
from .exceptions import QueueError, ConnectionError
from .schemas import BaseMessage
from core.logger import logger


class MessagingModule:
    
    def __init__(self, client: RabbitMQClient, name: str):
        self.client = client
        self.name = name
        self._exchange: Optional[aio_pika.Exchange] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._dlq: Optional[aio_pika.Queue] = None
        self._exchange_name: Optional[str] = None
        self._queue_name: Optional[str] = None
        self._dlq_name: Optional[str] = None
        self._is_setup = False
    
    @property
    def is_setup(self) -> bool:
        return self._is_setup
    
    @property
    def exchange(self) -> Optional[aio_pika.Exchange]:
        return self._exchange
    
    @property
    def queue(self) -> Optional[aio_pika.Queue]:
        return self._queue
    
    @property
    def dlq(self) -> Optional[aio_pika.Queue]:
        return self._dlq
    
    @property
    def exchange_name(self) -> Optional[str]:
        return self._exchange_name
    
    @property
    def queue_name(self) -> Optional[str]:
        return self._queue_name
    
    @property
    def dlq_name(self) -> Optional[str]:
        return self._dlq_name
    
    async def setup(
        self,
        exchange_name: str,
        queue_name: Optional[str] = None,
        exchange_type: ExchangeType = ExchangeType.DIRECT,
        dlq_name: Optional[str] = None,
        queue_arguments: Optional[Dict[str, Any]] = None,
        dlq_arguments: Optional[Dict[str, Any]] = None
    ) -> 'MessagingModule':
        if self._is_setup:
            logger.warning(f"Module {self.name} already set up")
            return self
        
        if not self.client.is_connected:
            raise ConnectionError("RabbitMQ client not connected")
        
        try:
            self._exchange = await self.client.declare_exchange(
                exchange_name,
                type=exchange_type,
                durable=True
            )
            self._exchange_name = exchange_name
            logger.info(f"Exchange '{exchange_name}' created for module '{self.name}'")
            
            if dlq_name:
                dlq_arguments = dlq_arguments or {
                    "x-max-length": 10000,
                    "x-message-ttl": 86400000,
                    "x-max-length-bytes": 104857600 
                }
                
                self._dlq = await self.client.declare_queue(
                    dlq_name,
                    durable=True,
                    arguments=dlq_arguments
                )
                self._dlq_name = dlq_name
                logger.info(f"DLQ '{dlq_name}' created for module '{self.name}'")
            
            self._queue_name = queue_name or exchange_name
            queue_arguments = queue_arguments or {}
            
            if dlq_name:
                queue_arguments.update({
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": dlq_name,
                    "x-message-ttl": 3600000
                })
            
            self._queue = await self.client.declare_queue(
                self._queue_name,
                durable=True,
                arguments=queue_arguments
            )
            
            await self._queue.bind(self._exchange, routing_key=self._queue_name)
            logger.info(f"Queue '{self._queue_name}' bound to exchange '{exchange_name}' with routing key '{self._queue_name}'")
            
            self._is_setup = True
            return self
            
        except Exception as e:
            logger.error(f"Failed to setup module '{self.name}': {e}")
            raise
    
    async def publish(
        self,
        routing_key: str,
        message: BaseMessage,
        priority: int = 5,
        **kwargs
    ) -> bool:
        if not self._is_setup:
            raise RuntimeError(f"Module '{self.name}' not set up")
        
        return await self.client.publish(
            exchange=self._exchange,
            routing_key=routing_key,
            message=message,
            priority=priority,
            **kwargs
        )
    
    async def consume(
        self,
        callback: Callable[[aio_pika.IncomingMessage], Any],
        prefetch_count: int = 10
    ):
        if not self._is_setup:
            raise RuntimeError(f"Module '{self.name}' not set up")
        
        await self.client.consume(
            queue=self._queue,
            callback=callback,
            prefetch_count=prefetch_count
        )
    
    async def get_queue_info(self) -> Optional[Dict[str, Any]]:
        if not self._is_setup or not self._queue_name:
            return None
        
        return await self.client.get_queue_info(self._queue_name)
    
    async def delete_queue(self, if_empty: bool = False) -> bool:
        if not self._is_setup or not self._queue_name:
            return False
        
        return await self.client.delete_queue(self._queue_name, if_empty=if_empty)