from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional

from core.database.models import User
from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user
from shared.dependencies import get_service_factory
from core.config import settings
from core.logger import logger

from .schemas import (
    ConferenceMessageResponse,
    ConferenceRoomCreate,
    ConferenceRoomResponse,
    ConferenceRoomWithDetails,
    JoinConferenceResponse,
    ConferenceStatsResponse,
    CreatorInfo,
)

router = APIRouter()


def get_active_participants_count(room) -> int:
    """
    Возвращает количество участников, которые находятся в созвоне сейчас.

    В таблице conference_participants записи не удаляются после выхода,
    поэтому нельзя считать len(room.participants). У вышедших участников
    заполняется left_at, а активные участники имеют left_at = None.
    """
    if not room.participants:
        return 0

    return sum(
        1
        for participant in room.participants
        if participant.left_at is None
    )


@router.post("/rooms", response_model=ConferenceRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_conference_room(
    room_data: ConferenceRoomCreate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Создание новой комнаты для созвона"""
    logger.info(f"Creating conference room '{room_data.title}' by user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    
    entity_id = None

    if room_data.room_type == "project" and room_data.project_id:
        entity_id = room_data.project_id
    elif room_data.room_type == "group" and room_data.group_id:
        entity_id = room_data.group_id
    elif room_data.room_type == "task" and room_data.task_id:
        entity_id = room_data.task_id
    
    if entity_id and not await conference_service.can_create_conference(
        current_user.id,
        room_data.room_type,
        entity_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания созвона"
        )
    
    try:
        room = await conference_service.create_room(
            title=room_data.title,
            room_type=room_data.room_type,
            created_by=current_user.id,
            project_id=room_data.project_id,
            group_id=room_data.group_id,
            task_id=room_data.task_id,
            invited_user_ids=room_data.invited_user_ids,
            max_participants=room_data.max_participants
        )
        return room
    except Exception as e:
        logger.error(f"Error creating conference room: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось создать комнату: {str(e)}"
        )


@router.post("/rooms/{room_id}/messages")
async def send_room_message(
    room_id: int,
    message_data: dict,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Отправка сообщения в комнату, сохраняется на сервере"""
    logger.info(f"User {current_user.id} sending message to room {room_id}")
    
    conference_service = service_factory.get('conference')
    message = await conference_service.save_message(
        room_id=room_id,
        user_id=current_user.id,
        message_text=message_data.get("message", "")
    )
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось сохранить сообщение"
        )
    
    return {
        "id": message.id,
        "user_id": message.user_id,
        "user_name": current_user.name or current_user.login,
        "message": message.message,
        "created_at": message.created_at.isoformat()
    }


@router.get("/rooms/{room_id}/messages", response_model=List[ConferenceMessageResponse])
async def get_room_messages(
    room_id: int,
    limit: int = 50,
    before_id: Optional[int] = None,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение истории сообщений комнаты"""
    logger.info(f"Getting messages for room {room_id}, user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    messages = await conference_service.get_room_messages(
        room_id,
        current_user.id,
        limit,
        before_id
    )
    
    return [
        ConferenceMessageResponse(
            id=msg.id,
            user_id=msg.user_id,
            user_name=msg.user.name if msg.user else "Неизвестный",
            message=msg.message,
            created_at=msg.created_at
        )
        for msg in messages
    ]


@router.get("/rooms", response_model=List[ConferenceRoomWithDetails])
async def get_available_rooms(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение списка доступных созвонов"""
    logger.info(f"Getting available rooms for user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    rooms = await conference_service.get_available_rooms_for_user(current_user.id)
    
    result = []

    for room in rooms:
        room_dict = ConferenceRoomWithDetails.model_validate(room)
        
        if room.creator:
            room_dict.creator = CreatorInfo(
                id=room.creator.id,
                login=room.creator.login,
                name=room.creator.name
            )
        
        room_dict.participants_count = get_active_participants_count(room)
        room_dict.is_moderator = await conference_service._is_room_moderator(
            current_user.id,
            room
        )
        
        result.append(room_dict)
    
    return result


@router.get("/rooms/{room_id}", response_model=ConferenceRoomWithDetails)
async def get_room_details(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение детальной информации о комнате"""
    logger.info(f"Getting room {room_id} details for user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    room = await conference_service.get_room_by_id(room_id)
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Комната не найдена"
        )
    
    if not await conference_service.can_join_conference(current_user.id, room):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к комнате"
        )
    
    room_dict = ConferenceRoomWithDetails.model_validate(room)
    
    if room.creator:
        room_dict.creator = CreatorInfo(
            id=room.creator.id,
            login=room.creator.login,
            name=room.creator.name
        )
    
    room_dict.participants_count = get_active_participants_count(room)
    room_dict.is_moderator = await conference_service._is_room_moderator(
        current_user.id,
        room
    )
    
    return room_dict


@router.post("/rooms/{room_id}/join", response_model=JoinConferenceResponse)
async def join_conference_room(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Подключение к комнате созвона"""
    logger.info(f"User {current_user.id} joining room {room_id}")
    
    conference_service = service_factory.get('conference')
    room, token = await conference_service.join_room(room_id, current_user.id)
    
    if not room or not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось подключиться к комнате"
        )
    
    is_moderator = await conference_service._is_room_moderator(current_user.id, room)
    
    return JoinConferenceResponse(
        room=ConferenceRoomResponse.model_validate(room),
        token=token,
        ws_url=settings.livekit_ws_url,
        is_moderator=is_moderator
    )


@router.post("/rooms/{room_id}/leave")
async def leave_conference_room(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Выход из комнаты созвона"""
    logger.info(f"User {current_user.id} leaving room {room_id}")
    
    conference_service = service_factory.get('conference')
    success = await conference_service.leave_room(room_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось выйти из комнаты"
        )
    
    return {"detail": "Вы вышли из созвона"}


@router.post("/rooms/{room_id}/leave-beacon")
async def leave_conference_room_beacon(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):

    logger.info(f"Beacon leave: user {current_user.id} leaving room {room_id}")

    conference_service = service_factory.get('conference')

    try:
        await conference_service.leave_room(room_id, current_user.id)
    except Exception as e:
        logger.error(
            f"Beacon leave failed for room {room_id}, user {current_user.id}: {e}",
            exc_info=True
        )

    return {"detail": "OK"}


@router.delete("/rooms/{room_id}")
async def end_conference(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Завершение созвона, только для модератора"""
    logger.info(f"User {current_user.id} ending conference {room_id}")
    
    conference_service = service_factory.get('conference')
    success = await conference_service.end_conference(room_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для завершения созвона"
        )
    
    return {"detail": "Созвон завершен"}


@router.get("/rooms/project/{project_id}", response_model=List[ConferenceRoomResponse])
async def get_project_conferences(
    project_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение созвонов проекта"""
    logger.info(f"Getting project {project_id} conferences for user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    rooms = await conference_service.get_rooms_by_project(project_id, current_user.id)
    return rooms


@router.get("/rooms/group/{group_id}", response_model=List[ConferenceRoomResponse])
async def get_group_conferences(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение созвонов группы"""
    logger.info(f"Getting group {group_id} conferences for user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    rooms = await conference_service.get_rooms_by_group(group_id, current_user.id)
    return rooms


@router.get("/rooms/task/{task_id}", response_model=List[ConferenceRoomResponse])
async def get_task_conferences(
    task_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение созвонов задачи"""
    logger.info(f"Getting task {task_id} conferences for user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    rooms = await conference_service.get_rooms_by_task(task_id, current_user.id)
    return rooms


@router.get("/stats/{room_id}", response_model=ConferenceStatsResponse)
async def get_conference_stats(
    room_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение статистики созвона, только для модератора"""
    logger.info(f"Getting stats for room {room_id} by user {current_user.id}")
    
    conference_service = service_factory.get('conference')
    stats = await conference_service.get_room_stats(room_id, current_user.id)
    
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Статистика не найдена или недостаточно прав"
        )
    
    return stats