from typing import Optional, List, TYPE_CHECKING, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from shared.dependencies import ensure_user_is_admin, ensure_user_is_super_admin_global
from core.database.models import Project, Group, User, GroupMember, Task, project_group_association, task_user_association
from core.logger import logger
from .schemas import (
    AddGroupsToProject,
    ProjectCreate,
    ProjectReadWithRelations,
    ProjectUpdate,
    ProjectRead,
    RemoveGroupsFromProject,
)
from .exceptions import (
    ProjectNotFoundError,
    ProjectCreationError,
    ProjectUpdateError,
    ProjectDeleteError,
    GroupsNotFoundError,
    GroupsNotInProjectError,
    InsufficientProjectPermissionsError,
)

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.groups.service import GroupService
    from modules.notifications.service import NotificationTriggerService


class ProjectService:
    """Сервис для работы с проектами"""
    
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._group_service = None
        self._notification_trigger = None
    
    @property
    def group_service(self) -> Optional['GroupService']:
        """Ленивая загрузка GroupService через фабрику"""
        if self._group_service is None and self.service_factory:
            from modules.groups.service import GroupService
            self._group_service = self.service_factory.get_or_create('group', GroupService)
        return self._group_service
    
    @property
    def notification_trigger(self) -> Optional['NotificationTriggerService']:
        """Ленивая загрузка NotificationTriggerService через фабрику"""
        if self._notification_trigger is None and self.service_factory:
            self._notification_trigger = self.service_factory.get('notification_trigger')
        return self._notification_trigger
    
    async def get_all_projects(self, current_user_id: int) -> List[ProjectRead]:
        """Получение всех проектов (только для супер-админа)"""
        self.logger.info(f"Fetching all projects by super-admin {current_user_id}")
        await ensure_user_is_super_admin_global(self.session, current_user_id)
        stmt = select(Project).order_by(Project.id)
        result = await self.session.scalars(stmt)
        projects = result.all()
        self.logger.debug(f"Found {len(projects)} projects")
        return projects
    
    async def get_user_projects(self, user_id: int) -> List[ProjectReadWithRelations]:
        """Получение проектов пользователя"""
        self.logger.debug(f"Fetching projects for user {user_id}")
        stmt = (
            select(Project)
            .join(Project.groups)
            .join(Group.group_members)
            .where(GroupMember.user_id == user_id)
            .options(
                selectinload(Project.groups)
                .selectinload(Group.group_members)
                .selectinload(GroupMember.user),
                selectinload(Project.tasks)
            )
            .order_by(Project.id)
        )

        result = await self.session.execute(stmt)
        projects = result.scalars().unique().all()

        projects_with_relations = []
        for project in projects:
            project_data = {
                "id": project.id,
                "title": project.title,
                "description": project.description,
                "start_date": project.start_date,
                "end_date": project.end_date,
                "status": project.status,
                "groups": [],
                "tasks": [],
            }

            for group in project.groups:
                group_data = {
                    "id": group.id,
                    "name": group.name,
                    "description": group.description,
                    "created_at": group.created_at,
                    "users": [],
                }

                for gm in group.group_members:
                    user_data = {
                        "id": gm.user.id,
                        "login": gm.user.login,
                        "email": gm.user.email,
                        "name": gm.user.name,
                        "created_at": gm.user.created_at,
                        "role": gm.role.value,
                    }
                    group_data["users"].append(user_data)

                project_data["groups"].append(group_data)

            for task in project.tasks:
                task_data = {
                    "id": task.id,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "position": task.position,
                    "start_date": task.start_date,
                    "deadline": task.deadline,
                    "project_id": task.project_id,
                    "tags": task.tags if task.tags else [],
                }
                project_data["tasks"].append(task_data)

            projects_with_relations.append(ProjectReadWithRelations(**project_data))

        self.logger.debug(f"Found {len(projects_with_relations)} projects for user {user_id}")
        return projects_with_relations
    
    async def get_project_by_id(self, project_id: int) -> ProjectReadWithRelations:
        """Получение проекта по ID"""
        self.logger.debug(f"Fetching project by ID: {project_id}")
        stmt = (
            select(Project)
            .options(
                selectinload(Project.groups)
                .selectinload(Group.group_members)
                .selectinload(GroupMember.user),
                selectinload(Project.tasks),
            )
            .where(Project.id == project_id)
        )
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()

        if not project:
            self.logger.warning(f"Project with ID {project_id} not found")
            raise ProjectNotFoundError(project_id)

        groups_data = []
        for group in project.groups:
            users_data = [
                {
                    "id": gm.user.id,
                    "login": gm.user.login,
                    "email": gm.user.email,
                    "name": gm.user.name,
                    "created_at": gm.user.created_at,
                    "role": gm.role.value,
                }
                for gm in group.group_members
            ]

            groups_data.append(
                {
                    "id": group.id,
                    "name": group.name,
                    "description": group.description,
                    "created_at": group.created_at,
                    "users": users_data,
                }
            )

        tasks_data = [
            {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "position": task.position,
                "start_date": task.start_date,
                "deadline": task.deadline,
                "project_id": task.project_id,
                "tags": task.tags if task.tags else [],
            }
            for task in project.tasks
        ]

        project_data = {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "status": project.status,
            "groups": groups_data,
            "tasks": tasks_data,
        }

        return ProjectReadWithRelations(**project_data)
    
    async def create_project(self, project_data: ProjectCreate, current_user: User) -> ProjectReadWithRelations:
        """Создание нового проекта"""
        self.logger.info(f"Creating new project '{project_data.title}' by user {current_user.id}")
        
        try:
            # Проверяем существование групп
            groups_stmt = select(Group).where(Group.id.in_(project_data.group_ids))
            result_groups = await self.session.execute(groups_stmt)
            groups = result_groups.scalars().all()

            if len(groups) != len(project_data.group_ids):
                found_ids = {g.id for g in groups}
                missing_ids = set(project_data.group_ids) - found_ids
                self.logger.warning(f"Groups not found: {missing_ids}")
                raise GroupsNotFoundError(list(missing_ids))

            # Проверяем права на управление группами
            for group in groups:
                await ensure_user_is_admin(self.session, current_user.id, group.id)

            new_project = Project(**project_data.model_dump(exclude={"group_ids"}))
            new_project.groups.extend(groups)
            self.session.add(new_project)
            await self.session.commit()
            
            self.logger.info(f"Project created successfully with ID: {new_project.id}")
            
            # Отправляем уведомления участникам всех групп
            if self.notification_trigger:
                await self.notification_trigger.on_project_created(
                    project=new_project,
                    created_by=current_user,
                    group_ids=project_data.group_ids
                )
            
            return await self.get_project_by_id(new_project.id)

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating project: {e}", exc_info=True)
            raise ProjectCreationError(f"Не удалось создать проект: {str(e)}")
    
    async def update_project(self, db_project: Project, project_update: ProjectUpdate, current_user: User) -> ProjectReadWithRelations:
        """Обновление проекта"""
        self.logger.info(f"Updating project {db_project.id} by user {current_user.id}")
        
        try:
            # Проверяем права на все группы проекта
            for group in db_project.groups:
                await ensure_user_is_admin(self.session, current_user.id, group.id)
            
            changes = {}
            
            if project_update.title and project_update.title != db_project.title:
                changes['title'] = {'old': db_project.title, 'new': project_update.title}
            
            if project_update.description is not None and project_update.description != db_project.description:
                changes['description'] = {'old': db_project.description, 'new': project_update.description}
            
            if project_update.status and project_update.status != db_project.status:
                changes['status'] = {'old': db_project.status, 'new': project_update.status}
            
            if project_update.start_date and project_update.start_date != db_project.start_date:
                changes['start_date'] = {'old': db_project.start_date.isoformat() if db_project.start_date else None, 
                                          'new': project_update.start_date.isoformat()}
            
            if project_update.end_date and project_update.end_date != db_project.end_date:
                changes['end_date'] = {'old': db_project.end_date.isoformat() if db_project.end_date else None,
                                        'new': project_update.end_date.isoformat()}

            for key, value in project_update.model_dump(exclude_unset=True).items():
                setattr(db_project, key, value)

            await self.session.commit()
            await self.session.refresh(db_project)
            
            self.logger.info(f"Project {db_project.id} updated successfully")
            
            # Отправляем уведомление, если есть изменения
            if changes and self.notification_trigger:
                await self.notification_trigger.on_project_updated(db_project, current_user, changes)
            
            return await self.get_project_by_id(db_project.id)

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating project {db_project.id}: {e}", exc_info=True)
            raise ProjectUpdateError(f"Не удалось обновить проект: {str(e)}")
    
    async def add_groups_to_project(self, project_id: int, data: AddGroupsToProject, current_user: User) -> ProjectReadWithRelations:
        """Добавление групп в проект"""
        self.logger.info(f"Adding groups to project {project_id} by user {current_user.id}")
        
        try:
            stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
            result = await self.session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {project_id} not found")
                raise ProjectNotFoundError(project_id)

            # Проверяем существование групп
            groups_stmt = select(Group).where(Group.id.in_(data.group_ids))
            result_groups = await self.session.execute(groups_stmt)
            groups = result_groups.scalars().all()

            if len(groups) != len(data.group_ids):
                found_ids = {g.id for g in groups}
                missing_ids = set(data.group_ids) - found_ids
                self.logger.warning(f"Groups not found: {missing_ids}")
                raise GroupsNotFoundError(list(missing_ids))

            added_groups = []
            
            # Проверяем права на добавляемые группы
            for group in groups:
                await ensure_user_is_admin(self.session, current_user.id, group.id)
                if group not in project.groups:
                    project.groups.append(group)
                    added_groups.append(group)

            await self.session.commit()
            self.logger.info(f"Groups added to project {project_id} successfully")
            
            # Отправляем уведомления
            if self.notification_trigger:
                for group in added_groups:
                    await self.notification_trigger.on_group_added_to_project(
                        project=project,
                        group=group,
                        added_by=current_user
                    )
            
            return await self.get_project_by_id(project_id)

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error adding groups to project {project_id}: {e}", exc_info=True)
            raise ProjectUpdateError(f"Не удалось добавить группы в проект: {str(e)}")
    
    async def remove_groups_from_project(self, project_id: int, data: RemoveGroupsFromProject, current_user: User) -> ProjectReadWithRelations:
        """Удаление групп из проекта"""
        self.logger.info(f"Removing groups from project {project_id} by user {current_user.id}")
        
        try:
            stmt = select(Project).options(
                selectinload(Project.groups),
                selectinload(Project.tasks),
            ).where(Project.id == project_id)

            result = await self.session.execute(stmt)
            project = result.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {project_id} not found")
                raise ProjectNotFoundError(project_id)

            groups_to_remove = [g for g in project.groups if g.id in data.group_ids]
            if not groups_to_remove:
                self.logger.warning(f"Groups {data.group_ids} not in project {project_id}")
                raise GroupsNotInProjectError(data.group_ids)

            removed_groups = []
            
            # Проверяем права на удаляемые группы
            for group in groups_to_remove:
                await ensure_user_is_admin(self.session, current_user.id, group.id)
                project.groups.remove(group)
                removed_groups.append(group)

            await self.session.commit()
            self.logger.info(f"Groups removed from project {project_id} successfully")
            
            # Отправляем уведомления
            if self.notification_trigger:
                for group in removed_groups:
                    await self.notification_trigger.on_group_removed_from_project(
                        project=project,
                        group=group,
                        removed_by=current_user
                    )
            
            return await self.get_project_by_id(project_id)

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error removing groups from project {project_id}: {e}", exc_info=True)
            raise ProjectUpdateError(f"Не удалось удалить группы из проекта: {str(e)}")
    
    async def delete_project_auto(self, project_id: int) -> bool:
        """Автоматическое удаление проекта"""
        self.logger.info(f"Auto-deleting project {project_id}")
        
        try:
            project_stmt = select(Project).where(Project.id == project_id)
            project_result = await self.session.execute(project_stmt)
            db_project = project_result.scalar_one_or_none()
            
            if not db_project:
                self.logger.debug(f"Project {project_id} not found for auto-deletion")
                return True

            # Получаем ID задач
            tasks_stmt = select(Task.id).where(Task.project_id == project_id)
            tasks_result = await self.session.execute(tasks_stmt)
            task_ids = [row[0] for row in tasks_result]

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

            # Удаляем задачи
            delete_tasks_stmt = delete(Task).where(Task.project_id == project_id)
            await self.session.execute(delete_tasks_stmt)

            # Удаляем связи с группами
            delete_project_links_stmt = delete(project_group_association).where(
                project_group_association.c.project_id == project_id
            )
            await self.session.execute(delete_project_links_stmt)

            # Удаляем проект
            delete_project_stmt = delete(Project).where(Project.id == project_id)
            await self.session.execute(delete_project_stmt)

            await self.session.commit()
            self.logger.info(f"Project {project_id} auto-deleted successfully")
            return True

        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error auto-deleting project {project_id}: {e}", exc_info=True)
            raise ProjectDeleteError(f"Не удалось автоматически удалить проект: {str(e)}")
    
    async def delete_project(self, project_id: int, current_user: User) -> bool:
        """Удаление проекта"""
        self.logger.info(f"Deleting project {project_id} by user {current_user.id}")
        
        try:
            project_stmt = select(Project).options(
                selectinload(Project.groups),
                selectinload(Project.tasks)
            ).where(Project.id == project_id)
            project_result = await self.session.execute(project_stmt)
            db_project = project_result.scalar_one_or_none()
            
            if not db_project:
                self.logger.warning(f"Project {project_id} not found for deletion")
                raise ProjectNotFoundError(project_id)

            # Получаем группы проекта
            project_groups = list(db_project.groups)
            
            # Проверяем права на все группы проекта
            for group in project_groups:
                await ensure_user_is_admin(self.session, current_user.id, group.id)

            # Удаляем проект со всеми связанными данными
            await self.delete_project_auto(project_id)
            
            # Отправляем уведомления
            if self.notification_trigger:
                await self.notification_trigger.on_project_deleted(db_project, current_user)
            
            self.logger.info(f"Project {project_id} deleted successfully")
            return True

        except (ProjectNotFoundError, InsufficientProjectPermissionsError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting project {project_id}: {e}", exc_info=True)
            raise ProjectDeleteError(f"Не удалось удалить проект: {str(e)}")