import json
import asyncio
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, timedelta
from sqlalchemy import select, func, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import (
    Notification, NotificationType, NotificationPriority, 
    User, Group, Project, Task, GroupMember
)
from core.logger import logger
from .redis_client import redis_client
from .websocket_manager import manager
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from core.services import ServiceFactory


class NotificationService:
    """Сервис для работы с уведомлениями"""
    
    def __init__(
        self, 
        session: AsyncSession, 
        service_factory: Optional['ServiceFactory'] = None
    ):
        self.session = session
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
        """Создание и отправка уведомления"""
        
        # Создаем в БД
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            priority=priority,
            title=title,
            content=content,
            data=data
        )
        
        self.session.add(notification)
        await self.session.commit()
        await self.session.refresh(notification)
        
        # ИНВАЛИДИРУЕМ КЭШ СЧЁТЧИКА
        cache_key = f"unread:{user_id}"
        await redis_client.client.delete(cache_key)
        
        # Формируем сообщение для отправки
        ws_message = {
            "id": notification.id,
            "type": notification_type.value,
            "priority": priority.value,
            "title": title,
            "content": content,
            "data": data,
            "created_at": notification.created_at.isoformat(),
            "is_read": False
        }
        
        # Отправляем через WebSocket (если пользователь онлайн)
        sent = await manager.send_to_user(user_id, ws_message)
        
        # Публикуем в Redis для других инстансов
        await redis_client.publish("notifications", {
            "user_id": user_id,
            "message": ws_message
        })
        
        # Также отправляем обновлённый счётчик
        new_count = await self.get_unread_count(user_id)
        await redis_client.publish("notifications", {
            "user_id": user_id,
            "message": {"type": "unread_count", "count": new_count}
        })
        
        logger.debug(f"Notification created for user {user_id}: {title} (sent={sent})")
        return notification
    
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
        
        # Пробуем получить из Redis с коротким TTL
        cache_key = f"unread:{user_id}"
        cached = await redis_client.client.get(cache_key)
        
        if cached is not None:
            return int(cached)
        
        # Если нет в кэше, считаем в БД
        stmt = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False
        )
        result = await self.session.execute(stmt)
        count = result.scalar_one()
        
        # Кэшируем на 10 секунд, а не на 60
        await redis_client.client.setex(cache_key, 10, count)
        
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
            cache_key = f"unread:{user_id}"
            await redis_client.client.delete(cache_key)
            
            # Отправляем обновлённый счётчик
            new_count = await self.get_unread_count(user_id)
            await redis_client.publish("notifications", {
                "user_id": user_id,
                "message": {"type": "unread_count", "count": new_count}
            })
            
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
        cache_key = f"unread:{user_id}"
        await redis_client.client.delete(cache_key)
        
        # Отправляем обновлённый счётчик
        await redis_client.publish("notifications", {
            "user_id": user_id,
            "message": {"type": "unread_count", "count": 0}
        })
        
        return count


class NotificationTriggerService:
    """Сервис для автоматического создания уведомлений при событиях"""
    
    def __init__(
        self, 
        session: AsyncSession, 
        service_factory: Optional['ServiceFactory'] = None
    ):
        self.session = session
        self.service_factory = service_factory
        self.notification_service = NotificationService(session, service_factory)
    
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
        # Загружаем задачу с исполнителями
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()
        
        if not task:
            return set()
        
        # Исполнители
        user_ids = {assignee.id for assignee in task.assignees}
        
        # Участники группы (все, кто может видеть задачу)
        if task.group_id:
            group_members = await self._get_group_member_ids(task.group_id)
            user_ids.update(group_members)
        
        if exclude_user_id:
            user_ids.discard(exclude_user_id)
        
        return user_ids
    
    # ==================== ГРУППОВЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_group_created(self, group: Group, created_by: User):
        """Группа создана"""
        # Уведомление отправляется только создателю (он и так знает)
        # Можно добавить уведомление для супер-админов
        pass
    
    async def on_group_updated(self, group: Group, updated_by: User, changes: Dict[str, Any]):
        """Группа обновлена"""
        # Уведомляем всех участников группы
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=updated_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.GROUP_UPDATED,
                title="Группа обновлена",
                content=f"{updated_by.login} обновил(а) информацию о группе '{group.name}'",
                priority=NotificationPriority.MEDIUM,
                data={"group_id": group.id, "group_name": group.name, "changes": changes}
            )
    
    async def on_group_deleted(self, group: Group, deleted_by: User):
        """Группа удалена"""
        # Уведомляем всех участников группы
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=deleted_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
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
            await self.notification_service.create(
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
        
        for user_id in other_users:
            await self.notification_service.create(
                user_id=user_id,
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
            await self.notification_service.create(
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
        
        for user_id in other_users:
            await self.notification_service.create(
                user_id=user_id,
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
            await self.notification_service.create(
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
        
        for user_id in other_users:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.USER_ROLE_CHANGED,
                title="Изменение роли в группе",
                content=f"{changed_by.login} изменил(а) роль {target_user.login} в группе '{group.name}' на '{new_role}'",
                priority=NotificationPriority.MEDIUM,
                data={"group_id": group.id, "group_name": group.name, "user_id": target_user.id, "new_role": new_role}
            )
    
    # ==================== ПРОЕКТНЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_project_created(self, project: Project, created_by: User, group_ids: List[int]):
        """Проект создан"""
        # Уведомляем участников всех групп, привязанных к проекту
        for group_id in group_ids:
            user_ids = await self._get_group_member_ids(group_id, exclude_user_id=created_by.id)
            
            for user_id in user_ids:
                await self.notification_service.create(
                    user_id=user_id,
                    notification_type=NotificationType.PROJECT_CREATED,
                    title="Новый проект",
                    content=f"{created_by.login} создал(а) новый проект '{project.title}' в вашей группе",
                    priority=NotificationPriority.MEDIUM,
                    data={"project_id": project.id, "project_title": project.title, "group_id": group_id}
                )
    
    async def on_project_updated(self, project: Project, updated_by: User, changes: Dict[str, Any]):
        """Проект обновлен"""
        # Уведомляем всех участников проекта
        user_ids = await self._get_project_member_ids(project.id, exclude_user_id=updated_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.PROJECT_UPDATED,
                title="Проект обновлен",
                content=f"{updated_by.login} обновил(а) проект '{project.title}'",
                priority=NotificationPriority.MEDIUM,
                data={"project_id": project.id, "project_title": project.title, "changes": changes}
            )
    
    async def on_project_deleted(self, project: Project, deleted_by: User):
        """Проект удален"""
        # Уведомляем всех участников проекта
        user_ids = await self._get_project_member_ids(project.id, exclude_user_id=deleted_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.PROJECT_DELETED,
                title="Проект удален",
                content=f"{deleted_by.login} удалил(а) проект '{project.title}'",
                priority=NotificationPriority.HIGH,
                data={"project_id": project.id, "project_title": project.title}
            )
    
    async def on_group_added_to_project(
        self,
        project: Project,
        group: Group,
        added_by: User
    ):
        """Группа добавлена в проект"""
        # Уведомляем участников добавленной группы
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=added_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.GROUP_ADDED_TO_PROJECT,
                title="Группа добавлена в проект",
                content=f"{added_by.login} добавил(а) группу '{group.name}' в проект '{project.title}'",
                priority=NotificationPriority.MEDIUM,
                data={"project_id": project.id, "project_title": project.title, "group_id": group.id, "group_name": group.name}
            )
        
        # Также уведомляем участников других групп проекта (опционально)
        other_members = await self._get_project_member_ids(project.id, exclude_user_id=added_by.id)
        other_members.difference_update(user_ids)
        
        for user_id in other_members:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.GROUP_ADDED_TO_PROJECT,
                title="Новая группа в проекте",
                content=f"{added_by.login} добавил(а) группу '{group.name}' в проект '{project.title}'",
                priority=NotificationPriority.LOW,
                data={"project_id": project.id, "project_title": project.title, "group_id": group.id, "group_name": group.name}
            )
    
    async def on_group_removed_from_project(
        self,
        project: Project,
        group: Group,
        removed_by: User
    ):
        """Группа удалена из проекта"""
        # Уведомляем участников удаленной группы
        user_ids = await self._get_group_member_ids(group.id, exclude_user_id=removed_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.GROUP_REMOVED_FROM_PROJECT,
                title="Группа удалена из проекта",
                content=f"{removed_by.login} удалил(а) группу '{group.name}' из проекта '{project.title}'",
                priority=NotificationPriority.HIGH,
                data={"project_id": project.id, "project_title": project.title, "group_id": group.id, "group_name": group.name}
            )
        
        # Уведомляем участников других групп проекта
        other_members = await self._get_project_member_ids(project.id, exclude_user_id=removed_by.id)
        
        for user_id in other_members:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.GROUP_REMOVED_FROM_PROJECT,
                title="Группа удалена из проекта",
                content=f"{removed_by.login} удалил(а) группу '{group.name}' из проекта '{project.title}'",
                priority=NotificationPriority.MEDIUM,
                data={"project_id": project.id, "project_title": project.title, "group_id": group.id, "group_name": group.name}
            )
    
    # ==================== ЗАДАЧНЫЕ УВЕДОМЛЕНИЯ ====================
    
    async def on_task_created(self, task: Task, created_by: User, assignee_ids: List[int]):
        """Задача создана"""
        # Получаем всех участников группы
        group_members = await self._get_group_member_ids(task.group_id, exclude_user_id=created_by.id)
        
        # Для каждого участника группы
        for user_id in group_members:
            is_assignee = user_id in assignee_ids
            
            if is_assignee:
                # Специальное уведомление для исполнителей
                await self.notification_service.create(
                    user_id=user_id,
                    notification_type=NotificationType.USER_ASSIGNED_TO_TASK,
                    title="Новая задача назначена вам",
                    content=f"{created_by.login} назначил(а) вам задачу: '{task.title}'",
                    priority=NotificationPriority.HIGH,
                    data={"task_id": task.id, "task_title": task.title, "project_id": task.project_id}
                )
            else:
                # Обычное уведомление для остальных
                await self.notification_service.create(
                    user_id=user_id,
                    notification_type=NotificationType.TASK_CREATED,
                    title="Новая задача",
                    content=f"{created_by.login} создал(а) новую задачу '{task.title}' в проекте",
                    priority=NotificationPriority.MEDIUM,
                    data={"task_id": task.id, "task_title": task.title, "project_id": task.project_id}
                )
    
    async def on_task_updated(self, task: Task, updated_by: User, changes: Dict[str, Any]):
        """Задача обновлена"""
        # Уведомляем всех участников задачи
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=updated_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.TASK_UPDATED,
                title="Задача обновлена",
                content=f"{updated_by.login} обновил(а) задачу '{task.title}'",
                priority=NotificationPriority.MEDIUM,
                data={"task_id": task.id, "task_title": task.title, "changes": changes}
            )
    
    async def on_task_deleted(self, task: Task, deleted_by: User):
        """Задача удалена"""
        # Уведомляем всех участников задачи
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=deleted_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
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
        # Уведомляем всех участников задачи
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=changed_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
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
        # Уведомляем всех участников задачи
        user_ids = await self._get_task_participant_ids(task.id, exclude_user_id=changed_by.id)
        
        for user_id in user_ids:
            await self.notification_service.create(
                user_id=user_id,
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
                await self.notification_service.create(
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
        
        for user_id in other_users:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.USER_ASSIGNED_TO_TASK,
                title="Назначены новые исполнители",
                content=content,
                priority=NotificationPriority.MEDIUM,
                data={"task_id": task.id, "task_title": task.title, "assigned_users": [u.id for u in assigned_users]}
            )
    
    async def on_users_unassigned_from_task(
        self,
        task: Task,
        unassigned_users: List[User],
        unassigned_by: User
    ):
        """Пользователи сняты с задачи"""
        # Уведомляем снятых пользователей
        for user in unassigned_users:
            if user.id != unassigned_by.id:
                await self.notification_service.create(
                    user_id=user.id,
                    notification_type=NotificationType.USER_UNASSIGNED_FROM_TASK,
                    title="Вы сняты с задачи",
                    content=f"{unassigned_by.login} снял(а) вас с задачи '{task.title}'",
                    priority=NotificationPriority.HIGH,
                    data={"task_id": task.id, "task_title": task.title}
                )
        
        # Уведомляем остальных участников задачи
        other_users = await self._get_task_participant_ids(task.id, exclude_user_id=unassigned_by.id)
        
        if len(unassigned_users) == 1:
            content = f"{unassigned_by.login} снял(а) {unassigned_users[0].login} с задачи '{task.title}'"
        else:
            names = ", ".join(u.login for u in unassigned_users[:3])
            if len(unassigned_users) > 3:
                names += f" и еще {len(unassigned_users) - 3}"
            content = f"{unassigned_by.login} снял(а) {names} с задачи '{task.title}'"
        
        for user_id in other_users:
            await self.notification_service.create(
                user_id=user_id,
                notification_type=NotificationType.USER_UNASSIGNED_FROM_TASK,
                title="Исполнители сняты с задачи",
                content=content,
                priority=NotificationPriority.MEDIUM,
                data={"task_id": task.id, "task_title": task.title, "unassigned_users": [u.id for u in unassigned_users]}
            )