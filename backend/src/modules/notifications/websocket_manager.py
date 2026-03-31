import uuid
from typing import Dict, Optional
from fastapi import WebSocket
from core.logger import logger


class ConnectionManager:
    """Управление WebSocket соединениями (только для активных соединений)"""
    
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
        
        logger.info(f"WebSocket connected: user={user_id}, connection={connection_id}")
        return connection_id
    
    def disconnect(self, user_id: int, connection_id: str):
        """Отключение WebSocket"""
        if user_id in self.active_connections:
            if connection_id in self.active_connections[user_id]:
                del self.active_connections[user_id][connection_id]
            
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        logger.info(f"WebSocket disconnected: user={user_id}, connection={connection_id}")
    
    async def send_to_user(self, user_id: int, message: dict) -> int:
        """
        Отправить сообщение пользователю через все его соединения
        Возвращает количество успешно отправленных сообщений
        """
        if user_id not in self.active_connections:
            return 0
        
        sent_count = 0
        disconnected = []
        
        for conn_id, websocket in list(self.active_connections[user_id].items()):
            try:
                await websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to send message to {user_id} ({conn_id}): {e}")
                disconnected.append((user_id, conn_id))
        
        # Очищаем отключенные соединения
        for uid, cid in disconnected:
            self.disconnect(uid, cid)
        
        if sent_count > 0:
            logger.debug(f"Sent message to user {user_id}, delivered to {sent_count} connections")
        
        return sent_count
    
    def get_connection_count(self, user_id: int) -> int:
        """Получить количество активных соединений пользователя"""
        if user_id not in self.active_connections:
            return 0
        return len(self.active_connections[user_id])
    
    def get_all_connected_users(self) -> list:
        """Получить список всех пользователей с активными соединениями"""
        return list(self.active_connections.keys())


manager = ConnectionManager()