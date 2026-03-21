from typing import Optional, List, TYPE_CHECKING
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, and_
from sqlalchemy.orm import selectinload

from modules.groups.exceptions import InsufficientPermissionsError
from shared.dependencies import ensure_user_is_admin, check_user_in_group, ensure_user_is_super_admin_global
from core.database.models import Task, Project, User, Group, GroupMember, TaskHistory, TaskStatus, TaskPriority
from core.logger import logger
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead, TaskBulkUpdate
from .exceptions import (
    TaskNotFoundError,
    TaskCreationError,
    TaskUpdateError,
    TaskDeleteError,
    ProjectNotFoundError,
    GroupNotFoundError,
    GroupNotInProjectError,
    UsersNotInGroupError,
    UsersNotInTaskError,
    TaskNoGroupError,
    TaskAccessDeniedError
)

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.groups.service import GroupService


class TaskService:
    """Сервис для работы с задачами"""
    
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._group_service = None
    
    @property
    def group_service(self) -> Optional['GroupService']:
        """Ленивая загрузка GroupService через фабрику"""
        if self._group_service is None and self.service_factory:
            from modules.groups.service import GroupService
            self._group_service = self.service_factory.get_or_create('group', GroupService)
        return self._group_service
    
    async def get_all_tasks(self, current_user_id: int) -> List[TaskRead]:
        """Получение всех задач (только для супер-админа)"""
        self.logger.info(f"Fetching all tasks by super-admin {current_user_id}")
        await ensure_user_is_super_admin_global(self.session, current_user_id)
        stmt = select(Task).order_by(Task.id)
        result = await self.session.scalars(stmt)
        tasks = result.all()
        self.logger.debug(f"Found {len(tasks)} tasks")
        return tasks
    
    async def get_user_tasks(self, user_id: int) -> List[TaskReadWithRelations]:
        """Получение задач пользователя"""
        self.logger.debug(f"Fetching tasks for user {user_id}")
        stmt = (
            select(Task)
            .join(Task.assignees)
            .where(User.id == user_id)
            .options(
                selectinload(Task.project),
                selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
                selectinload(Task.assignees)
            )
            .order_by(Task.created_at.desc())
        )

        result = await self.session.execute(stmt)
        tasks = result.scalars().unique().all()

        for task in tasks:
            if task.group and task.group.group_members:
                task.group.users = []
                for group_member in task.group.group_members:
                    user_with_role = group_member.user
                    user_with_role.role = group_member.role.value
                    task.group.users.append(user_with_role)
        
        self.logger.debug(f"Found {len(tasks)} tasks for user {user_id}")
        return tasks
    
    async def get_team_tasks(self, user_id: int) -> List[TaskReadWithRelations]:
        """Получение задач команд, где пользователь администратор"""
        self.logger.debug(f"Fetching team tasks for user {user_id}")
        
        # Используем GroupService через фабрику
        if not self.group_service:
            self.logger.warning("GroupService not available")
            return []
        
        user_groups = await self.group_service.get_user_groups(user_id)
        
        admin_groups = []
        for group in user_groups:
            for user in group.users:
                if user.id == user_id and user.role in ['admin', 'super_admin']:
                    admin_groups.append(group)
                    break

        if not admin_groups:
            self.logger.debug(f"No admin groups found for user {user_id}")
            return []

        admin_group_ids = [group.id for group in admin_groups]

        stmt = (
            select(Task)
            .where(Task.group_id.in_(admin_group_ids))
            .options(
                selectinload(Task.project),
                selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
                selectinload(Task.assignees)
            )
            .order_by(Task.created_at.desc())
        )

        result = await self.session.execute(stmt)
        tasks = result.scalars().unique().all()

        for task in tasks:
            if task.group and task.group.group_members:
                task.group.users = []
                for group_member in task.group.group_members:
                    user_with_role = group_member.user
                    user_with_role.role = group_member.role.value
                    task.group.users.append(user_with_role)
        
        self.logger.debug(f"Found {len(tasks)} team tasks for user {user_id}")
        return tasks
    
    async def get_task_by_id(self, task_id: int) -> TaskReadWithRelations:
        """Получение задачи по ID"""
        self.logger.debug(f"Fetching task by ID: {task_id}")
        stmt = select(Task).options(
            selectinload(Task.project),
            selectinload(Task.assignees),
            selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user)
        ).where(Task.id == task_id)

        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()

        if not task:
            self.logger.warning(f"Task with ID {task_id} not found")
            raise TaskNotFoundError(task_id)

        if task.group and task.group.group_members:
            task.group.users = []
            for group_member in task.group.group_members:
                user_with_role = group_member.user
                user_with_role.role = group_member.role.value
                task.group.users.append(user_with_role)
        
        return task
    
    async def create_task(self, task_data: TaskCreate, current_user: User) -> TaskReadWithRelations:
        """Создание новой задачи"""
        self.logger.info(f"Creating new task '{task_data.title}' by user {current_user.id}")
        
        try:
            # Проверяем проект
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == task_data.project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {task_data.project_id} not found")
                raise ProjectNotFoundError(task_data.project_id)

            # Проверяем группу
            stmt_group = select(Group).where(Group.id == task_data.group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {task_data.group_id} not found")
                raise GroupNotFoundError(task_data.group_id)

            # Проверяем, что группа привязана к проекту
            if group not in project.groups:
                self.logger.warning(f"Group {task_data.group_id} not in project {task_data.project_id}")
                raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

            # Проверяем, что пользователь состоит в группе
            if not await check_user_in_group(self.session, current_user.id, task_data.group_id):
                self.logger.warning(f"User {current_user.id} not in group {task_data.group_id}")
                raise TaskAccessDeniedError("Вы не состоите в указанной группе")

            new_task = Task(
                title=task_data.title,
                description=task_data.description,
                status=task_data.status,
                priority=task_data.priority,
                start_date=task_data.start_date,
                deadline=task_data.deadline,
                project_id=task_data.project_id,
                group_id=task_data.group_id,
                tags=task_data.tags
            )
            
            new_task.assignees.append(current_user)

            self.session.add(new_task)
            await self.session.commit()
            
            self.logger.info(f"Task created successfully with ID: {new_task.id}")
            return await self.get_task_by_id(new_task.id)

        except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating task: {e}", exc_info=True)
            raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")
    
    async def create_task_for_users(self, task_data: TaskCreate, assignee_ids: List[int], current_user: User) -> TaskReadWithRelations:
        """Создание задачи для указанных пользователей"""
        self.logger.info(f"Creating task for users {assignee_ids} by user {current_user.id}")
        
        try:
            # Проверяем проект
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == task_data.project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {task_data.project_id} not found")
                raise ProjectNotFoundError(task_data.project_id)

            # Проверяем группу
            stmt_group = select(Group).where(Group.id == task_data.group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {task_data.group_id} not found")
                raise GroupNotFoundError(task_data.group_id)

            # Проверяем, что группа привязана к проекту
            if group not in project.groups:
                self.logger.warning(f"Group {task_data.group_id} not in project {task_data.project_id}")
                raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

            # Проверяем права
            is_admin = False
            try:
                await ensure_user_is_admin(self.session, current_user.id, task_data.group_id)
                is_admin = True
            except InsufficientPermissionsError:
                if len(assignee_ids) > 1 or (assignee_ids and assignee_ids[0] != current_user.id):
                    self.logger.warning(f"User {current_user.id} not admin, can't create task for others")
                    raise TaskAccessDeniedError("Только администраторы могут создавать задачи для других пользователей")

            # Проверяем, что все указанные пользователи состоят в группе
            if assignee_ids:
                valid_users_query = (
                    select(User.id)
                    .join(GroupMember)
                    .where(GroupMember.group_id == task_data.group_id)
                    .where(User.id.in_(assignee_ids))
                )
                result_valid_users = await self.session.execute(valid_users_query)
                valid_user_ids = {u[0] for u in result_valid_users}

                if len(valid_user_ids) != len(assignee_ids):
                    invalid_ids = set(assignee_ids) - valid_user_ids
                    self.logger.warning(f"Users not in group: {invalid_ids}")
                    raise UsersNotInGroupError(list(invalid_ids))

            new_task = Task(
                title=task_data.title,
                description=task_data.description,
                status=task_data.status,
                priority=task_data.priority,
                start_date=task_data.start_date,
                deadline=task_data.deadline,
                project_id=task_data.project_id,
                group_id=task_data.group_id,
                tags=task_data.tags
            )

            if assignee_ids:
                users_stmt = select(User).where(User.id.in_(assignee_ids))
                users_result = await self.session.execute(users_stmt)
                users = users_result.scalars().all()
                
                for user in users:
                    new_task.assignees.append(user)
            else:
                new_task.assignees.append(current_user)

            self.session.add(new_task)
            await self.session.commit()
            
            self.logger.info(f"Task for users created successfully with ID: {new_task.id}")
            return await self.get_task_by_id(new_task.id)

        except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
                TaskAccessDeniedError, UsersNotInGroupError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating task for users: {e}", exc_info=True)
            raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")
    
    async def add_users_to_task(self, task_id: int, data: AddRemoveUsersToTask, current_user: User) -> TaskReadWithRelations:
        """Добавление пользователей в задачу"""
        self.logger.info(f"Adding users to task {task_id} by user {current_user.id}")
        
        try:
            task = await self.get_task_by_id(task_id)

            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            # Проверяем, что все пользователи состоят в группе
            valid_users_query = (
                select(User.id)
                .join(GroupMember)
                .where(GroupMember.group_id == task.group_id)
                .where(User.id.in_(data.user_ids))
            )
            result_valid_users = await self.session.execute(valid_users_query)
            valid_user_ids = {u[0] for u in result_valid_users}

            if len(valid_user_ids) != len(data.user_ids):
                invalid_ids = set(data.user_ids) - valid_user_ids
                self.logger.warning(f"Users not in group: {invalid_ids}")
                raise UsersNotInGroupError(list(invalid_ids))

            users_stmt = select(User).where(User.id.in_(data.user_ids))
            users_result = await self.session.execute(users_stmt)
            users = users_result.scalars().all()

            for user in users:
                if user not in task.assignees:
                    task.assignees.append(user)

            await self.session.commit()
            self.logger.info(f"Users added to task {task_id} successfully")
            
            return await self.get_task_by_id(task_id)

        except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error adding users to task {task_id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось добавить пользователей в задачу: {str(e)}")
    
    async def update_task(self, db_task: Task, task_update: TaskUpdate, current_user: User) -> TaskRead:
        """Обновление задачи"""
        self.logger.info(f"Updating task {db_task.id} by user {current_user.id}")
        
        try:
            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in db_task.assignees)
            
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, db_task.group_id)

            for key, value in task_update.model_dump(exclude_unset=True).items():
                setattr(db_task, key, value)

            await self.session.commit()
            await self.session.refresh(db_task)
            
            self.logger.info(f"Task {db_task.id} updated successfully")
            return db_task

        except (TaskAccessDeniedError, TaskNotFoundError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task {db_task.id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить задачу: {str(e)}")
    
    async def remove_users_from_task(self, task_id: int, data: AddRemoveUsersToTask, current_user: User) -> dict:
        """Удаление пользователей из задачи"""
        self.logger.info(f"Removing users from task {task_id} by user {current_user.id}")
        
        try:
            task = await self.get_task_by_id(task_id)

            if not task.group:
                self.logger.warning(f"Task {task_id} has no group")
                raise TaskNoGroupError()

            # Только администраторы могут удалять пользователей из задачи
            await ensure_user_is_admin(self.session, current_user.id, task.group.id)

            users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
            if not users_to_remove:
                self.logger.warning(f"Users {data.user_ids} not in task {task_id}")
                raise UsersNotInTaskError(data.user_ids)

            for user in users_to_remove:
                task.assignees.remove(user)

            # Если не осталось исполнителей, удаляем задачу
            if not task.assignees:
                delete_history_stmt = delete(TaskHistory).where(TaskHistory.task_id == task_id)
                await self.session.execute(delete_history_stmt)
                
                await self.session.delete(task)
                await self.session.commit()
                self.logger.info(f"Task {task_id} deleted as it has no assignees")
                return {"detail": "Задача удалена, так как не осталось исполнителей"}

            await self.session.commit()
            self.logger.info(f"Users removed from task {task_id} successfully")
            
            return {"detail": "Пользователи успешно удалены из задачи"}

        except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error removing users from task {task_id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось удалить пользователей из задачи: {str(e)}")
    
    async def delete_task(self, task_id: int, current_user: User) -> bool:
        """Удаление задачи"""
        self.logger.info(f"Deleting task {task_id} by user {current_user.id}")
        
        try:
            db_task = await self.get_task_by_id(task_id)

            if not db_task.group_id:
                self.logger.warning(f"Task {task_id} has no group")
                raise TaskNoGroupError()

            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in db_task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, db_task.group_id)

            # Удаляем историю задачи
            stmt_history = select(TaskHistory).where(TaskHistory.task_id == task_id)
            result_history = await self.session.execute(stmt_history)
            history_entries = result_history.scalars().all()
            
            for history_entry in history_entries:
                await self.session.delete(history_entry)

            await self.session.delete(db_task)
            await self.session.commit()
            
            self.logger.info(f"Task {task_id} deleted successfully")
            return True

        except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting task {task_id}: {e}", exc_info=True)
            raise TaskDeleteError(f"Не удалось удалить задачу: {str(e)}")
    
    async def get_project_board_tasks(self, project_id: int, group_id: int, view_mode: str, current_user: User) -> List[TaskReadWithRelations]:
        """Получение задач для Kanban доски проекта"""
        self.logger.info(f"Fetching board tasks for project {project_id}, group {group_id}, mode {view_mode}")
        
        try:
            # Проверяем проект
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {project_id} not found")
                raise ProjectNotFoundError(project_id)

            # Проверяем группу
            stmt_group = select(Group).where(Group.id == group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {group_id} not found")
                raise GroupNotFoundError(group_id)

            # Проверяем, что группа привязана к проекту
            if group not in project.groups:
                self.logger.warning(f"Group {group_id} not in project {project_id}")
                raise GroupNotInProjectError(group_id, project_id)

            # Проверяем, что пользователь состоит в группе
            if not await check_user_in_group(self.session, current_user.id, group_id):
                self.logger.warning(f"User {current_user.id} not in group {group_id}")
                raise TaskAccessDeniedError("Вы не состоите в указанной группе")

            # Формируем запрос для задач
            stmt = (
                select(Task)
                .where(
                    and_(
                        Task.project_id == project_id,
                        Task.group_id == group_id
                    )
                )
                .options(
                    selectinload(Task.project),
                    selectinload(Task.group).selectinload(Group.group_members).selectinload(GroupMember.user),
                    selectinload(Task.assignees)
                )
            )

            if view_mode == "personal":
                stmt = stmt.join(Task.assignees).where(User.id == current_user.id)

            stmt = stmt.order_by(Task.status, Task.position, Task.created_at)

            result = await self.session.execute(stmt)
            tasks = result.scalars().unique().all()

            for task in tasks:
                if task.group and task.group.group_members:
                    task.group.users = []
                    for group_member in task.group.group_members:
                        user_with_role = group_member.user
                        user_with_role.role = group_member.role.value
                        task.group.users.append(user_with_role)

            self.logger.info(f"Found {len(tasks)} tasks for board")
            return tasks

        except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError):
            raise
        except Exception as e:
            self.logger.error(f"Error fetching board tasks: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось загрузить доску проекта: {str(e)}")
    
    async def update_task_status(self, task_id: int, new_status: TaskStatus, current_user: User) -> TaskRead:
        """Обновление статуса задачи"""
        self.logger.info(f"Updating status of task {task_id} to {new_status.value}")
        
        try:
            task = await self.get_task_by_id(task_id)

            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            old_status = task.status
            task.status = new_status

            # Создаем запись в истории
            history_entry = TaskHistory(
                task_id=task_id,
                user_id=current_user.id,
                action="status_change",
                old_value=old_status.value,
                new_value=new_status.value
            )
            self.session.add(history_entry)

            await self.session.commit()
            await self.session.refresh(task)
            
            self.logger.info(f"Task {task_id} status updated from {old_status.value} to {new_status.value}")
            return task

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task status: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить статус задачи: {str(e)}")
    
    async def update_task_position(self, task_id: int, new_position: int, current_user: User) -> TaskRead:
        """Обновление позиции задачи"""
        self.logger.info(f"Updating position of task {task_id} to {new_position}")
        
        try:
            task = await self.get_task_by_id(task_id)

            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            task.position = new_position

            await self.session.commit()
            await self.session.refresh(task)
            
            self.logger.info(f"Task {task_id} position updated to {new_position}")
            return task

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task position: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить позицию задачи: {str(e)}")
    
    async def update_task_priority(self, task_id: int, new_priority: TaskPriority, current_user: User) -> TaskRead:
        """Обновление приоритета задачи"""
        self.logger.info(f"Updating priority of task {task_id} to {new_priority.value}")
        
        try:
            task = await self.get_task_by_id(task_id)

            # Проверяем права (админ или исполнитель)
            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            old_priority = task.priority
            task.priority = new_priority

            # Создаем запись в истории
            history_entry = TaskHistory(
                task_id=task_id,
                user_id=current_user.id,
                action="priority_change",
                old_value=old_priority.value,
                new_value=new_priority.value
            )
            self.session.add(history_entry)

            await self.session.commit()
            await self.session.refresh(task)
            
            self.logger.info(f"Task {task_id} priority updated from {old_priority.value} to {new_priority.value}")
            return task

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task priority: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить приоритет задачи: {str(e)}")
    
    async def bulk_update_tasks(self, updates: List[TaskBulkUpdate], current_user: User) -> List[TaskRead]:
        """Массовое обновление задач (для drag & drop)"""
        self.logger.info(f"Bulk updating {len(updates)} tasks")
        
        try:
            updated_tasks = []
            
            for update in updates:
                task = await self.get_task_by_id(update.task_id)

                # Проверяем права (админ или исполнитель)
                is_assignee = any(u.id == current_user.id for u in task.assignees)
                if not is_assignee:
                    await ensure_user_is_admin(self.session, current_user.id, task.group_id)

                if update.status is not None:
                    old_status = task.status
                    task.status = update.status
                    
                    history_entry = TaskHistory(
                        task_id=task.id,
                        user_id=current_user.id,
                        action="status_change",
                        old_value=old_status.value,
                        new_value=update.status.value
                    )
                    self.session.add(history_entry)

                if update.position is not None:
                    task.position = update.position

                if update.priority is not None:
                    old_priority = task.priority
                    task.priority = update.priority
                    
                    history_entry = TaskHistory(
                        task_id=task.id,
                        user_id=current_user.id,
                        action="priority_change",
                        old_value=old_priority.value,
                        new_value=update.priority.value
                    )
                    self.session.add(history_entry)

                updated_tasks.append(task)

            await self.session.commit()
            
            for task in updated_tasks:
                await self.session.refresh(task)
            
            self.logger.info(f"Bulk update completed for {len(updated_tasks)} tasks")
            return updated_tasks

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error in bulk update: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось выполнить массовое обновление: {str(e)}")
    
    async def quick_create_task(self, task_data: TaskCreate, current_user: User) -> TaskReadWithRelations:
        """Быстрое создание задачи"""
        self.logger.info(f"Quick creating task '{task_data.title}' by user {current_user.id}")
        
        try:
            return await self.create_task_for_users(
                task_data,          
                [current_user.id],  
                current_user    
            )
            
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error in quick create task: {e}", exc_info=True)
            raise TaskCreationError(f"Не удалось быстро создать задачу: {str(e)}")
    
    async def get_task_history(self, task_id: int) -> List[TaskHistory]:
        """Получение истории изменений задачи"""
        self.logger.debug(f"Fetching history for task {task_id}")
        stmt = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.user))
            .where(TaskHistory.task_id == task_id)
            .order_by(TaskHistory.created_at.desc())
        )
        
        result = await self.session.execute(stmt)
        history = result.scalars().all()
        self.logger.debug(f"Found {len(history)} history entries for task {task_id}")
        return history