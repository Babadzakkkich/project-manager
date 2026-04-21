import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Set, TYPE_CHECKING
from sqlalchemy import select, delete, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import (
    NotificationPriority, NotificationType, User, Group, Project, Task, GroupMember,
    ConferenceRoom, ConferenceRoomType, ConferenceParticipant,
    ConferenceMessage, ConferenceStats, conference_invited_users,
    UserRole
)
from shared.dependencies import ensure_user_is_admin, check_user_in_group, check_user_in_project
from core.logger import logger
from core.utils.livekit import livekit_token, generate_room_name

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.notifications.service import NotificationTriggerService


class ConferenceService:
    """Сервис для работы с видеоконференциями"""
    
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._notification_trigger = None
    
    @property
    def notification_trigger(self) -> Optional['NotificationTriggerService']:
        """Ленивая загрузка NotificationTriggerService через фабрику"""
        if self._notification_trigger is None and self.service_factory:
            self._notification_trigger = self.service_factory.get('notification_trigger')
        return self._notification_trigger
    
    async def can_create_conference(self, user_id: int, room_type: str, entity_id: int) -> bool:
        """Проверка права на создание созвона"""
        if room_type == ConferenceRoomType.GROUP.value:
            try:
                await ensure_user_is_admin(self.session, user_id, entity_id)
                return True
            except:
                return False
                
        elif room_type == ConferenceRoomType.PROJECT.value:
            return await self._is_project_admin(user_id, entity_id)
            
        elif room_type == ConferenceRoomType.TASK.value:
            return await self._is_task_assignee_or_group_admin(user_id, entity_id)
            
        elif room_type == ConferenceRoomType.INSTANT.value:
            return True
            
        return False
    
    async def can_join_conference(self, user_id: int, room: ConferenceRoom) -> bool:
        """Проверка права на вход в созвон"""
        if room.room_type == ConferenceRoomType.GROUP:
            return await check_user_in_group(self.session, user_id, room.group_id)
        elif room.room_type == ConferenceRoomType.PROJECT:
            return await check_user_in_project(self.session, user_id, room.project_id)
        elif room.room_type == ConferenceRoomType.TASK:
            return await self._can_access_task(user_id, room.task_id)
        elif room.room_type == ConferenceRoomType.INSTANT:
            invited_ids = [u.id for u in room.invited_users]
            return user_id in invited_ids or user_id == room.created_by
        return False
    
    async def _is_project_admin(self, user_id: int, project_id: int) -> bool:
        """Проверка, является ли пользователь админом хотя бы одной группы проекта"""
        stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if not project:
            return False
            
        for group in project.groups:
            try:
                await ensure_user_is_admin(self.session, user_id, group.id)
                return True
            except:
                continue
        return False
    
    async def _is_task_assignee_or_group_admin(self, user_id: int, task_id: int) -> bool:
        """Проверка, является ли пользователь исполнителем задачи или админом группы"""
        stmt = select(Task).options(
            selectinload(Task.assignees),
            selectinload(Task.group)
        ).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            return False
            
        # Проверка, является ли исполнителем
        if any(u.id == user_id for u in task.assignees):
            return True
            
        # Проверка, является ли админом группы
        if task.group:
            try:
                await ensure_user_is_admin(self.session, user_id, task.group.id)
                return True
            except:
                pass
        return False
    
    async def _can_access_task(self, user_id: int, task_id: int) -> bool:
        """Проверка доступа к задаче"""
        stmt = select(Task).options(
            selectinload(Task.assignees),
            selectinload(Task.group)
        ).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            return False
            
        # Исполнители имеют доступ
        if any(u.id == user_id for u in task.assignees):
            return True
            
        # Участники группы имеют доступ
        if task.group:
            return await check_user_in_group(self.session, user_id, task.group.id)
            
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
        max_participants: int = 30
    ) -> ConferenceRoom:
        """Создание новой комнаты созвона"""
        self.logger.info(f"Creating conference room '{title}' of type '{room_type}' by user {created_by}")
        
        room_name = generate_room_name("conf")
        
        # Создаем запись в БД
        new_room = ConferenceRoom(
            room_name=room_name,
            title=title,
            room_type=ConferenceRoomType(room_type),
            project_id=project_id,
            group_id=group_id,
            task_id=task_id,
            created_by=created_by,
            max_participants=max_participants,
            started_at=datetime.now(timezone.utc)
        )
        
        self.session.add(new_room)
        await self.session.flush()
        
        # Добавляем приглашенных пользователей для мгновенных созвонов
        if room_type == ConferenceRoomType.INSTANT.value and invited_user_ids:
            users_stmt = select(User).where(User.id.in_(invited_user_ids))
            users_result = await self.session.execute(users_stmt)
            users = users_result.scalars().all()
            new_room.invited_users = users
        
        await self.session.commit()
        await self.session.refresh(new_room)
        
        # Создаем комнату в LiveKit (в фоне)
        asyncio.create_task(self._create_livekit_room_async(room_name))
        
        # Отправляем уведомления
        await self._notify_conference_started(new_room, created_by)
        
        self.logger.info(f"Conference room created: {room_name}")
        return new_room
    
    async def _create_livekit_room_async(self, room_name: str):
        """Асинхронное создание комнаты в LiveKit"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, livekit_token.create_room, room_name)
    
    async def get_room_by_id(self, room_id: int) -> Optional[ConferenceRoom]:
        """Получение комнаты по ID"""
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user)
        ).where(ConferenceRoom.id == room_id)
        
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_room_by_name(self, room_name: str) -> Optional[ConferenceRoom]:
        """Получение комнаты по имени"""
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user)
        ).where(ConferenceRoom.room_name == room_name)
        
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_available_rooms_for_user(self, user_id: int) -> List[ConferenceRoom]:
        """Получение списка доступных созвонов для пользователя"""
        # Получаем ID групп пользователя
        groups_stmt = select(GroupMember.group_id).where(GroupMember.user_id == user_id)
        groups_result = await self.session.execute(groups_stmt)
        user_group_ids = [row[0] for row in groups_result]
        
        # Получаем ID проектов, в которых участвует пользователь
        projects_stmt = select(Project.id).join(
            Project.groups
        ).join(
            Group.group_members
        ).where(GroupMember.user_id == user_id)
        projects_result = await self.session.execute(projects_stmt)
        user_project_ids = [row[0] for row in projects_result]
        
        # Формируем запрос с предзагрузкой participants для подсчета
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.group),
            selectinload(ConferenceRoom.project),
            selectinload(ConferenceRoom.task),
            selectinload(ConferenceRoom.participants)  # <-- ДОБАВИТЬ ЭТУ СТРОКУ
        ).where(
            (ConferenceRoom.is_active == True) &
            (
                # Групповые созвоны
                (ConferenceRoom.group_id.in_(user_group_ids) if user_group_ids else False) |
                # Проектные созвоны
                (ConferenceRoom.project_id.in_(user_project_ids) if user_project_ids else False) |
                # Мгновенные созвоны, куда приглашен пользователь
                ConferenceRoom.invited_users.any(User.id == user_id) |
                # Созвоны, созданные пользователем
                (ConferenceRoom.created_by == user_id)
            )
        ).order_by(ConferenceRoom.started_at.desc())
        
        result = await self.session.execute(stmt)
        rooms = result.scalars().unique().all()
        
        # Дополнительно фильтруем задачи (логика сложнее)
        filtered_rooms = []
        for room in rooms:
            if room.room_type == ConferenceRoomType.TASK:
                if await self._can_access_task(user_id, room.task_id):
                    filtered_rooms.append(room)
            else:
                filtered_rooms.append(room)
                
        return filtered_rooms
    
    async def join_room(self, room_id: int, user_id: int) -> tuple[Optional[ConferenceRoom], Optional[str]]:
        """Вход пользователя в комнату"""
        room = await self.get_room_by_id(room_id)
        if not room:
            self.logger.warning(f"Room {room_id} not found")
            return None, None
        
        # Проверяем доступ
        if not await self.can_join_conference(user_id, room):
            self.logger.warning(f"User {user_id} not allowed to join room {room_id}")
            return None, None
        
        # Проверяем, активна ли комната
        if not room.is_active:
            self.logger.warning(f"Room {room_id} is not active")
            return None, None
        
        # Получаем пользователя
        user_stmt = select(User).where(User.id == user_id)
        user_result = await self.session.execute(user_stmt)
        user = user_result.scalar_one()
        
        # Проверяем, является ли пользователь модератором
        is_moderator = await self._is_room_moderator(user_id, room)
        
        # Генерируем токен
        token = livekit_token.generate_token(
            room_name=room.room_name,
            user_id=user_id,
            user_name=user.name or user.login,
            is_admin=is_moderator
        )
        
        # Проверяем, есть ли уже активная запись об участии
        participant_stmt = select(ConferenceParticipant).where(
            ConferenceParticipant.room_id == room_id,
            ConferenceParticipant.user_id == user_id
        )
        participant_result = await self.session.execute(participant_stmt)
        participant = participant_result.scalar_one_or_none()
        
        if participant:
            # Уже участвует, просто обновляем время и сбрасываем left_at
            participant.joined_at = datetime.now(timezone.utc)
            participant.left_at = None
        else:
            # Создаем новую запись
            participant = ConferenceParticipant(
                room_id=room_id,
                user_id=user_id,
                joined_at=datetime.now(timezone.utc)
            )
            self.session.add(participant)
        
        await self.session.commit()
        
        return room, token
    
    async def _is_room_moderator(self, user_id: int, room: ConferenceRoom) -> bool:
        """Проверка, является ли пользователь модератором комнаты"""
        # Создатель всегда модератор
        if room.created_by == user_id:
            return True
            
        # Для групповых и проектных созвонов - админы групп
        if room.room_type == ConferenceRoomType.GROUP and room.group_id:
            try:
                await ensure_user_is_admin(self.session, user_id, room.group_id)
                return True
            except:
                pass
                
        if room.room_type == ConferenceRoomType.PROJECT and room.project_id:
            return await self._is_project_admin(user_id, room.project_id)
            
        if room.room_type == ConferenceRoomType.TASK and room.task_id:
            stmt = select(Task).options(selectinload(Task.group)).where(Task.id == room.task_id)
            result = await self.session.execute(stmt)
            task = result.scalar_one_or_none()
            if task and task.group:
                try:
                    await ensure_user_is_admin(self.session, user_id, task.group.id)
                    return True
                except:
                    pass
                    
        return False
    
    async def leave_room(self, room_id: int, user_id: int) -> bool:
        """Выход пользователя из комнаты"""
        stmt = select(ConferenceParticipant).where(
            ConferenceParticipant.room_id == room_id,
            ConferenceParticipant.user_id == user_id
        )
        result = await self.session.execute(stmt)
        participant = result.scalar_one_or_none()
        
        if participant:
            participant.left_at = datetime.now(timezone.utc)
            await self.session.commit()
            return True
        return False
    
    async def end_conference(self, room_id: int, user_id: int) -> bool:
        """Завершение созвона (только для модератора)"""
        room = await self.get_room_by_id(room_id)
        if not room:
            return False
            
        if not await self._is_room_moderator(user_id, room):
            self.logger.warning(f"User {user_id} not allowed to end room {room_id}")
            return False
        
        room.is_active = False
        room.ended_at = datetime.now(timezone.utc)
        
        # Собираем статистику
        await self._collect_room_stats(room)
        
        await self.session.commit()
        
        # Удаляем комнату в LiveKit (в фоне)
        asyncio.create_task(self._delete_livekit_room_async(room.room_name))
        
        return True
    
    async def _delete_livekit_room_async(self, room_name: str):
        """Асинхронное удаление комнаты в LiveKit"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, livekit_token.delete_room, room_name)
    
    async def _collect_room_stats(self, room: ConferenceRoom):
        """Сбор статистики по комнате"""
        if not room.started_at:
            return
            
        end_time = room.ended_at or datetime.now(timezone.utc)
        duration = int((end_time - room.started_at).total_seconds())
        
        # Количество участников
        participant_count = len(room.participants)
        
        # Количество сообщений
        msg_stmt = select(func.count()).select_from(ConferenceMessage).where(
            ConferenceMessage.room_id == room.id
        )
        msg_result = await self.session.execute(msg_stmt)
        messages_count = msg_result.scalar() or 0
        
        stats = ConferenceStats(
            room_id=room.id,
            participant_count=participant_count,
            peak_participants=participant_count,
            duration_seconds=duration,
            messages_count=messages_count
        )
        self.session.add(stats)
    
    async def _notify_conference_started(self, room: ConferenceRoom, created_by: int):
        """Отправка уведомлений о начале созвона"""
        if not self.notification_trigger:
            return
            
        # Получаем создателя
        creator_stmt = select(User).where(User.id == created_by)
        creator_result = await self.session.execute(creator_stmt)
        creator = creator_result.scalar_one()
        
        # Определяем получателей в зависимости от типа комнаты
        recipient_ids: Set[int] = set()
        
        if room.room_type == ConferenceRoomType.GROUP and room.group_id:
            # Все участники группы
            members_stmt = select(GroupMember.user_id).where(GroupMember.group_id == room.group_id)
            members_result = await self.session.execute(members_stmt)
            recipient_ids = {row[0] for row in members_result}
            
        elif room.room_type == ConferenceRoomType.PROJECT and room.project_id:
            # Все участники всех групп проекта
            project_stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == room.project_id)
            project_result = await self.session.execute(project_stmt)
            project = project_result.scalar_one_or_none()
            if project:
                for group in project.groups:
                    members_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group.id)
                    members_result = await self.session.execute(members_stmt)
                    recipient_ids.update(row[0] for row in members_result)
                    
        elif room.room_type == ConferenceRoomType.TASK and room.task_id:
            # Исполнители задачи
            task_stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == room.task_id)
            task_result = await self.session.execute(task_stmt)
            task = task_result.scalar_one_or_none()
            if task:
                recipient_ids = {u.id for u in task.assignees}
                
        elif room.room_type == ConferenceRoomType.INSTANT:
            invited_stmt = select(conference_invited_users.c.user_id).where(
                conference_invited_users.c.room_id == room.id
            )
            invited_result = await self.session.execute(invited_stmt)
            recipient_ids = {row[0] for row in invited_result}
        
        # Удаляем создателя из получателей
        recipient_ids.discard(created_by)
        
        if not recipient_ids:
            return
        
        # Отправляем уведомления через существующую систему
        title = f"🎥 Начался созвон"
        content = f"{creator.login} начал(а) созвон «{room.title}»"
        
        data = {
            "room_id": room.id,
            "room_name": room.room_name,
            "room_type": room.room_type.value,
            "room_title": room.title
        }
        
        # Используем broadcast для отправки уведомлений
        await self.notification_trigger._broadcast_notification(
            user_ids=recipient_ids,
            notification_type=NotificationType.CONFERENCE_STARTED,
            title=title,
            content=content,
            priority=NotificationPriority.HIGH,
            data=data
        )
    
    async def get_rooms_by_project(self, project_id: int, user_id: int) -> List[ConferenceRoom]:
        """Получение созвонов проекта"""
        if not await check_user_in_project(self.session, user_id, project_id):
            return []
            
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.participants)
        ).where(
            ConferenceRoom.project_id == project_id,
            ConferenceRoom.is_active == True
        ).order_by(ConferenceRoom.started_at.desc())
        
        result = await self.session.execute(stmt)
        return result.scalars().unique().all()
    
    async def get_rooms_by_group(self, group_id: int, user_id: int) -> List[ConferenceRoom]:
        """Получение созвонов группы"""
        if not await check_user_in_group(self.session, user_id, group_id):
            return []
            
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.participants)
        ).where(
            ConferenceRoom.group_id == group_id,
            ConferenceRoom.is_active == True
        ).order_by(ConferenceRoom.started_at.desc())
        
        result = await self.session.execute(stmt)
        return result.scalars().unique().all()
    
    async def get_rooms_by_task(self, task_id: int, user_id: int) -> List[ConferenceRoom]:
        """Получение созвонов задачи"""
        if not await self._can_access_task(user_id, task_id):
            return []
            
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.participants)
        ).where(
            ConferenceRoom.task_id == task_id,
            ConferenceRoom.is_active == True
        ).order_by(ConferenceRoom.started_at.desc())
        
        result = await self.session.execute(stmt)
        return result.scalars().unique().all()
    
    async def get_room_stats(self, room_id: int, user_id: int) -> Optional[ConferenceStats]:
        """Получение статистики комнаты (только для модератора)"""
        room = await self.get_room_by_id(room_id)
        if not room:
            return None
            
        if not await self._is_room_moderator(user_id, room):
            return None
            
        stmt = select(ConferenceStats).where(
            ConferenceStats.room_id == room_id
        ).order_by(ConferenceStats.created_at.desc()).limit(1)
        
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()