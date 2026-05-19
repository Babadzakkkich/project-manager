from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Literal

from core.database.models import ConferenceRoomType


class ConferenceRoomCreate(BaseModel):
    """Запрос на создание комнаты."""
    title: str = Field(..., min_length=2, max_length=200)
    room_type: Literal["project", "group", "task", "instant"] = Field(...)
    project_id: Optional[int] = Field(None)
    group_id: Optional[int] = Field(None)
    task_id: Optional[int] = Field(None)
    invited_user_ids: Optional[List[int]] = Field(default_factory=list)
    max_participants: int = Field(default=30, ge=2, le=30)


class LeaveConferenceRequest(BaseModel):
    """Параметры выхода пользователя из комнаты."""
    auto_end_if_last: bool = False


class KickConferenceParticipantRequest(BaseModel):
    """Параметры временного удаления участника из созвона."""
    duration_minutes: int = Field(default=15, ge=1, le=1440)
    reason: Optional[str] = Field(default=None, max_length=300)


class KickConferenceParticipantResponse(BaseModel):
    """Результат временного удаления участника из созвона."""
    room_id: int
    user_id: int
    kicked_until: datetime
    reason: Optional[str] = None
    detail: str


class LeaveConferenceImpactResponse(BaseModel):
    """Информация о последствиях выхода пользователя из комнаты."""
    room_id: int
    is_active: bool
    current_user_is_active_participant: bool
    active_participants_count: int
    would_end_room: bool


class InvitableUserResponse(BaseModel):
    """Пользователь, которого можно пригласить в мгновенный созвон."""
    id: int
    login: str
    email: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class CreatorInfo(BaseModel):
    """Информация о создателе комнаты."""
    id: int
    login: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class ConferenceRoomResponse(BaseModel):
    """Ответ с данными комнаты."""
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
    """Комната с дополнительными деталями."""
    creator: Optional[CreatorInfo] = None
    participants_count: int = 0
    is_moderator: bool = False
    current_user_can_join: bool = True
    is_current_user_kicked: bool = False
    current_user_kicked_at: Optional[datetime] = None
    current_user_kicked_until: Optional[datetime] = None
    current_user_kick_reason: Optional[str] = None


class JoinConferenceResponse(BaseModel):
    """Ответ с данными для подключения к созвону."""
    room: ConferenceRoomResponse
    token: str
    ws_url: str
    is_moderator: bool = False


class ConferenceParticipantResponse(BaseModel):
    """Участник конференции."""
    id: int
    user_id: int
    user_name: str
    joined_at: datetime
    left_at: Optional[datetime] = None
    is_video_on: bool
    is_audio_on: bool

    model_config = ConfigDict(from_attributes=True)


class ConferenceStatsResponse(BaseModel):
    """Статистика конференции."""
    room_id: int
    participant_count: Optional[int] = None
    peak_participants: Optional[int] = None
    duration_seconds: Optional[int] = None
    messages_count: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConferenceMessageResponse(BaseModel):
    """Сообщение чата."""
    id: int
    user_id: int
    user_name: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConferenceListResponse(BaseModel):
    """Список конференций."""
    items: List[ConferenceRoomWithDetails]
    total: int