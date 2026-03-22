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
from .publisher import notification_publisher

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    service_factory: ServiceFactory = Depends(get_service_factory),
    user: Optional[User] = Depends(get_current_user_ws)
):
    """
    WebSocket эндпоинт для получения уведомлений в реальном времени
    
    Уведомления доставляются через WebSocket напрямую из потребителя RabbitMQ.
    Клиент может отправлять команды:
    - mark_read: отметить уведомление как прочитанное
    - mark_all_read: отметить все как прочитанные
    - get_unread_count: получить количество непрочитанных
    - ping: проверить соединение
    """
    if not user:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    
    connection_id = str(uuid.uuid4())
    await manager.connect(websocket, user.id, connection_id)
    
    try:
        # Отправляем приветственное сообщение
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to notifications service",
            "connection_id": connection_id
        })
        
        logger.info(f"WebSocket connected for user {user.id}, connection {connection_id}")
        
        # Получаем сервис уведомлений через фабрику
        notification_service = service_factory.get('notification')
        
        # Отправляем текущее количество непрочитанных уведомлений
        unread_count = await notification_service.get_unread_count(user.id)
        await websocket.send_json({
            "type": "unread_count",
            "count": unread_count
        })
        
        # Обрабатываем входящие сообщения от клиента
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
            except asyncio.TimeoutError:
                # Отправляем ping для проверки соединения
                await websocket.send_json({"type": "ping"})
                continue
            
            action = data.get("action")
            
            if action == "mark_read":
                notification_id = data.get("notification_id")
                if notification_id:
                    success = await notification_service.mark_as_read(notification_id, user.id)
                    await websocket.send_json({
                        "type": "marked_read",
                        "notification_id": notification_id,
                        "success": success
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
            
            elif action == "subscribe_to_updates":
                # Клиент может подписаться на обновления определенного типа
                # (опционально, можно реализовать при необходимости)
                await websocket.send_json({
                    "type": "subscribed",
                    "status": "ok"
                })
            
            else:
                logger.warning(f"Unknown action from user {user.id}: {action}")
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown action: {action}"
                })
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user.id}, connection {connection_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user.id}: {e}", exc_info=True)
    finally:
        # Отключаем соединение
        manager.disconnect(user.id, connection_id)
        logger.info(f"WebSocket cleaned up for user {user.id}, connection {connection_id}")