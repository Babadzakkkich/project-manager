from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Literal
from core.database.models import ConferenceRoomType


class ConferenceRoomCreate(BaseModel):
    """Запрос на создание комнаты"""
    title: str = Field(..., max_length=200)
    room_type: Literal["project", "group", "task", "instant"] = Field(...)
    project_id: Optional[int] = Field(None)
    group_id: Optional[int] = Field(None)
    task_id: Optional[int] = Field(None)
    invited_user_ids: Optional[List[int]] = Field(None)
    max_participants: int = Field(default=30, ge=2, le=30)


class CreatorInfo(BaseModel):
    """Информация о создателе комнаты"""
    id: int
    login: str
    name: str
    
    model_config = ConfigDict(from_attributes=True)


class ConferenceRoomResponse(BaseModel):
    """Ответ с данными комнаты"""
    id: int
    room_name: str
    title: str
    room_type: ConferenceRoomType
    project_id: Optional[int] = None
    group_id: Optional[int] = None
    task_id: Optional[int] = None
    created_by: int
    is_active: bool
    max_participants: int
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class ConferenceRoomWithDetails(ConferenceRoomResponse):
    """Комната с дополнительными деталями"""
    creator: Optional[CreatorInfo] = None
    participants_count: int = 0
    is_moderator: bool = False


class JoinConferenceResponse(BaseModel):
    """Ответ с данными для подключения к созвону"""
    room: ConferenceRoomResponse
    token: str
    ws_url: str
    is_moderator: bool = False


class ConferenceParticipantResponse(BaseModel):
    """Участник конференции"""
    id: int
    user_id: int
    user_name: str
    joined_at: datetime
    left_at: Optional[datetime] = None
    is_video_on: bool
    is_audio_on: bool
    
    model_config = ConfigDict(from_attributes=True)


class ConferenceStatsResponse(BaseModel):
    """Статистика конференции"""
    room_id: int
    participant_count: Optional[int] = None
    peak_participants: Optional[int] = None
    duration_seconds: Optional[int] = None
    messages_count: Optional[int] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ConferenceMessageResponse(BaseModel):
    """Сообщение чата"""
    id: int
    user_id: int
    user_name: str
    message: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ConferenceListResponse(BaseModel):
    """Список конференций"""
    items: List[ConferenceRoomWithDetails]
    total: int