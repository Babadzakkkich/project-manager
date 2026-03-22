import uuid
from typing import Dict, Optional
from fastapi import WebSocket
from core.logger import logger
from .redis_client import redis_client


class ConnectionManager:
    """Управление WebSocket соединениями"""
    
    def __init__(self):
        # user_id -> {connection_id: websocket}
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int, connection_id: str = None) -> str:
        """Подключение нового WebSocket"""
        await websocket.accept()
        
        if connection_id is None:
            connection_id = str(uuid.uuid4())
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}
        
        self.active_connections[user_id][connection_id] = websocket
        
        # Регистрируем в Redis
        await redis_client.add_connection(user_id, connection_id)
        
        logger.info(f"WebSocket connected: user={user_id}, connection={connection_id}")
        return connection_id
    
    def disconnect(self, user_id: int, connection_id: str):
        """Отключение WebSocket"""
        if user_id in self.active_connections:
            self.active_connections[user_id].pop(connection_id, None)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        # Удаляем из Redis
        import asyncio
        asyncio.create_task(redis_client.remove_connection(user_id, connection_id))
        
        logger.info(f"WebSocket disconnected: user={user_id}, connection={connection_id}")
    
    async def send_to_user(self, user_id: int, message: dict) -> int:
        """Отправить сообщение пользователю через все его соединения"""
        if user_id not in self.active_connections:
            return 0
        
        sent_count = 0
        disconnected = []
        
        for conn_id, websocket in self.active_connections[user_id].items():
            try:
                await websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to send message to {user_id}: {e}")
                disconnected.append((user_id, conn_id))
        
        # Очищаем отключенные соединения
        for uid, cid in disconnected:
            self.disconnect(uid, cid)
        
        return sent_count


manager = ConnectionManager()