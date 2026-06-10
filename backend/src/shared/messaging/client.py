import asyncio
import json
import uuid
from typing import Optional, Dict, Any, Callable, Union
import aio_pika
from aio_pika import Message, ExchangeType, connect_robust
from aio_pika.abc import AbstractRobustConnection, AbstractRobustChannel, AbstractRobustExchange, AbstractRobustQueue

from core.logger import logger
from .exceptions import ConnectionError, ConsumerError, QueueError, PublishError
from .schemas import BaseMessage


class RabbitMQClient:
    def __init__(self, url: str):
        self._url = url
        self._connection: Optional[AbstractRobustConnection] = None
        self._channel: Optional[AbstractRobustChannel] = None
        self._connected = False
        self._retry_connect = True
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 10
        self._reconnect_delay = 1
        self._max_reconnect_delay = 30
        
        self.metrics = {
            "messages_published": 0,
            "messages_consumed": 0,
            "errors": 0,
            "reconnections": 0,
            "exchanges": 0,
            "queues": 0
        }
    
    @property
    def is_connected(self) -> bool:
        return self._connected and self._connection is not None and not self._connection.is_closed
    
    @property
    def channel(self) -> Optional[AbstractRobustChannel]:
        return self._channel
    
    async def connect(self) -> bool:
        if self.is_connected:
            logger.info("Already connected to RabbitMQ")
            return True
        
        try:
            logger.info(f"Connecting to RabbitMQ at {self._url}...")
            
            self._connection = await connect_robust(
                self._url,
                client_properties={"connection_name": "shared-rabbitmq-client"}
            )
            
            self._channel = await self._connection.channel()
            self._connected = True
            self._reconnect_attempts = 0
            self.metrics["reconnections"] += 1
            
            logger.info("Successfully connected to RabbitMQ")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self._connected = False
            
            if self._retry_connect and self._reconnect_attempts < self._max_reconnect_attempts:
                self._reconnect_attempts += 1
                wait_time = min(self._reconnect_delay * (2 ** self._reconnect_attempts), self._max_reconnect_delay)
                logger.info(f"Retrying connection in {wait_time}s (attempt {self._reconnect_attempts}/{self._max_reconnect_attempts})")
                await asyncio.sleep(wait_time)
                return await self.connect()
            
            raise ConnectionError(f"Failed to connect to RabbitMQ after {self._reconnect_attempts} attempts")
    
    async def disconnect(self):
        self._retry_connect = False
        self._connected = False
        
        if self._channel and not self._channel.is_closed:
            try:
                await self._channel.close()
                logger.debug("Channel closed")
            except Exception as e:
                logger.error(f"Error closing channel: {e}")
        
        if self._connection and not self._connection.is_closed:
            try:
                await self._connection.close()
                logger.debug("Connection closed")
            except Exception as e:
                logger.error(f"Error closing connection: {e}")
        
        logger.info("Disconnected from RabbitMQ")
    
    async def declare_exchange(
        self,
        name: str,
        type: ExchangeType = ExchangeType.DIRECT,
        durable: bool = True,
        auto_delete: bool = False
    ) -> AbstractRobustExchange:
        if not self.is_connected:
            raise ConnectionError("Not connected to RabbitMQ")
        
        try:
            exchange = await self._channel.declare_exchange(
                name,
                type,
                durable=durable,
                auto_delete=auto_delete
            )
            self.metrics["exchanges"] += 1
            logger.debug(f"Exchange declared: {name} (type={type.value})")
            return exchange
        except Exception as e:
            self.metrics["errors"] += 1
            raise QueueError(f"Failed to declare exchange {name}: {e}")
    
    async def declare_queue(
        self,
        name: str,
        durable: bool = True,
        exclusive: bool = False,
        auto_delete: bool = False,
        arguments: Optional[Dict[str, Any]] = None
    ) -> AbstractRobustQueue:
        if not self.is_connected:
            raise ConnectionError("Not connected to RabbitMQ")
        
        try:
            queue = await self._channel.declare_queue(
                name,
                durable=durable,
                exclusive=exclusive,
                auto_delete=auto_delete,
                arguments=arguments
            )
            self.metrics["queues"] += 1
            logger.debug(f"Queue declared: {name}")
            return queue
        except Exception as e:
            self.metrics["errors"] += 1
            raise QueueError(f"Failed to declare queue {name}: {e}")
    
    async def delete_queue(self, name: str, if_unused: bool = False, if_empty: bool = False) -> bool:
        if not self.is_connected:
            raise ConnectionError("Not connected to RabbitMQ")
        
        try:
            deleted = await self._channel.queue_delete(name, if_unused=if_unused, if_empty=if_empty)
            logger.debug(f"Queue deleted: {name}")
            return deleted > 0
        except Exception as e:
            self.metrics["errors"] += 1
            logger.error(f"Failed to delete queue {name}: {e}")
            return False
    
    async def get_queue_info(self, name: str) -> Optional[Dict[str, Any]]:
        if not self.is_connected:
            return None
        
        try:
            queue = await self._channel.declare_queue(name, passive=True)
            return {
                "name": queue.name,
                "consumer_count": queue.consumer_count,
                "message_count": queue.declaration_result.message_count
            }
        except Exception:
            return None
    
    async def publish(
        self,
        exchange: Union[str, AbstractRobustExchange],
        routing_key: str,
        message: BaseMessage,
        priority: int = 5,
        delivery_mode: aio_pika.DeliveryMode = aio_pika.DeliveryMode.PERSISTENT,
        expiration: Optional[int] = None
    ) -> bool:
        if not self.is_connected:
            logger.warning("RabbitMQ not connected, cannot publish message")
            return False
        
        try:
            if isinstance(exchange, str):
                exchange_obj = await self._channel.get_exchange(exchange)
                if not exchange_obj:
                    raise QueueError(f"Exchange {exchange} not found")
            else:
                exchange_obj = exchange
            
            message_body = json.dumps(message.dict(), default=str).encode()
            
            amqp_message = Message(
                body=message_body,
                delivery_mode=delivery_mode,
                priority=priority,
                content_type="application/json",
                message_id=message.message_id,
                correlation_id=message.correlation_id,
                headers={
                    "x-message-type": message.type.value,
                    "x-published-at": asyncio.get_event_loop().time(),
                    **message.headers
                }
            )
            
            if expiration:
                amqp_message.expiration = str(expiration)
            
            await exchange_obj.publish(amqp_message, routing_key=routing_key)
            
            self.metrics["messages_published"] += 1
            logger.debug(f"Message {message.message_id} published to {exchange_obj.name}/{routing_key}")
            return True
            
        except Exception as e:
            self.metrics["errors"] += 1
            logger.error(f"Failed to publish message: {e}")
            raise PublishError(f"Failed to publish message: {e}")
    
    async def consume(
        self,
        queue: Union[str, AbstractRobustQueue],
        callback: Callable[[aio_pika.IncomingMessage], Any],
        prefetch_count: int = 10
    ):
        if not self.is_connected:
            raise ConnectionError("Not connected to RabbitMQ")
        
        try:
            if isinstance(queue, str):
                queue_obj = await self._channel.declare_queue(queue, passive=True)
                if not queue_obj:
                    raise QueueError(f"Queue {queue} not found")
            else:
                queue_obj = queue
            
            await self._channel.set_qos(prefetch_count=prefetch_count)
            
            await queue_obj.consume(callback)
            
            logger.info(f"Started consuming from queue: {queue_obj.name}")
            
        except Exception as e:
            self.metrics["errors"] += 1
            raise ConsumerError(f"Failed to start consumer: {e}")
    
    async def ack_message(self, message: aio_pika.IncomingMessage):
        try:
            await message.ack()
            self.metrics["messages_consumed"] += 1
            logger.debug(f"Message {message.message_id} acknowledged")
        except Exception as e:
            logger.error(f"Failed to ack message: {e}")
    
    async def nack_message(self, message: aio_pika.IncomingMessage, requeue: bool = False):
        try:
            await message.nack(requeue=requeue)
            logger.debug(f"Message {message.message_id} nacked, requeue={requeue}")
        except Exception as e:
            logger.error(f"Failed to nack message: {e}")
    
    def get_metrics(self) -> Dict[str, Any]:
        return {
            **self.metrics,
            "is_connected": self.is_connected,
            "reconnect_attempts": self._reconnect_attempts
        }