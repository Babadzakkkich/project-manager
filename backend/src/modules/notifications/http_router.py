from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user
from shared.dependencies import get_service_factory
from core.database.models import User, NotificationType
from .schemas import (
    NotificationRead, 
    NotificationListResponse, 
    UnreadCountResponse,
    MarkReadResponse
)

router = APIRouter()

@router.get("/", response_model=NotificationListResponse)
async def get_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    notification_type: Optional[NotificationType] = None,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """
    Получение списка уведомлений пользователя
    """
    notification_service = service_factory.get('notification')
    
    notifications = await notification_service.get_user_notifications(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
        notification_type=notification_type
    )
    
    unread_count = await notification_service.get_unread_count(current_user.id)
    
    return NotificationListResponse(
        items=notifications,
        total=len(notifications),
        unread_count=unread_count,
        limit=limit,
        offset=offset
    )


@router.get("/unread/count", response_model=UnreadCountResponse)
async def get_unread_count(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """
    Получение количества непрочитанных уведомлений
    """
    notification_service = service_factory.get('notification')
    count = await notification_service.get_unread_count(current_user.id)
    
    return UnreadCountResponse(count=count)


@router.post("/{notification_id}/read", response_model=MarkReadResponse)
async def mark_notification_as_read(
    notification_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """
    Отметить уведомление как прочитанное
    """
    notification_service = service_factory.get('notification')
    success = await notification_service.mark_as_read(notification_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено"
        )
    
    return MarkReadResponse(success=True, notification_id=notification_id)


@router.post("/read-all", response_model=MarkReadResponse)
async def mark_all_notifications_as_read(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """
    Отметить все уведомления как прочитанные
    """
    notification_service = service_factory.get('notification')
    count = await notification_service.mark_all_as_read(current_user.id)
    
    return MarkReadResponse(success=True, count=count)