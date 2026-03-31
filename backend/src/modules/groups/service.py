from typing import Optional, List, TYPE_CHECKING, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload

from core.database.models import Group, User, GroupMember, UserRole, Task, project_group_association, task_user_association
from shared.dependencies import ensure_user_is_admin, get_user_group_role, ensure_user_is_super_admin_global
from core.logger import logger
from .schemas import GetUserRoleResponse, RemoveUsersFromGroup, GroupCreate, GroupReadWithRelations, GroupUpdate
from .exceptions import (
    GroupNotFoundError,
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupUpdateError,
    GroupDeleteError,
    UserNotInGroupError,
    UserNotFoundInGroupError,
    InsufficientPermissionsError,
)

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.projects.service import ProjectService
    from modules.notifications.service import NotificationTriggerService


class GroupService:
    """Сервис для работы с группами"""
    
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._project_service = None
        self._notification_trigger = None
    
    @property
    def project_service(self) -> Optional['ProjectService']:
        """Ленивая загрузка ProjectService через фабрику"""
        if self._project_service is None and self.service_factory:
            from modules.projects.service import ProjectService
            self._project_service = self.service_factory.get_or_create('project', ProjectService)
        return self._project_service
    
    @property
    def notification_trigger(self) -> Optional['NotificationTriggerService']:
        """Ленивая загрузка NotificationTriggerService через фабрику"""
        if self._notification_trigger is None and self.service_factory:
            self._notification_trigger = self.service_factory.get('notification_trigger')
        return self._notification_trigger
    
    async def get_all_groups(self, current_user_id: int) -> List[Group]:
        """Получение всех групп (только для супер-админа)"""
        self.logger.info(f"Fetching all groups by super-admin {current_user_id}")
        await ensure_user_is_super_admin_global(self.session, current_user_id)
        stmt = select(Group).order_by(Group.id)
        result = await self.session.scalars(stmt)
        groups = result.all()
        self.logger.debug(f"Found {len(groups)} groups")
        return groups
    
    async def get_group_by_id(self, group_id: int) -> GroupReadWithRelations:
        """Получение группы по ID"""
        self.logger.debug(f"Fetching group by ID: {group_id}")
        stmt = select(Group).options(
            selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).where(Group.id == group_id)

        result = await self.session.execute(stmt)
        group = result.scalar_one_or_none()
        
        if not group:
            self.logger.warning(f"Group with ID {group_id} not found")
            raise GroupNotFoundError(group_id=group_id)
        
        # Добавляем пользователей с ролями
        group.users = []
        for group_member in group.group_members:
            user_with_role = group_member.user
            user_with_role.role = group_member.role.value
            group.users.append(user_with_role)
        
        self.logger.debug(f"Group found: {group.name}")
        return group
    
    async def get_user_groups(self, user_id: int) -> List[GroupReadWithRelations]:
        """Получение групп пользователя"""
        self.logger.debug(f"Fetching groups for user {user_id}")
        stmt = select(Group).options(
            selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Group.projects),
            selectinload(Group.tasks)
        ).join(Group.group_members).where(GroupMember.user_id == user_id).order_by(Group.id)
        
        result = await self.session.execute(stmt)
        groups = result.scalars().all()
        
        for group in groups:
            group.users = []
            for group_member in group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                group.users.append(user_with_role)
        
        self.logger.debug(f"Found {len(groups)} groups for user {user_id}")
        return groups
    
    async def get_role_for_user_in_group(self, user_id: int, group_id: int) -> GetUserRoleResponse:
        """Получение роли пользователя в группе"""
        self.logger.debug(f"Getting role for user {user_id} in group {group_id}")
        role = await get_user_group_role(self.session, user_id, group_id)
        if role is None:
            self.logger.warning(f"User {user_id} not in group {group_id}")
            raise UserNotInGroupError(user_id=user_id, group_id=group_id)
        
        return GetUserRoleResponse(role=role)
    
    async def create_group(self, group_create: GroupCreate, current_user: User) -> GroupReadWithRelations:
        """Создание новой группы"""
        self.logger.info(f"Creating new group '{group_create.name}' by user {current_user.id}")
        
        try:
            # Проверяем существование группы с таким именем
            existing_group_stmt = select(Group).where(Group.name == group_create.name)
            existing_group_result = await self.session.execute(existing_group_stmt)
            existing_group = existing_group_result.scalar_one_or_none()
            
            if existing_group:
                self.logger.warning(f"Group with name '{group_create.name}' already exists")
                raise GroupAlreadyExistsError(group_create.name)

            new_group = Group(**group_create.model_dump())
            self.session.add(new_group)
            
            await self.session.flush()
            
            # Добавляем создателя как администратора
            group_member = GroupMember(
                user_id=current_user.id,
                group_id=new_group.id,
                role=UserRole.ADMIN
            )
            self.session.add(group_member)

            await self.session.commit()
            self.logger.info(f"Group created successfully with ID: {new_group.id}")
            
            return await self.get_group_by_id(new_group.id)

        except GroupAlreadyExistsError:
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating group: {e}", exc_info=True)
            raise GroupCreationError(f"Не удалось создать группу: {str(e)}")
    
    async def change_user_role(self, current_user_id: int, group_id: int, user_email: str, new_role: UserRole):
        """Изменение роли пользователя в группе"""
        self.logger.info(f"Changing role for user {user_email} in group {group_id} to {new_role.value}")
        
        try:
            await ensure_user_is_admin(self.session, current_user_id, group_id)

            user_stmt = select(User).where(User.email == user_email)
            user_result = await self.session.execute(user_stmt)
            user = user_result.scalar_one_or_none()
            
            if not user:
                self.logger.warning(f"User with email {user_email} not found")
                raise UserNotFoundInGroupError(user_email=user_email)

            group_member_stmt = select(GroupMember).where(
                GroupMember.user_id == user.id,
                GroupMember.group_id == group_id
            )
            group_member_result = await self.session.execute(group_member_stmt)
            group_member = group_member_result.scalar_one_or_none()

            if not group_member:
                self.logger.warning(f"User {user_email} not in group {group_id}")
                raise UserNotFoundInGroupError(user_email=user_email)

            old_role = group_member.role.value
            group_member.role = new_role
            
            # Получаем группу для уведомления
            group_stmt = select(Group).where(Group.id == group_id)
            group_result = await self.session.execute(group_stmt)
            group = group_result.scalar_one()
            
            await self.session.commit()
            
            self.logger.info(f"Role for user {user_email} changed from {old_role} to {new_role.value}")
            
            # Отправляем уведомление
            if self.notification_trigger:
                await self.notification_trigger.on_user_role_changed(
                    group=group,
                    target_user=user,
                    changed_by=await self._get_user_by_id(current_user_id),
                    old_role=old_role,
                    new_role=new_role.value
                )

        except (InsufficientPermissionsError, UserNotFoundInGroupError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error changing role in group {group_id}: {e}", exc_info=True)
            raise GroupUpdateError(f"Не удалось изменить роль пользователя: {str(e)}")
    
    async def update_group(self, db_group: Group, group_update: GroupUpdate, current_user: User) -> GroupReadWithRelations:
        """Обновление информации о группе"""
        self.logger.info(f"Updating group {db_group.id} by user {current_user.id}")
        
        try:
            await ensure_user_is_admin(self.session, current_user.id, db_group.id)
            
            changes = {}

            if group_update.name and group_update.name != db_group.name:
                existing_group_stmt = select(Group).where(
                    Group.name == group_update.name,
                    Group.id != db_group.id
                )
                existing_group_result = await self.session.execute(existing_group_stmt)
                existing_group = existing_group_result.scalar_one_or_none()
                
                if existing_group:
                    self.logger.warning(f"Group with name '{group_update.name}' already exists")
                    raise GroupAlreadyExistsError(group_update.name)
                changes['name'] = {'old': db_group.name, 'new': group_update.name}

            if group_update.description is not None and group_update.description != db_group.description:
                changes['description'] = {'old': db_group.description, 'new': group_update.description}

            for key, value in group_update.model_dump(exclude_unset=True).items():
                setattr(db_group, key, value)

            await self.session.commit()
            self.logger.info(f"Group {db_group.id} updated successfully")
            
            # Отправляем уведомление, если есть изменения
            if changes and self.notification_trigger:
                await self.notification_trigger.on_group_updated(db_group, current_user, changes)
            
            return await self.get_group_by_id(db_group.id)

        except (InsufficientPermissionsError, GroupAlreadyExistsError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating group {db_group.id}: {e}", exc_info=True)
            raise GroupUpdateError(f"Не удалось обновить группу: {str(e)}")
    
    async def remove_users_from_group(self, group_id: int, data: RemoveUsersFromGroup, current_user: User) -> GroupReadWithRelations:
        """Удаление пользователей из группы"""
        self.logger.info(f"Removing users from group {group_id} by user {current_user.id}")
        
        try:
            # Проверяем существование группы
            group_stmt = select(Group).where(Group.id == group_id)
            group_result = await self.session.execute(group_stmt)
            group = group_result.scalar_one_or_none()
            
            if not group:
                self.logger.warning(f"Group {group_id} not found")
                raise GroupNotFoundError(group_id=group_id)

            await ensure_user_is_admin(self.session, current_user.id, group_id)

            # Получаем пользователей для удаления
            users_stmt = select(User).where(User.id.in_(data.user_ids))
            users_result = await self.session.execute(users_stmt)
            users_to_remove = users_result.scalars().all()
            
            if not users_to_remove:
                self.logger.warning(f"No users found to remove from group {group_id}")
                raise UserNotFoundInGroupError()

            # Получаем задачи группы
            tasks_stmt = select(Task).options(selectinload(Task.assignees)).where(Task.group_id == group_id)
            tasks_result = await self.session.execute(tasks_stmt)
            tasks = tasks_result.scalars().all()

            task_ids = [task.id for task in tasks]

            # Удаляем историю задач для удаляемых пользователей
            if task_ids and data.user_ids:
                from core.database.models import TaskHistory
                delete_user_history_stmt = delete(TaskHistory).where(
                    TaskHistory.task_id.in_(task_ids),
                    TaskHistory.user_id.in_(data.user_ids)
                )
                await self.session.execute(delete_user_history_stmt)

            # Удаляем пользователей из задач
            for task in tasks:
                current_assignees = list(task.assignees)
                users_to_remove_from_task = [user for user in current_assignees if user.id in data.user_ids]
                
                for user in users_to_remove_from_task:
                    task.assignees.remove(user)
                
                if not task.assignees:
                    from core.database.models import TaskHistory
                    delete_task_history_stmt = delete(TaskHistory).where(
                        TaskHistory.task_id == task.id
                    )
                    await self.session.execute(delete_task_history_stmt)
                    await self.session.delete(task)

            # Удаляем из группы
            delete_members_stmt = delete(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id.in_(data.user_ids)
            )
            result = await self.session.execute(delete_members_stmt)
            
            if result.rowcount == 0:
                self.logger.warning(f"No users removed from group {group_id}")
                raise UserNotFoundInGroupError()

            # Проверяем, остались ли участники в группе
            remaining_members_stmt = select(GroupMember).where(GroupMember.group_id == group_id)
            remaining_members_result = await self.session.execute(remaining_members_stmt)
            remaining_members = remaining_members_result.scalars().all()
            
            group_deleted = False
            if not remaining_members:
                await self.delete_group_auto(group_id)
                self.logger.info(f"Group {group_id} auto-deleted as it became empty")
                group_deleted = True

            await self.session.commit()
            self.logger.info(f"Users removed from group {group_id} successfully")
            
            # Отправляем уведомления
            if self.notification_trigger and not group_deleted:
                for user in users_to_remove:
                    await self.notification_trigger.on_user_removed_from_group(
                        group=group,
                        removed_user=user,
                        removed_by=current_user
                    )
            
            if group_deleted:
                # Если группа удалена, уведомляем всех бывших участников
                if self.notification_trigger:
                    for user in users_to_remove:
                        await self.notification_trigger.on_group_deleted(group, current_user)
            
            return await self.get_group_by_id(group_id)

        except (GroupNotFoundError, InsufficientPermissionsError, UserNotFoundInGroupError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error removing users from group {group_id}: {e}", exc_info=True)
            raise GroupUpdateError(f"Не удалось удалить пользователей из группы: {str(e)}")
    
    async def delete_group_auto(self, group_id: int) -> bool:
        """Автоматическое удаление группы"""
        self.logger.info(f"Auto-deleting group {group_id}")
        
        try:
            group_stmt = select(Group).options(
                selectinload(Group.tasks),
                selectinload(Group.projects),
                selectinload(Group.group_members).selectinload(GroupMember.user)
            ).where(Group.id == group_id)
            
            group_result = await self.session.execute(group_stmt)
            group = group_result.scalar_one_or_none()
            
            if not group:
                self.logger.debug(f"Group {group_id} not found for auto-deletion")
                return True

            task_ids = [task.id for task in group.tasks]
            if task_ids:
                from core.database.models import TaskHistory
                delete_history_stmt = delete(TaskHistory).where(
                    TaskHistory.task_id.in_(task_ids)
                )
                await self.session.execute(delete_history_stmt)

            if task_ids:
                delete_user_associations_stmt = delete(task_user_association).where(
                    task_user_association.c.task_id.in_(task_ids)
                )
                await self.session.execute(delete_user_associations_stmt)

            for task in group.tasks:
                await self.session.delete(task)

            project_ids = [project.id for project in group.projects]

            # Удаляем связи с проектами
            delete_project_links_stmt = delete(project_group_association).where(
                project_group_association.c.group_id == group_id
            )
            await self.session.execute(delete_project_links_stmt)

            # Удаляем членов группы
            for membership in group.group_members:
                await self.session.delete(membership)

            # Удаляем приглашения
            from core.database.models import GroupInvitation
            delete_invitations_stmt = delete(GroupInvitation).where(
                GroupInvitation.group_id == group_id
            )
            await self.session.execute(delete_invitations_stmt)

            # Удаляем группу
            await self.session.delete(group)

            # Проверяем проекты на пустоту через ProjectService
            if self.project_service:
                for project_id in project_ids:
                    remaining_groups_stmt = select(project_group_association).where(
                        project_group_association.c.project_id == project_id
                    )
                    remaining_groups_result = await self.session.execute(remaining_groups_stmt)
                    remaining_groups = remaining_groups_result.all()
                    
                    if not remaining_groups:
                        await self.project_service.delete_project_auto(project_id)

            await self.session.commit()
            self.logger.info(f"Group {group_id} auto-deleted successfully")
            return True

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error auto-deleting group {group_id}: {e}", exc_info=True)
            raise GroupDeleteError(f"Не удалось автоматически удалить группу: {str(e)}")
    
    async def delete_group(self, group_id: int, current_user: User) -> bool:
        """Удаление группы"""
        self.logger.info(f"Deleting group {group_id} by user {current_user.id}")
        
        try:
            group_stmt = select(Group).options(
                selectinload(Group.group_members).selectinload(GroupMember.user)
            ).where(Group.id == group_id)
            group_result = await self.session.execute(group_stmt)
            group = group_result.scalar_one_or_none()
            
            if not group:
                self.logger.warning(f"Group {group_id} not found for deletion")
                raise GroupNotFoundError(group_id=group_id)

            await ensure_user_is_admin(self.session, current_user.id, group_id)
            
            # Сохраняем участников для уведомлений
            members = [gm.user for gm in group.group_members]

            await self.delete_group_auto(group_id)
            
            # Отправляем уведомления
            if self.notification_trigger:
                for member in members:
                    if member.id != current_user.id:
                        await self.notification_trigger.on_group_deleted(group, current_user)
            
            self.logger.info(f"Group {group_id} deleted successfully")
            return True

        except (GroupNotFoundError, InsufficientPermissionsError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting group {group_id}: {e}", exc_info=True)
            raise GroupDeleteError(f"Не удалось удалить группу: {str(e)}")
    
    async def _get_user_by_id(self, user_id: int) -> Optional[User]:
        """Вспомогательный метод для получения пользователя по ID"""
        stmt = select(User).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()