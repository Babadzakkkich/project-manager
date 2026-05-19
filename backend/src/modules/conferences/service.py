import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Set, TYPE_CHECKING

from sqlalchemy import select, delete, func, or_, and_, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import (
    NotificationPriority,
    NotificationType,
    User,
    Group,
    Project,
    Task,
    GroupMember,
    ConferenceRoom,
    ConferenceRoomType,
    ConferenceParticipant,
    ConferenceMessage,
    ConferenceStats,
    conference_invited_users,
    UserRole,
    project_group_association,
)
from shared.dependencies import ensure_user_is_admin, check_user_in_group, check_user_in_project
from core.logger import logger
from core.utils.livekit import livekit_token, generate_room_name

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.notifications.service import NotificationTriggerService


DEFAULT_KICK_DURATION_MINUTES = 15


class ConferenceJoinDeniedError(Exception):
    """Ошибка подключения к созвону с кодом причины для фронтенда."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "conference_join_denied",
        kicked_until: Optional[datetime] = None,
        kick_reason: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.kicked_until = kicked_until
        self.kick_reason = kick_reason


def _ensure_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


class ConferenceService:
    """Сервис для работы с видеоконференциями."""

    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._notification_trigger = None

    @property
    def notification_trigger(self) -> Optional['NotificationTriggerService']:
        """Ленивая загрузка NotificationTriggerService через фабрику."""
        if self._notification_trigger is None and self.service_factory:
            self._notification_trigger = self.service_factory.get('notification_trigger')
        return self._notification_trigger

    async def can_create_conference(self, user_id: int, room_type: str, entity_id: Optional[int]) -> bool:
        """Проверка права на создание созвона."""
        if room_type == ConferenceRoomType.GROUP.value:
            if not entity_id:
                return False
            try:
                await ensure_user_is_admin(self.session, user_id, entity_id)
                return True
            except Exception:
                return False

        if room_type == ConferenceRoomType.PROJECT.value:
            return bool(entity_id and await self._is_project_admin(user_id, entity_id))

        if room_type == ConferenceRoomType.TASK.value:
            return bool(entity_id and await self._is_task_assignee_or_group_admin(user_id, entity_id))

        if room_type == ConferenceRoomType.INSTANT.value:
            return True

        return False

    async def can_join_conference(self, user_id: int, room: ConferenceRoom) -> bool:
        """Проверка права на вход или просмотр доступной комнаты."""
        if not room:
            return False

        if room.created_by == user_id:
            return True

        if room.room_type == ConferenceRoomType.GROUP:
            return bool(room.group_id and await check_user_in_group(self.session, user_id, room.group_id))

        if room.room_type == ConferenceRoomType.PROJECT:
            return bool(room.project_id and await check_user_in_project(self.session, user_id, room.project_id))

        if room.room_type == ConferenceRoomType.TASK:
            return bool(room.task_id and await self._can_access_task(user_id, room.task_id))

        if room.room_type == ConferenceRoomType.INSTANT:
            invited_ids = [u.id for u in (room.invited_users or [])]
            return user_id in invited_ids

        return False

    def _get_participant_from_loaded_room(
        self,
        room: ConferenceRoom,
        user_id: int,
    ) -> Optional[ConferenceParticipant]:
        return next(
            (participant for participant in room.participants if participant.user_id == user_id),
            None,
        )

    def _get_active_kick_from_loaded_room(
        self,
        room: ConferenceRoom,
        user_id: int,
    ) -> Optional[ConferenceParticipant]:
        participant = self._get_participant_from_loaded_room(room, user_id)

        if not participant:
            return None

        kicked_until = _ensure_aware_utc(participant.kicked_until)

        if kicked_until and kicked_until > datetime.now(timezone.utc):
            return participant

        return None

    async def get_active_kick(
        self,
        room_id: int,
        user_id: int,
    ) -> Optional[ConferenceParticipant]:
        """Получение активной временной блокировки входа пользователя в комнату."""
        stmt = select(ConferenceParticipant).where(
            ConferenceParticipant.room_id == room_id,
            ConferenceParticipant.user_id == user_id,
            ConferenceParticipant.kicked_until.is_not(None),
            ConferenceParticipant.kicked_until > datetime.now(timezone.utc),
        )

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    def get_current_user_kick_info_from_room(
        self,
        room: ConferenceRoom,
        user_id: int,
    ) -> dict:
        """Данные активного временного удаления для отображения в списке созвонов."""
        active_kick = self._get_active_kick_from_loaded_room(room, user_id)

        if not active_kick:
            return {
                "current_user_can_join": True,
                "is_current_user_kicked": False,
                "current_user_kicked_at": None,
                "current_user_kicked_until": None,
                "current_user_kick_reason": None,
            }

        return {
            "current_user_can_join": False,
            "is_current_user_kicked": True,
            "current_user_kicked_at": _ensure_aware_utc(active_kick.kicked_at),
            "current_user_kicked_until": _ensure_aware_utc(active_kick.kicked_until),
            "current_user_kick_reason": active_kick.kick_reason,
        }

    async def _is_project_admin(self, user_id: int, project_id: int) -> bool:
        """Проверка, является ли пользователь админом хотя бы одной группы проекта."""
        stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()

        if not project:
            return False

        for group in project.groups:
            try:
                await ensure_user_is_admin(self.session, user_id, group.id)
                return True
            except Exception:
                continue

        return False

    async def _is_task_assignee_or_group_admin(self, user_id: int, task_id: int) -> bool:
        """Проверка, может ли пользователь управлять задачным созвоном."""
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()

        if not task:
            return False

        if any(user.id == user_id for user in task.assignees):
            return True

        if task.group_id:
            try:
                await ensure_user_is_admin(self.session, user_id, task.group_id)
                return True
            except Exception:
                return False

        return False

    async def _can_access_task(self, user_id: int, task_id: int) -> bool:
        """Проверка доступа пользователя к задаче."""
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()

        if not task:
            return False

        if any(user.id == user_id for user in task.assignees):
            return True

        if task.group_id:
            return await check_user_in_group(self.session, user_id, task.group_id)

        return False

    async def _is_room_moderator(self, user_id: int, room: ConferenceRoom) -> bool:
        """Проверка, является ли пользователь модератором комнаты."""
        if not room:
            return False

        if room.created_by == user_id:
            return True

        if room.room_type == ConferenceRoomType.GROUP and room.group_id:
            try:
                await ensure_user_is_admin(self.session, user_id, room.group_id)
                return True
            except Exception:
                return False

        if room.room_type == ConferenceRoomType.PROJECT and room.project_id:
            return await self._is_project_admin(user_id, room.project_id)

        if room.room_type == ConferenceRoomType.TASK and room.task_id:
            return await self._is_task_assignee_or_group_admin(user_id, room.task_id)

        return False

    async def create_room(
        self,
        title: str,
        room_type: str,
        created_by: int,
        project_id: Optional[int] = None,
        group_id: Optional[int] = None,
        task_id: Optional[int] = None,
        invited_user_ids: Optional[List[int]] = None,
        max_participants: int = 30,
    ) -> ConferenceRoom:
        """Создание новой комнаты созвона"""
        self.logger.info(
            f"Creating conference room '{title}' of type '{room_type}' by user {created_by}"
        )

        room_name = generate_room_name("conf")
        room_type_enum = ConferenceRoomType(room_type)

        try:
            new_room = ConferenceRoom(
                room_name=room_name,
                title=title,
                room_type=room_type_enum,
                project_id=project_id,
                group_id=group_id,
                task_id=task_id,
                created_by=created_by,
                max_participants=max_participants,
                started_at=datetime.now(timezone.utc),
            )

            self.session.add(new_room)
            await self.session.flush()

            if room_type_enum == ConferenceRoomType.INSTANT and invited_user_ids:
                invited_ids = sorted(
                    {
                        int(invited_user_id)
                        for invited_user_id in invited_user_ids
                        if int(invited_user_id) != created_by
                    }
                )

                if invited_ids:
                    users_stmt = select(User.id).where(User.id.in_(invited_ids))
                    users_result = await self.session.execute(users_stmt)
                    existing_user_ids = {row[0] for row in users_result.all()}

                    if existing_user_ids:
                        await self.session.execute(
                            insert(conference_invited_users),
                            [
                                {
                                    "room_id": new_room.id,
                                    "user_id": invited_user_id,
                                }
                                for invited_user_id in existing_user_ids
                            ],
                        )

            await self.session.commit()

            created_room_id = new_room.id
            new_room = await self.get_room_by_id(created_room_id)

            await self._notify_conference_started(new_room, created_by)

            self.logger.info(f"Conference room created: {room_name}")

            return new_room

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating conference room: {e}", exc_info=True)
            raise

    async def get_room_by_id(self, room_id: int) -> Optional[ConferenceRoom]:
        """Получение комнаты по ID."""
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.group),
            selectinload(ConferenceRoom.project),
            selectinload(ConferenceRoom.task),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user),
            selectinload(ConferenceRoom.messages).selectinload(ConferenceMessage.user),
            selectinload(ConferenceRoom.stats),
        ).where(ConferenceRoom.id == room_id)

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_room_by_name(self, room_name: str) -> Optional[ConferenceRoom]:
        """Получение комнаты по имени."""
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user),
        ).where(ConferenceRoom.room_name == room_name)

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_user_group_ids(self, user_id: int) -> List[int]:
        stmt = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
        result = await self.session.execute(stmt)
        return [row[0] for row in result.all()]

    async def _get_user_project_ids(self, user_group_ids: List[int]) -> List[int]:
        if not user_group_ids:
            return []

        stmt = select(project_group_association.c.project_id).where(
            project_group_association.c.group_id.in_(user_group_ids)
        )
        result = await self.session.execute(stmt)
        return list({row[0] for row in result.all()})

    async def get_available_rooms_for_user(self, user_id: int, status: str = "active") -> List[ConferenceRoom]:
        """Получение доступных пользователю созвонов.

        status:
        - active: только активные;
        - ended: только завершённые;
        - all: все доступные.
        """
        user_group_ids = await self._get_user_group_ids(user_id)
        user_project_ids = await self._get_user_project_ids(user_group_ids)

        conditions = [
            ConferenceRoom.created_by == user_id,
            ConferenceRoom.invited_users.any(User.id == user_id),
            ConferenceRoom.participants.any(ConferenceParticipant.user_id == user_id),
        ]

        if user_group_ids:
            conditions.append(ConferenceRoom.group_id.in_(user_group_ids))

        if user_project_ids:
            conditions.append(ConferenceRoom.project_id.in_(user_project_ids))

        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.group),
            selectinload(ConferenceRoom.project),
            selectinload(ConferenceRoom.task),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user),
            selectinload(ConferenceRoom.stats),
        ).where(or_(*conditions))

        if status == "active":
            stmt = stmt.where(ConferenceRoom.is_active == True)
        elif status == "ended":
            stmt = stmt.where(ConferenceRoom.is_active == False)

        stmt = stmt.order_by(ConferenceRoom.started_at.desc().nullslast(), ConferenceRoom.created_at.desc())

        result = await self.session.execute(stmt)
        rooms = result.scalars().unique().all()

        filtered_rooms = []
        for room in rooms:
            if room.room_type == ConferenceRoomType.TASK:
                if room.task_id and await self._can_access_task(user_id, room.task_id):
                    filtered_rooms.append(room)
            else:
                filtered_rooms.append(room)

        return filtered_rooms

    async def join_room(self, room_id: int, user_id: int) -> tuple[Optional[ConferenceRoom], Optional[str]]:
        """Вход пользователя в комнату.

        Повторный вход не создаёт новую строку участника, потому что в таблице
        действует уникальность по паре room_id/user_id. Если пользователь уже
        был в комнате и вышел, его запись реактивируется.
        """
        room = await self.get_room_by_id(room_id)
        if not room or not room.is_active:
            self.logger.warning(f"Room {room_id} not found or inactive")
            return None, None

        if not await self.can_join_conference(user_id, room):
            self.logger.warning(f"User {user_id} cannot join room {room_id}")
            return None, None

        active_kick = self._get_active_kick_from_loaded_room(room, user_id)
        if active_kick:
            kicked_until = _ensure_aware_utc(active_kick.kicked_until)
            self.logger.info(
                f"User {user_id} is temporarily kicked from room {room_id} until {kicked_until}"
            )
            raise ConferenceJoinDeniedError(
                "Вы временно удалены из созвона. Повторный вход будет доступен позже.",
                code="conference_kicked",
                kicked_until=kicked_until,
                kick_reason=active_kick.kick_reason,
            )

        active_count = len([participant for participant in room.participants if participant.left_at is None])
        participant = self._get_participant_from_loaded_room(room, user_id)
        existing_active = participant and participant.left_at is None

        if not existing_active:
            if active_count >= room.max_participants:
                self.logger.warning(f"Room {room_id} is full")
                return None, None

            now = datetime.now(timezone.utc)

            if participant:
                participant.left_at = None
                participant.joined_at = now
                participant.is_video_on = True
                participant.is_audio_on = True
                participant.is_speaking = False
                participant.participant_sid = None
                participant.kicked_at = None
                participant.kicked_until = None
                participant.kicked_by_id = None
                participant.kick_reason = None
            else:
                participant = ConferenceParticipant(
                    room_id=room_id,
                    user_id=user_id,
                    joined_at=now,
                    is_video_on=True,
                    is_audio_on=True,
                )
                self.session.add(participant)

            await self.session.commit()
            room = await self.get_room_by_id(room_id)

        user = await self.session.get(User, user_id)
        is_moderator = await self._is_room_moderator(user_id, room)
        token = livekit_token.generate_token(
            room_name=room.room_name,
            user_id=user_id,
            user_name=user.name or user.login,
            is_admin=is_moderator,
        )

        return room, token

    async def save_message(self, room_id: int, user_id: int, message_text: str) -> Optional[ConferenceMessage]:
        """Сохранение сообщения в комнате."""
        room = await self.get_room_by_id(room_id)
        if not room or not room.is_active:
            return None

        if not await self.can_join_conference(user_id, room):
            return None

        text = message_text.strip()
        if not text:
            return None

        message = ConferenceMessage(room_id=room_id, user_id=user_id, message=text)
        self.session.add(message)
        await self.session.commit()
        await self.session.refresh(message)

        stmt = select(ConferenceMessage).options(selectinload(ConferenceMessage.user)).where(ConferenceMessage.id == message.id)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def get_room_messages(
        self,
        room_id: int,
        user_id: int,
        limit: int = 50,
        before_id: Optional[int] = None,
    ) -> List[ConferenceMessage]:
        """Получение истории сообщений комнаты."""
        room = await self.get_room_by_id(room_id)
        if not room or not await self.can_join_conference(user_id, room):
            return []

        stmt = select(ConferenceMessage).options(selectinload(ConferenceMessage.user)).where(
            ConferenceMessage.room_id == room_id
        )

        if before_id:
            stmt = stmt.where(ConferenceMessage.id < before_id)

        stmt = stmt.order_by(ConferenceMessage.created_at.desc()).limit(limit)

        result = await self.session.execute(stmt)
        messages = result.scalars().all()
        return list(reversed(messages))

    async def get_leave_impact(self, room_id: int, user_id: int) -> dict:
        """Проверка, приведёт ли выход пользователя к автозавершению комнаты."""
        room = await self.get_room_by_id(room_id)

        if not room:
            return {
                "room_id": room_id,
                "is_active": False,
                "current_user_is_active_participant": False,
                "active_participants_count": 0,
                "would_end_room": False,
            }

        active_participants = [participant for participant in room.participants if participant.left_at is None]
        current_user_is_active = any(participant.user_id == user_id for participant in active_participants)

        return {
            "room_id": room.id,
            "is_active": room.is_active,
            "current_user_is_active_participant": current_user_is_active,
            "active_participants_count": len(active_participants),
            "would_end_room": bool(room.is_active and current_user_is_active and len(active_participants) <= 1),
        }

    async def leave_room(self, room_id: int, user_id: int, auto_end_if_last: bool = False) -> bool:
        """Выход пользователя из комнаты.

        Если выходит последний активный участник и auto_end_if_last=True,
        комната автоматически завершается и по ней собирается статистика.
        """
        room = await self.get_room_by_id(room_id)
        if not room:
            return False

        participant = next(
            (item for item in room.participants if item.user_id == user_id and item.left_at is None),
            None,
        )

        if not participant:
            # Выход должен быть идемпотентным: после кика или повторного клика
            # пользователь уже может быть помечен как вышедший, но фронтенд всё
            # равно должен спокойно вернуться к списку созвонов.
            return True

        active_count_before_leave = len([item for item in room.participants if item.left_at is None])
        is_last_participant = active_count_before_leave <= 1

        if is_last_participant and not auto_end_if_last:
            return False

        participant.left_at = datetime.now(timezone.utc)

        if is_last_participant and room.is_active:
            room.is_active = False
            room.ended_at = participant.left_at
            await self._collect_room_stats(room)

        await self.session.commit()

        if is_last_participant:
            asyncio.create_task(self._delete_livekit_room_async(room.room_name))

        return True

    async def kick_participant(
        self,
        room_id: int,
        moderator_id: int,
        target_user_id: int,
        duration_minutes: int = DEFAULT_KICK_DURATION_MINUTES,
        reason: Optional[str] = None,
    ) -> Optional[ConferenceParticipant]:
        """Временное удаление участника из активного созвона."""
        room = await self.get_room_by_id(room_id)
        if not room or not room.is_active:
            return None

        if not await self._is_room_moderator(moderator_id, room):
            self.logger.warning(f"User {moderator_id} not allowed to kick from room {room_id}")
            return None

        if target_user_id == moderator_id:
            self.logger.warning(f"User {moderator_id} tried to kick themselves from room {room_id}")
            return None

        if await self._is_room_moderator(target_user_id, room):
            self.logger.warning(
                f"User {moderator_id} tried to kick another moderator {target_user_id} "
                f"from room {room_id}"
            )
            return None

        participant = next(
            (item for item in room.participants if item.user_id == target_user_id and item.left_at is None),
            None,
        )

        if not participant:
            self.logger.warning(f"Target user {target_user_id} is not active in room {room_id}")
            return None

        safe_duration_minutes = max(1, min(int(duration_minutes or DEFAULT_KICK_DURATION_MINUTES), 1440))
        now = datetime.now(timezone.utc)
        kicked_until = now + timedelta(minutes=safe_duration_minutes)

        participant.left_at = now
        participant.kicked_at = now
        participant.kicked_until = kicked_until
        participant.kicked_by_id = moderator_id
        participant.kick_reason = reason.strip() if reason else None
        participant.is_speaking = False
        participant.is_video_on = False
        participant.is_audio_on = False
        participant.participant_sid = None

        await self.session.commit()
        await self.session.refresh(participant)

        self.logger.info(
            f"User {target_user_id} was kicked from room {room_id} by {moderator_id} until {kicked_until}"
        )
        return participant

    async def end_conference(self, room_id: int, user_id: int) -> bool:
        """Завершение созвона, только для модератора."""
        room = await self.get_room_by_id(room_id)
        if not room:
            return False

        if not await self._is_room_moderator(user_id, room):
            self.logger.warning(f"User {user_id} not allowed to end room {room_id}")
            return False

        if not room.is_active:
            return True

        now = datetime.now(timezone.utc)
        room.is_active = False
        room.ended_at = now

        for participant in room.participants:
            if participant.left_at is None:
                participant.left_at = now

        await self._collect_room_stats(room)
        await self.session.commit()

        asyncio.create_task(self._delete_livekit_room_async(room.room_name))
        return True

    async def _delete_livekit_room_async(self, room_name: str):
        """Асинхронное удаление комнаты в LiveKit."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, livekit_token.delete_room, room_name)

    async def _collect_room_stats(self, room: ConferenceRoom):
        """Сбор статистики по комнате."""
        if not room.started_at:
            return

        existing_stmt = select(ConferenceStats).where(ConferenceStats.room_id == room.id)
        existing_result = await self.session.execute(existing_stmt)
        existing_stats = existing_result.scalar_one_or_none()

        end_time = room.ended_at or datetime.now(timezone.utc)
        duration = int((end_time - room.started_at).total_seconds())

        participants_stmt = select(func.count()).select_from(ConferenceParticipant).where(
            ConferenceParticipant.room_id == room.id
        )
        participants_result = await self.session.execute(participants_stmt)
        participant_count = participants_result.scalar() or 0

        messages_stmt = select(func.count()).select_from(ConferenceMessage).where(
            ConferenceMessage.room_id == room.id
        )
        messages_result = await self.session.execute(messages_stmt)
        messages_count = messages_result.scalar() or 0

        if existing_stats:
            existing_stats.participant_count = participant_count
            existing_stats.peak_participants = max(existing_stats.peak_participants or 0, participant_count)
            existing_stats.duration_seconds = duration
            existing_stats.messages_count = messages_count
            return

        stats = ConferenceStats(
            room_id=room.id,
            participant_count=participant_count,
            peak_participants=participant_count,
            duration_seconds=duration,
            messages_count=messages_count,
        )
        self.session.add(stats)

    async def _notify_conference_started(self, room: ConferenceRoom, created_by: int):
        """Отправка уведомлений о созданном созвоне."""
        if not self.notification_trigger:
            return

        recipient_ids: Set[int] = set()

        if room.room_type == ConferenceRoomType.GROUP and room.group_id:
            members_stmt = select(GroupMember.user_id).where(GroupMember.group_id == room.group_id)
            members_result = await self.session.execute(members_stmt)
            recipient_ids = {row[0] for row in members_result.all()}

        elif room.room_type == ConferenceRoomType.PROJECT and room.project_id:
            members_stmt = (
                select(GroupMember.user_id)
                .join(Group, Group.id == GroupMember.group_id)
                .join(project_group_association, project_group_association.c.group_id == Group.id)
                .where(project_group_association.c.project_id == room.project_id)
            )
            members_result = await self.session.execute(members_stmt)
            recipient_ids = {row[0] for row in members_result.all()}

        elif room.room_type == ConferenceRoomType.TASK and room.task_id:
            task_stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == room.task_id)
            task_result = await self.session.execute(task_stmt)
            task = task_result.scalar_one_or_none()
            if task:
                recipient_ids = {user.id for user in task.assignees}

        elif room.room_type == ConferenceRoomType.INSTANT:
            invited_stmt = select(conference_invited_users.c.user_id).where(
                conference_invited_users.c.room_id == room.id
            )
            invited_result = await self.session.execute(invited_stmt)
            recipient_ids = {row[0] for row in invited_result.all()}

        recipient_ids.discard(created_by)

        if not recipient_ids:
            return

        creator = await self.session.get(User, created_by)
        creator_name = creator.login if creator else "Пользователь"

        await self.notification_trigger._broadcast_notification(
            user_ids=recipient_ids,
            notification_type=NotificationType.CONFERENCE_STARTED,
            title="Начался созвон",
            content=f"{creator_name} начал(а) созвон «{room.title}»",
            priority=NotificationPriority.HIGH,
            data={
                "room_id": room.id,
                "room_name": room.room_name,
                "room_type": room.room_type.value,
                "room_title": room.title,
            },
        )

    async def _get_rooms_by_scope(
        self,
        user_id: int,
        status: str,
        *scope_conditions,
    ) -> List[ConferenceRoom]:
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.participants),
            selectinload(ConferenceRoom.stats),
        ).where(*scope_conditions)

        if status == "active":
            stmt = stmt.where(ConferenceRoom.is_active == True)
        elif status == "ended":
            stmt = stmt.where(ConferenceRoom.is_active == False)

        stmt = stmt.order_by(ConferenceRoom.started_at.desc().nullslast(), ConferenceRoom.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().unique().all()

    async def get_rooms_by_project(self, project_id: int, user_id: int, status: str = "active") -> List[ConferenceRoom]:
        """Получение созвонов проекта."""
        if not await check_user_in_project(self.session, user_id, project_id):
            return []
        return await self._get_rooms_by_scope(user_id, status, ConferenceRoom.project_id == project_id)

    async def get_rooms_by_group(self, group_id: int, user_id: int, status: str = "active") -> List[ConferenceRoom]:
        """Получение созвонов группы."""
        if not await check_user_in_group(self.session, user_id, group_id):
            return []
        return await self._get_rooms_by_scope(user_id, status, ConferenceRoom.group_id == group_id)

    async def get_rooms_by_task(self, task_id: int, user_id: int, status: str = "active") -> List[ConferenceRoom]:
        """Получение созвонов задачи."""
        if not await self._can_access_task(user_id, task_id):
            return []
        return await self._get_rooms_by_scope(user_id, status, ConferenceRoom.task_id == task_id)

    async def get_room_stats(self, room_id: int, user_id: int) -> Optional[ConferenceStats]:
        """Получение статистики комнаты.

        Статистика доступна модератору, создателю и участникам, у которых есть доступ к комнате.
        """
        room = await self.get_room_by_id(room_id)
        if not room:
            return None

        if not await self.can_join_conference(user_id, room):
            return None

        if not room.stats and not room.is_active:
            await self._collect_room_stats(room)
            await self.session.commit()
            room = await self.get_room_by_id(room_id)

        stmt = select(ConferenceStats).where(
            ConferenceStats.room_id == room_id
        ).order_by(ConferenceStats.created_at.desc()).limit(1)

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_invitable_users_for_user(
        self,
        user_id: int,
        query: Optional[str] = None,
        limit: int = 30,
    ) -> List[User]:
        """Получение пользователей, которых можно пригласить в мгновенный созвон.

        В первой версии доступны пользователи из общих групп. Создатель исключается.
        Запрос построен без DISTINCT ON, чтобы PostgreSQL не требовал совпадения
        DISTINCT-полей с началом ORDER BY.
        """
        user_group_ids = await self._get_user_group_ids(user_id)

        if not user_group_ids:
            return []

        # Пользователя может объединять с текущим пользователем несколько групп.
        # Чтобы не получать дубли через JOIN + DISTINCT ON, сначала выбираем
        # уникальные ID подходящих пользователей, а затем загружаем самих User.
        user_ids_subquery = (
            select(GroupMember.user_id)
            .where(
                GroupMember.group_id.in_(user_group_ids),
                GroupMember.user_id != user_id,
            )
            .distinct()
        )

        stmt = (
            select(User)
            .where(User.id.in_(user_ids_subquery))
            .order_by(User.login.asc())
            .limit(limit)
        )

        if query:
            pattern = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    User.login.ilike(pattern),
                    User.email.ilike(pattern),
                    User.name.ilike(pattern),
                )
            )

        result = await self.session.execute(stmt)
        return result.scalars().all()