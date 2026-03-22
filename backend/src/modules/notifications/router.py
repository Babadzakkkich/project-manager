import asyncio
import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Optional

from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user_ws
from shared.dependencies import get_service_factory
from core.database.models import User
from core.logger import logger
from .websocket_manager import manager
from .redis_client import redis_client

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    service_factory: ServiceFactory = Depends(get_service_factory),
    user: Optional[User] = Depends(get_current_user_ws)
):
    """
    WebSocket эндпоинт для получения уведомлений в реальном времени
    """
    if not user:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    
    connection_id = str(uuid.uuid4())
    await manager.connect(websocket, user.id, connection_id)
    
    # Создаем обработчик для сообщений из Redis
    async def redis_message_handler(channel: str, data: str):
        """Обработчик сообщений из Redis для этого пользователя"""
        try:
            message_data = json.loads(data)
            # Отправляем сообщение через WebSocket
            await websocket.send_json(message_data)
        except Exception as e:
            logger.error(f"Error sending Redis message to WebSocket: {e}")
    
    try:
        # Отправляем приветственное сообщение
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to notifications",
            "connection_id": connection_id
        })
        
        # Подписываемся на канал пользователя в Redis
        user_channel = f"user:{user.id}"
        await redis_client.subscribe(user_channel, redis_message_handler)
        logger.debug(f"Subscribed to Redis channel for user {user.id}")
        
        # Получаем сервис уведомлений через фабрику
        notification_service = service_factory.get('notification')
        
        # Обрабатываем входящие сообщения от клиента
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            
            if action == "mark_read":
                notification_id = data.get("notification_id")
                if notification_id:
                    await notification_service.mark_as_read(notification_id, user.id)
                    await websocket.send_json({
                        "type": "marked_read",
                        "notification_id": notification_id
                    })
            
            elif action == "mark_all_read":
                count = await notification_service.mark_all_as_read(user.id)
                await websocket.send_json({
                    "type": "marked_all_read",
                    "count": count
                })
            
            elif action == "get_unread_count":
                count = await notification_service.get_unread_count(user.id)
                await websocket.send_json({
                    "type": "unread_count",
                    "count": count
                })
            
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user.id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user.id}: {e}")
    finally:
        # Отписываемся от канала Redis
        await redis_client.unsubscribe(f"user:{user.id}", redis_message_handler)
        manager.disconnect(user.id, connection_id)