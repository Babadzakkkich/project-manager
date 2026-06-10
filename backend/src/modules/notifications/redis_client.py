import asyncio
import json
import redis.asyncio as redis
from typing import Optional, Dict, Any
from core.config import settings
from core.logger import logger


class RedisClient:    
    def __init__(self):
        self.client: Optional[redis.Redis] = None
        self._connected = False
    
    async def connect(self):
        try:
            logger.info(f"Connecting to Redis at {settings.redis.host}:{settings.redis.port}")
            
            self.client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=settings.redis.max_connections,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            
            await self.client.ping()
            self._connected = True
            logger.info(f"Connected to Redis at {settings.redis.host}:{settings.redis.port}")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self._connected = False
    
    async def disconnect(self):
        if self.client:
            try:
                await self.client.close()
            except Exception as e:
                logger.error(f"Error closing Redis client: {e}")
        logger.info("Disconnected from Redis")
    
    async def get(self, key: str) -> Optional[str]:
        if not self._connected:
            return None
        try:
            return await self.client.get(key)
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: str,
        ttl: Optional[int] = None
    ) -> bool:
        if not self._connected:
            return False
        try:
            if ttl:
                await self.client.setex(key, ttl, value)
            else:
                await self.client.set(key, value)
            return True
        except Exception as e:
            logger.error(f"Redis set error: {e}")
            return False
    
    async def setex(self, key: str, ttl: int, value: str) -> bool:
        return await self.set(key, value, ttl)
    
    async def set_if_not_exists(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        if not self._connected:
            return False
        try:
            if ttl:
                result = await self.client.set(key, value, ex=ttl, nx=True)
            else:
                result = await self.client.set(key, value, nx=True)
            return result is True
        except Exception as e:
            logger.error(f"Redis set_if_not_exists error: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        if not self._connected:
            return False
        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis delete error: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        if not self._connected:
            return False
        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis exists error: {e}")
            return False
    
    async def expire(self, key: str, ttl: int) -> bool:
        if not self._connected:
            return False
        try:
            return await self.client.expire(key, ttl)
        except Exception as e:
            logger.error(f"Redis expire error: {e}")
            return False
    
    async def incr(self, key: str) -> Optional[int]:
        if not self._connected:
            return None
        try:
            return await self.client.incr(key)
        except Exception as e:
            logger.error(f"Redis incr error: {e}")
            return None
    
    async def decr(self, key: str) -> Optional[int]:
        if not self._connected:
            return None
        try:
            return await self.client.decr(key)
        except Exception as e:
            logger.error(f"Redis decr error: {e}")
            return None
    
    async def get_json(self, key: str) -> Optional[Dict]:
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None
    
    async def set_json(
        self,
        key: str,
        value: Dict,
        ttl: Optional[int] = None
    ) -> bool:
        try:
            return await self.set(key, json.dumps(value, default=str), ttl)
        except Exception as e:
            logger.error(f"Redis set_json error: {e}")
            return False
    
    async def invalidate_unread_count(self, user_id: int):
        if not self._connected:
            return
        try:
            await self.delete(f"unread:{user_id}")
            logger.debug(f"Invalidated unread count cache for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to invalidate unread count cache: {e}")
    
    async def mark_message_processed(self, message_id: str, ttl: int = 3600) -> bool:
        key = f"processed:{message_id}"
        return await self.set_if_not_exists(key, "1", ttl)
    
    async def is_message_processed(self, message_id: str) -> bool:
        return await self.exists(f"processed:{message_id}")
    
    @property
    def is_connected(self) -> bool:
        return self._connected


redis_client = RedisClient()