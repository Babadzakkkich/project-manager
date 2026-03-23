import json
import asyncio
from typing import List, Optional, Dict, Any, Set, TYPE_CHECKING
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import (
    Notification, NotificationType, NotificationPriority, 
    User, Group, Project, Task, GroupMember
)
from core.logger import logger
from .redis_client import redis_client
from typing import Optional

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from .publisher import NotificationPublisher


class NotificationService:
    """Сервис для работы с уведомлениями"""
    
    def __init__(
        self, 
        session: AsyncSession, 
        notification_publisher: Optional['NotificationPublisher'] = None,
        service_factory: Optional['ServiceFactory'] = None
    ):
        self.session = session
        self.notification_publisher = notification_publisher
        self.service_factory = service_factory
        self.logger = logger
    
    async def create(
        self,
        user_id: int,
        notification_type: NotificationType,
        title: str,
        content: str,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
        data: Optional[Dict[str, Any]] = None
    ) -> Notification:
        """
        Создание уведомления в БД
        (вызывается потребителем, не для внешнего использования)
        """
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            priority=priority,
            title=title,
            content=content,
            data=data
        )
        
        self.session.add(notification)
        await self.session.flush()
        await self.session.refresh(notification)
        
        # Инвалидируем кэш счётчика
        await redis_client.invalidate_unread_count(user_id)
        
        self.logger.debug(f"Notification created for user {user_id}: {title}")
        return notification
    
    async def send(
        self,
        user_id: int,
        notification_type: NotificationType,
        title: str,
        content: str,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Отправить уведомление (асинхронно через RabbitMQ)
        """
        if not self.notification_publisher:
            self.logger.warning("Notification publisher not available")
            return False
        
        from shared.messaging import MessagePriority
        message_priority = MessagePriority(priority.value)
        
        return await self.notification_publisher.send_notification(
            user_id=user_id,
            notification_type=notification_type.value,
            title=title,
            content=content,
            priority=message_priority,
            data=data
        )
    
    async def send_to_user(
        self,
        user_id: int,
        message: Dict[str, Any]
    ) -> bool:
        """
        Отправить произвольное сообщение пользователю
        """
        if not self.notification_publisher:
            self.logger.warning("Notification publisher not available")
            return False
            
        return await self.notification_publisher.send_to_user(user_id, message)
    
    async def get_user_notifications(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
        notification_type: Optional[NotificationType] = None
    ) -> List[Notification]:
        """Получение уведомлений пользователя"""
        
        stmt = select(Notification).where(Notification.user_id == user_id)
        
        if unread_only:
            stmt = stmt.where(Notification.is_read == False)
        
        if notification_type:
            stmt = stmt.where(Notification.type == notification_type)
        
        stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def get_unread_count(self, user_id: int) -> int:
        """Получение количества непрочитанных уведомлений"""
        
        # Пробуем получить из Redis (кэш)
        cache_key = f"unread:{user_id}"
        cached = await redis_client.get(cache_key)
        
        if cached is not None:
            return int(cached)
        
        # Если нет в кэше, считаем в БД
        stmt = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False
        )
        result = await self.session.execute(stmt)
        count = result.scalar_one()
        
        # Кэшируем на 10 секунд
        await redis_client.set(cache_key, str(count), ttl=10)
        
        return count
    
    async def mark_as_read(self, notification_id: int, user_id: int) -> bool:
        """Отметить уведомление как прочитанное"""
        
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id
        )
        result = await self.session.execute(stmt)
        notification = result.scalar_one_or_none()
        
        if notification and not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.utcnow()
            await self.session.commit()
            
            # Инвалидируем кэш
            await redis_client.invalidate_unread_count(user_id)
            
            # Отправляем обновлённый счётчик через RabbitMQ
            if self.notification_publisher:
                new_count = await self.get_unread_count(user_id)
                await self.notification_publisher.send_to_user(
                    user_id,
                    {"type": "unread_count", "count": new_count}
                )
            
            return True
        
        return False
    
    async def mark_all_as_read(self, user_id: int) -> int:
        """Отметить все уведомления как прочитанные"""
        
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False
        )
        result = await self.session.execute(stmt)
        notifications = result.scalars().all()
        
        count = len(notifications)
        for notification in notifications:
            notification.is_read = True
            notification.read_at = datetime.utcnow()
        
        await self.session.commit()
        
        # Инвалидируем кэш
        await redis_client.invalidate_unread_count(user_id)
        
        # Отправляем обновлённый счётчик
        if self.notification_publisher:
            await self.notification_publisher.send_to_user(
                user_id,
                {"type": "unread_count", "count": 0}
            )
        
        return count


class NotificationTriggerService:
    """Сервис для автоматического создания уведомлений при событиях"""
    
    def __init__(
        self, 
        session: AsyncSession, 
        notification_publisher: Optional['NotificationPublisher'] = None,
        service_factory: Optional['ServiceFactory'] = None
    ):
        self.session = session
        self.service_factory = service_factory
        self.notification_service = NotificationService(session, notification_publisher, service_factory)
        self.logger = logger
    
    async def _get_group_member_ids(self, group_id: int, exclude_user_id: Optional[int] = None) -> Set[int]:
        """Получить ID всех участников группы"""
        stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
        result = await self.session.execute(stmt)
        user_ids = {row[0] for row in result}
        
        if exclude_user_id:
            user_ids.discard(exclude_user_id)
        
        return user_ids
    
    async def _get_project_member_ids(self, project_id: int, exclude_user_id: Optional[int] = None) -> Set[int]:
        """Получить ID всех участников проекта (через группы)"""
        stmt = select(GroupMember.user_id).join(
            GroupMember.group
        ).join(
            Group.projects
        ).where(
            Project.id == project_id
        )
        result = await self.session.execute(stmt)
        user_ids = {row[0] for row in result}
        
        if exclude_user_id:
            user_ids.discard(exclude_user_id)
        
        return user_ids
    
    async def _get_task_participant_ids(self, task_id: int, exclude_user_id: Optional[int] = None) -> Set[int]:
        """Получить ID всех участников задачи (исполнители + группа)"""
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()
        
        if not task:
            return set()
        
        user_ids = {assignee.id for assignee in task.assignees}
        
        if task.group_id:
            group_members = await self._get_group_member_ids(task.group_id)
            user_ids.update(group_members)
        
        if exclude_user_id:
            user_ids.discard(exclude_user_id)
        
        return user_ids
    
    async def _broadcast_notification(
        self,
        user_ids: Set[int],
        notification_type: NotificationType,
        title: str,
        content: str,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
        data: Optional[Dict[str, Any]] = None
    ):
        """Разослать уведомление группе пользователей"""
        if not user_ids:
            return
        
        if not self.notification_service.notification_publisher:
            self.logger.warning("Notification publisher not available")
            return
        
        # Преобразуем NotificationPriority в MessagePriority
        from shared.messaging import MessagePriority
        message_priority = MessagePriority(priority.value)
        
        await self.notification_service.notification_publisher.broadcast_notification(
            user_ids=list(user_ids),
            notification_type=notification_type.value,
            title=title,
            content=content,
            priority=message_priority,
            data=data
        )
    
    # ==================== ГРУППОВЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_group_updated(self, group: Group, updated_by: User, changes: Dict[str, Any]):
        """Группа обновлена"""
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=updated_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.GROUP_UPDATED,
            title="Группа обновлена",
            content=f"{updated_by.login} обновил(а) информацию о группе '{group.name}'",
            priority=NotificationPriority.MEDIUM,
            data={"group_id": group.id, "group_name": group.name, "changes": changes}
        )
    
    async def on_group_deleted(self, group: Group, deleted_by: User):
        """Группа удалена"""
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=deleted_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.GROUP_DELETED,
            title="Группа удалена",
            content=f"{deleted_by.login} удалил(а) группу '{group.name}'",
            priority=NotificationPriority.HIGH,
            data={"group_id": group.id, "group_name": group.name}
        )
    
    async def on_user_added_to_group(
        self, 
        group: Group, 
        added_user: User, 
        added_by: User,
        role: str
    ):
        """Пользователь добавлен в группу"""
        # Уведомляем добавленного пользователя
        if added_user.id != added_by.id:
            await self.notification_service.send(
                user_id=added_user.id,
                notification_type=NotificationType.USER_ADDED_TO_GROUP,
                title="Вы добавлены в группу",
                content=f"{added_by.login} добавил(а) вас в группу '{group.name}' в роли {role}",
                priority=NotificationPriority.MEDIUM,
                data={"group_id": group.id, "group_name": group.name, "role": role}
            )
        
        # Уведомляем остальных участников группы
        other_users = await self._get_group_member_ids(group.id, exclude_user_id=added_by.id)
        other_users.discard(added_user.id)
        
        await self._broadcast_notification(
            user_ids=other_users,
            notification_type=NotificationType.USER_ADDED_TO_GROUP,
            title="Новый участник группы",
            content=f"{added_by.login} добавил(а) {added_user.login} в группу '{group.name}'",
            priority=NotificationPriority.LOW,
            data={"group_id": group.id, "group_name": group.name, "user_id": added_user.id, "user_login": added_user.login}
        )
    
    async def on_user_removed_from_group(
        self, 
        group: Group, 
        removed_user: User, 
        removed_by: User
    ):
        """Пользователь удален из группы"""
        # Уведомляем удаленного пользователя
        if removed_user.id != removed_by.id:
            await self.notification_service.send(
                user_id=removed_user.id,
                notification_type=NotificationType.USER_REMOVED_FROM_GROUP,
                title="Вы удалены из группы",
                content=f"{removed_by.login} удалил(а) вас из группы '{group.name}'",
                priority=NotificationPriority.HIGH,
                data={"group_id": group.id, "group_name": group.name}
            )
        
        # Уведомляем остальных участников группы
        other_users = await self._get_group_member_ids(group.id, exclude_user_id=removed_by.id)
        other_users.discard(removed_user.id)
        
        await self._broadcast_notification(
            user_ids=other_users,
            notification_type=NotificationType.USER_REMOVED_FROM_GROUP,
            title="Участник удален из группы",
            content=f"{removed_by.login} удалил(а) {removed_user.login} из группы '{group.name}'",
            priority=NotificationPriority.MEDIUM,
            data={"group_id": group.id, "group_name": group.name, "user_id": removed_user.id, "user_login": removed_user.login}
        )
    
    async def on_user_role_changed(
        self,
        group: Group,
        target_user: User,
        changed_by: User,
        old_role: str,
        new_role: str
    ):
        """Роль пользователя в группе изменена"""
        # Уведомляем пользователя, чью роль изменили
        if target_user.id != changed_by.id:
            await self.notification_service.send(
                user_id=target_user.id,
                notification_type=NotificationType.USER_ROLE_CHANGED,
                title="Ваша роль в группе изменена",
                content=f"{changed_by.login} изменил(а) вашу роль в группе '{group.name}' с '{old_role}' на '{new_role}'",
                priority=NotificationPriority.HIGH,
                data={"group_id": group.id, "group_name": group.name, "old_role": old_role, "new_role": new_role}
            )
        
        # Уведомляем остальных участников группы
        other_users = await self._get_group_member_ids(group.id, exclude_user_id=changed_by.id)
        other_users.discard(target_user.id)
        
        await self._broadcast_notification(
            user_ids=other_users,
            notification_type=NotificationType.USER_ROLE_CHANGED,
            title="Изменение роли в группе",
            content=f"{changed_by.login} изменил(а) роль {target_user.login} в группе '{group.name}' на '{new_role}'",
            priority=NotificationPriority.MEDIUM,
            data={"group_id": group.id, "group_name": group.name, "user_id": target_user.id, "new_role": new_role}
        )
    
    # ==================== ПРОЕКТНЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_project_created(self, project: Project, created_by: User, group_ids: List[int]):
        """Проект создан"""
        for group_id in group_ids:
            user_ids = await self._get_group_member_ids(group_id, exclude_user_id=created_by.id)
            
            await self._broadcast_notification(
                user_ids=user_ids,
                notification_type=NotificationType.PROJECT_CREATED,
                title="Новый проект",
                content=f"{created_by.login} создал(а) новый проект '{project.title}' в вашей группе",
                priority=NotificationPriority.MEDIUM,
                data={"project_id": project.id, "project_title": project.title, "group_id": group_id}
            )
    
    async def on_project_updated(self, project: Project, updated_by: User, changes: Dict[str, Any]):
        """Проект обновлен"""
        user_ids = await self._get_project_member_ids(project.id, exclude_user_id=updated_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.PROJECT_UPDATED,
            title="Проект обновлен",
            content=f"{updated_by.login} обновил(а) проект '{project.title}'",
            priority=NotificationPriority.MEDIUM,
            data={"project_id": project.id, "project_title": project.title, "changes": changes}
        )
    
    async def on_project_deleted(self, project: Project, deleted_by: User):
        """Проект удален"""
        user_ids = await self._get_project_member_ids(project.id, exclude_user_id=deleted_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.PROJECT_DELETED,
            title="Проект удален",
            content=f"{deleted_by.login} удалил(а) проект '{project.title}'",
            priority=NotificationPriority.HIGH,
            data={"project_id": project.id, "project_title": project.title}
        )
    
    # ==================== ЗАДАЧНЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_task_created(self, task: Task, created_by: User, assignee_ids: List[int]):
        """Задача создана"""
        group_members = await self._get_group_member_ids(task.group_id, exclude_user_id=created_by.id)
        
        for user_id in group_members:
            is_assignee = user_id in assignee_ids
            
            if is_assignee:
                await self.notification_service.send(
                    user_id=user_id,
                    notification_type=NotificationType.USER_ASSIGNED_TO_TASK,
                    title="Новая задача назначена вам",
                    content=f"{created_by.login} назначил(а) вам задачу: '{task.title}'",
                    priority=NotificationPriority.HIGH,
                    data={"task_id": task.id, "task_title": task.title, "project_id": task.project_id}
                )
            else:
                await self.notification_service.send(
                    user_id=user_id,
                    notification_type=NotificationType.TASK_CREATED,
                    title="Новая задача",
                    content=f"{created_by.login} создал(а) новую задачу '{task.title}' в проекте",
                    priority=NotificationPriority.MEDIUM,
                    data={"task_id": task.id, "task_title": task.title, "project_id": task.project_id}
                )
    
    async def on_task_updated(self, task: Task, updated_by: User, changes: Dict[str, Any]):
        """Задача обновлена"""
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=updated_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.TASK_UPDATED,
            title="Задача обновлена",
            content=f"{updated_by.login} обновил(а) задачу '{task.title}'",
            priority=NotificationPriority.MEDIUM,
            data={"task_id": task.id, "task_title": task.title, "changes": changes}
        )
    
    async def on_task_deleted(self, task: Task, deleted_by: User):
        """Задача удалена"""
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=deleted_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.TASK_DELETED,
            title="Задача удалена",
            content=f"{deleted_by.login} удалил(а) задачу '{task.title}'",
            priority=NotificationPriority.HIGH,
            data={"task_id": task.id, "task_title": task.title}
        )
    
    async def on_task_status_changed(
        self, 
        task: Task, 
        changed_by: User, 
        old_status: str, 
        new_status: str
    ):
        """Статус задачи изменен"""
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=changed_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.TASK_STATUS_CHANGED,
            title="Статус задачи изменен",
            content=f"{changed_by.login} изменил(а) статус задачи '{task.title}' с '{old_status}' на '{new_status}'",
            priority=NotificationPriority.MEDIUM,
            data={
                "task_id": task.id, 
                "task_title": task.title, 
                "old_status": old_status, 
                "new_status": new_status
            }
        )
    
    async def on_task_priority_changed(
        self,
        task: Task,
        changed_by: User,
        old_priority: str,
        new_priority: str
    ):
        """Приоритет задачи изменен"""
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=changed_by.id)
        
        await self._broadcast_notification(
            user_ids=user_ids,
            notification_type=NotificationType.TASK_PRIORITY_CHANGED,
            title="Приоритет задачи изменен",
            content=f"{changed_by.login} изменил(а) приоритет задачи '{task.title}' с '{old_priority}' на '{new_priority}'",
            priority=NotificationPriority.MEDIUM,
            data={
                "task_id": task.id,
                "task_title": task.title,
                "old_priority": old_priority,
                "new_priority": new_priority
            }
        )
    
    async def on_users_assigned_to_task(
        self,
        task: Task,
        assigned_users: List[User],
        assigned_by: User
    ):
        """Пользователи назначены на задачу"""
        # Уведомляем назначенных пользователей
        for user in assigned_users:
            if user.id != assigned_by.id:
                await self.notification_service.send(
                    user_id=user.id,
                    notification_type=NotificationType.USER_ASSIGNED_TO_TASK,
                    title="Вы назначены на задачу",
                    content=f"{assigned_by.login} назначил(а) вас на задачу '{task.title}'",
                    priority=NotificationPriority.HIGH,
                    data={"task_id": task.id, "task_title": task.title, "project_id": task.project_id}
                )
        
        # Уведомляем остальных участников задачи
        other_users = await self._get_task_participant_ids(task.id, exclude_user_id=assigned_by.id)
        assigned_ids = {u.id for u in assigned_users}
        other_users.difference_update(assigned_ids)
        
        if len(assigned_users) == 1:
            content = f"{assigned_by.login} назначил(а) {assigned_users[0].login} на задачу '{task.title}'"
        else:
            names = ", ".join(u.login for u in assigned_users[:3])
            if len(assigned_users) > 3:
                names += f" и еще {len(assigned_users) - 3}"
            content = f"{assigned_by.login} назначил(а) {names} на задачу '{task.title}'"
        
        await self._broadcast_notification(
            user_ids=other_users,
            notification_type=NotificationType.USER_ASSIGNED_TO_TASK,
            title="Назначены новые исполнители",
            content=content,
            priority=NotificationPriority.MEDIUM,
            data={"task_id": task.id, "task_title": task.title, "assigned_users": [u.id for u in assigned_users]}
        )