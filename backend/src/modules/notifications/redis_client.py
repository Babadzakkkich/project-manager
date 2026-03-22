import asyncio
import json
import redis.asyncio as redis
from typing import Optional, Dict, Set, Any, Callable
from core.config import settings
from core.logger import logger


class RedisClient:
    """Клиент для работы с Redis с поддержкой множественных подписок"""
    
    def __init__(self):
        self.client: Optional[redis.Redis] = None
        self._connected = False
        self._pubsub: Optional[redis.client.PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._handlers: Dict[str, Set[Callable]] = {}  # channel -> handlers
        self._lock = asyncio.Lock()
    
    async def connect(self):
        """Установка соединения с Redis"""
        try:
            logger.info(f"Attempting to connect to Redis at {settings.redis.host}:{settings.redis.port}")
            
            self.client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=settings.redis.max_connections,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            
            # Проверяем соединение с повторными попытками
            for attempt in range(3):
                try:
                    await self.client.ping()
                    break
                except redis.ConnectionError as e:
                    if attempt == 2:
                        raise
                    logger.warning(f"Redis ping attempt {attempt + 1} failed: {e}")
                    await asyncio.sleep(1)
            
            self._pubsub = self.client.pubsub()
            self._connected = True
            
            # Запускаем фоновую задачу для прослушивания сообщений
            self._listener_task = asyncio.create_task(self._listen_messages())
            
            logger.info(f"Connected to Redis at {settings.redis.host}:{settings.redis.port}")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            logger.warning("Redis is not available. Notifications will not work.")
            self._connected = False
    
    async def disconnect(self):
        """Закрытие соединения"""
        self._connected = False
        
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        
        if self._pubsub:
            try:
                await self._pubsub.close()
            except Exception as e:
                logger.error(f"Error closing pubsub: {e}")
        
        if self.client:
            try:
                await self.client.close()
            except Exception as e:
                logger.error(f"Error closing Redis client: {e}")
        
        logger.info("Disconnected from Redis")
    
    async def _listen_messages(self):
        """Фоновая задача для прослушивания сообщений из Redis"""
        if not self._pubsub:
            return
        
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    data = message["data"]
                    
                    # Вызываем все обработчики для этого канала
                    async with self._lock:
                        handlers = self._handlers.get(channel, set()).copy()
                    
                    for handler in handlers:
                        try:
                            if asyncio.iscoroutinefunction(handler):
                                await handler(channel, data)
                            else:
                                handler(channel, data)
                        except Exception as e:
                            logger.error(f"Error in handler for channel {channel}: {e}")
                            
        except asyncio.CancelledError:
            logger.debug("Redis listener task cancelled")
        except Exception as e:
            if self._connected:
                logger.error(f"Redis listener error: {e}")
    
    async def subscribe(self, channel: str, handler: Callable):
        """Подписка на канал с обработчиком"""
        if not self._connected or not self._pubsub:
            logger.debug(f"Redis not connected, skipping subscribe to {channel}")
            return
        
        async with self._lock:
            if channel not in self._handlers:
                self._handlers[channel] = set()
                await self._pubsub.subscribe(channel)
                logger.debug(f"Subscribed to Redis channel: {channel}")
            
            self._handlers[channel].add(handler)
    
    async def unsubscribe(self, channel: str, handler: Callable):
        """Отписка от канала"""
        if not self._connected or not self._pubsub:
            return
        
        async with self._lock:
            if channel in self._handlers:
                self._handlers[channel].discard(handler)
                
                if not self._handlers[channel]:
                    del self._handlers[channel]
                    await self._pubsub.unsubscribe(channel)
                    logger.debug(f"Unsubscribed from Redis channel: {channel}")
    
    async def publish(self, channel: str, message: Dict[str, Any]) -> int:
        """Публикация сообщения в канал"""
        if not self._connected:
            logger.debug(f"Redis not connected, skipping publish to {channel}")
            return 0
        
        try:
            return await self.client.publish(channel, json.dumps(message, default=str))
        except Exception as e:
            logger.error(f"Failed to publish to Redis: {e}")
            return 0
    
    async def get_connection_count(self, user_id: int) -> int:
        """Получить количество активных соединений пользователя"""
        if not self._connected:
            return 0
        
        try:
            key = f"user:ws:{user_id}"
            return await self.client.scard(key)
        except Exception as e:
            logger.error(f"Failed to get connection count: {e}")
            return 0
    
    async def add_connection(self, user_id: int, connection_id: str):
        """Добавить соединение пользователя"""
        if not self._connected:
            return
        
        try:
            key = f"user:ws:{user_id}"
            await self.client.sadd(key, connection_id)
            await self.client.expire(key, 3600)  # TTL 1 час
        except Exception as e:
            logger.error(f"Failed to add connection: {e}")
    
    async def remove_connection(self, user_id: int, connection_id: str):
        """Удалить соединение пользователя"""
        if not self._connected:
            return
        
        try:
            key = f"user:ws:{user_id}"
            await self.client.srem(key, connection_id)
        except Exception as e:
            logger.error(f"Failed to remove connection: {e}")
    
    @property
    def is_connected(self) -> bool:
        """Проверка соединения с Redis"""
        return self._connected


redis_client = RedisClient()