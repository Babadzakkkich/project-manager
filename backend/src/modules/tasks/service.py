from typing import Optional, List, TYPE_CHECKING, Dict, Any
import json
import re
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, and_
from sqlalchemy.orm import selectinload

from modules.groups.exceptions import InsufficientPermissionsError
from shared.dependencies import (
    ensure_user_is_admin,
    check_user_in_group,
    ensure_global_admin_by_id,
    is_global_admin_user,
)
from core.database.models import (
    Task, Project, User, Group, GroupMember, TaskHistory, TaskComment,
    TaskStatus, TaskPriority, task_comment_reads
)
from core.logger import logger
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskReadWithRelations, TaskUpdate, TaskRead, TaskBulkUpdate, TaskCommentCreate, TaskCommentUpdate
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
    TaskAccessDeniedError,
    TaskCommentNotFoundError
)

if TYPE_CHECKING:
    from core.services import ServiceFactory
    from modules.groups.service import GroupService
    from modules.notifications.service import NotificationTriggerService


class TaskService:
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.logger = logger
        self.service_factory = service_factory
        self._group_service = None
        self._notification_trigger = None
    
    @property
    def group_service(self) -> Optional['GroupService']:
        if self._group_service is None and self.service_factory:
            from modules.groups.service import GroupService
            self._group_service = self.service_factory.get_or_create('group', GroupService)
        return self._group_service
    
    @property
    def notification_trigger(self) -> Optional['NotificationTriggerService']:
        if self._notification_trigger is None and self.service_factory:
            self._notification_trigger = self.service_factory.get('notification_trigger')
        return self._notification_trigger
    
    def _ensure_allowed_create_status(self, status: TaskStatus) -> None:
        if status == TaskStatus.DONE:
            raise TaskCreationError('При создании задачи нельзя сразу выбрать статус «Выполнена»')

    async def _ensure_task_view_access(self, task_id: int, current_user: User) -> Task:
        task = await self.get_task_by_id(task_id)

        if is_global_admin_user(current_user):
            return task

        if not task.group_id or not await check_user_in_group(self.session, current_user.id, task.group_id):
            raise TaskAccessDeniedError("Нет доступа к задаче")

        return task

    async def _ensure_comment_manage_access(self, comment: TaskComment, current_user: User) -> Task:
        task = await self._ensure_task_view_access(comment.task_id, current_user)

        if comment.author_id == current_user.id:
            return task

        if is_global_admin_user(current_user):
            return task

        try:
            await ensure_user_is_admin(self.session, current_user.id, task.group_id)
            return task
        except InsufficientPermissionsError:
            raise TaskAccessDeniedError("Можно изменять только свои комментарии")

    def _extract_mention_logins(self, content: str) -> set[str]:
        return {
            item
            for item in re.findall(r"@([A-Za-z0-9_]{3,50})", content or "")
        }

    async def _get_mentioned_users(self, content: str, group_id: Optional[int]) -> List[User]:
        mention_logins = self._extract_mention_logins(content)
        if not mention_logins or not group_id:
            return []

        stmt = (
            select(User)
            .join(GroupMember, GroupMember.user_id == User.id)
            .where(GroupMember.group_id == group_id)
            .where(User.login.in_(mention_logins))
        )
        result = await self.session.execute(stmt)
        return result.scalars().unique().all()

    async def _get_task_comment(self, task_id: int, comment_id: int) -> TaskComment:
        stmt = (
            select(TaskComment)
            .options(
                selectinload(TaskComment.author),
                selectinload(TaskComment.mentioned_users),
            )
            .where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
        )
        result = await self.session.execute(stmt)
        comment = result.scalar_one_or_none()

        if not comment:
            raise TaskCommentNotFoundError(comment_id)

        return comment

    async def _apply_comment_read_state(
        self,
        comments: List[TaskComment],
        current_user: User,
    ) -> List[TaskComment]:
        if not comments:
            return comments

        comment_ids = [comment.id for comment in comments]
        read_stmt = (
            select(task_comment_reads.c.comment_id, task_comment_reads.c.read_at)
            .where(task_comment_reads.c.user_id == current_user.id)
            .where(task_comment_reads.c.comment_id.in_(comment_ids))
        )
        read_result = await self.session.execute(read_stmt)
        read_map = {row.comment_id: row.read_at for row in read_result.all()}

        for comment in comments:
            is_read = (
                comment.author_id == current_user.id
                or comment.is_deleted
                or comment.id in read_map
            )
            setattr(comment, "is_read", is_read)
            setattr(comment, "read_at", read_map.get(comment.id))

        return comments

    async def _mark_comment_read_row(self, comment_id: int, user_id: int) -> bool:
        existing_stmt = (
            select(task_comment_reads.c.comment_id)
            .where(task_comment_reads.c.comment_id == comment_id)
            .where(task_comment_reads.c.user_id == user_id)
        )
        existing = await self.session.execute(existing_stmt)
        if existing.first():
            return False

        await self.session.execute(
            task_comment_reads.insert().values(
                comment_id=comment_id,
                user_id=user_id,
            )
        )
        return True

    async def _reset_comment_read_state_for_others(self, comment_id: int, author_id: int) -> None:
        await self.session.execute(
            delete(task_comment_reads)
            .where(task_comment_reads.c.comment_id == comment_id)
            .where(task_comment_reads.c.user_id != author_id)
        )

    def _add_history(
        self,
        task_id: int,
        user_id: int,
        action: str,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        details: Optional[Dict[str, Any] | str] = None,
    ) -> None:
        prepared_details = details
        if isinstance(details, (dict, list)):
            prepared_details = json.dumps(details, ensure_ascii=False)

        self.session.add(TaskHistory(
            task_id=task_id,
            user_id=user_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
            details=prepared_details,
        ))

    async def get_all_tasks(self, current_user_id: int) -> List[TaskRead]:
        self.logger.info(f"Fetching all tasks by global admin {current_user_id}")
        await ensure_global_admin_by_id(self.session, current_user_id)
        stmt = select(Task).order_by(Task.id)
        result = await self.session.scalars(stmt)
        tasks = result.all()
        self.logger.debug(f"Found {len(tasks)} tasks")
        return tasks
    
    async def get_user_tasks(self, user_id: int) -> List[TaskReadWithRelations]:
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
        self.logger.debug(f"Fetching team tasks for user {user_id}")
        
        if not self.group_service:
            self.logger.warning("GroupService not available")
            return []
        
        user_groups = await self.group_service.get_user_groups(user_id)

        if not user_groups:
            self.logger.debug(f"No groups found for user {user_id}")
            return []

        user_group_ids = [group.id for group in user_groups]

        stmt = (
            select(Task)
            .where(Task.group_id.in_(user_group_ids))
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
        self.logger.info(f"Creating new task '{task_data.title}' by user {current_user.id}")
        self._ensure_allowed_create_status(task_data.status)
        
        try:
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == task_data.project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {task_data.project_id} not found")
                raise ProjectNotFoundError(task_data.project_id)

            stmt_group = select(Group).where(Group.id == task_data.group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {task_data.group_id} not found")
                raise GroupNotFoundError(task_data.group_id)

            if group not in project.groups:
                self.logger.warning(f"Group {task_data.group_id} not in project {task_data.project_id}")
                raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

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
            await self.session.flush()
            self._add_history(
                task_id=new_task.id,
                user_id=current_user.id,
                action="task_created",
                new_value=new_task.title,
                details={"assignee_ids": [current_user.id]},
            )
            await self.session.commit()
            
            self.logger.info(f"Task created successfully with ID: {new_task.id}")
            
            if self.notification_trigger:
                await self.notification_trigger.on_task_created(
                    task=new_task,
                    created_by=current_user,
                    assignee_ids=[current_user.id]
                )
            
            return await self.get_task_by_id(new_task.id)

        except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError, TaskCreationError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating task: {e}", exc_info=True)
            raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")
    
    async def create_task_for_users(self, task_data: TaskCreate, assignee_ids: List[int], current_user: User) -> TaskReadWithRelations:
        self.logger.info(f"Creating task for users {assignee_ids} by user {current_user.id}")
        self._ensure_allowed_create_status(task_data.status)
        
        try:
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == task_data.project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {task_data.project_id} not found")
                raise ProjectNotFoundError(task_data.project_id)

            stmt_group = select(Group).where(Group.id == task_data.group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {task_data.group_id} not found")
                raise GroupNotFoundError(task_data.group_id)

            if group not in project.groups:
                self.logger.warning(f"Group {task_data.group_id} not in project {task_data.project_id}")
                raise GroupNotInProjectError(task_data.group_id, task_data.project_id)

            is_admin = False
            try:
                await ensure_user_is_admin(self.session, current_user.id, task_data.group_id)
                is_admin = True
            except InsufficientPermissionsError:
                if len(assignee_ids) > 1 or (assignee_ids and assignee_ids[0] != current_user.id):
                    self.logger.warning(f"User {current_user.id} not admin, can't create task for others")
                    raise TaskAccessDeniedError("Только администраторы могут создавать задачи для других пользователей")

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

            assigned_users = []
            if assignee_ids:
                users_stmt = select(User).where(User.id.in_(assignee_ids))
                users_result = await self.session.execute(users_stmt)
                users = users_result.scalars().all()
                
                for user in users:
                    new_task.assignees.append(user)
                    assigned_users.append(user)
            else:
                new_task.assignees.append(current_user)
                assigned_users.append(current_user)

            self.session.add(new_task)
            await self.session.flush()
            self._add_history(
                task_id=new_task.id,
                user_id=current_user.id,
                action="task_created",
                new_value=new_task.title,
                details={"assignee_ids": [u.id for u in assigned_users]},
            )
            await self.session.commit()
            
            self.logger.info(f"Task for users created successfully with ID: {new_task.id}")
            
            if self.notification_trigger:
                await self.notification_trigger.on_task_created(
                    task=new_task,
                    created_by=current_user,
                    assignee_ids=[u.id for u in assigned_users]
                )
            
            return await self.get_task_by_id(new_task.id)

        except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
                TaskAccessDeniedError, UsersNotInGroupError, TaskCreationError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating task for users: {e}", exc_info=True)
            raise TaskCreationError(f"Не удалось создать задачу: {str(e)}")
    
    async def add_users_to_task(self, task_id: int, data: AddRemoveUsersToTask, current_user: User) -> TaskReadWithRelations:
        self.logger.info(f"Adding users to task {task_id} by user {current_user.id}")
        
        try:
            task = await self.get_task_by_id(task_id)

            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

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

            added_users = []
            for user in users:
                if user not in task.assignees:
                    task.assignees.append(user)
                    added_users.append(user)

            if added_users:
                self._add_history(
                    task_id=task.id,
                    user_id=current_user.id,
                    action="assignees_added",
                    new_value=", ".join(user.login for user in added_users),
                    details={"user_ids": [user.id for user in added_users]},
                )

            await self.session.commit()
            self.logger.info(f"Users added to task {task_id} successfully")
            
            if self.notification_trigger and added_users:
                await self.notification_trigger.on_users_assigned_to_task(
                    task=task,
                    assigned_users=added_users,
                    assigned_by=current_user
                )
            
            return await self.get_task_by_id(task_id)

        except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error adding users to task {task_id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось добавить пользователей в задачу: {str(e)}")
    
    async def update_task(self, db_task: Task, task_update: TaskUpdate, current_user: User) -> TaskRead:
        self.logger.info(f"Updating task {db_task.id} by user {current_user.id}")
        
        try:
            is_assignee = any(u.id == current_user.id for u in db_task.assignees)
            
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, db_task.group_id)
            
            changes = {}
            
            if task_update.title and task_update.title != db_task.title:
                changes['title'] = {'old': db_task.title, 'new': task_update.title}
            
            if task_update.description is not None and task_update.description != db_task.description:
                changes['description'] = {'old': db_task.description, 'new': task_update.description}
            
            if task_update.priority and task_update.priority != db_task.priority:
                changes['priority'] = {'old': db_task.priority.value, 'new': task_update.priority.value}
            
            if task_update.start_date and task_update.start_date != db_task.start_date:
                changes['start_date'] = {'old': db_task.start_date.isoformat() if db_task.start_date else None,
                                          'new': task_update.start_date.isoformat()}
            
            if task_update.deadline and task_update.deadline != db_task.deadline:
                changes['deadline'] = {'old': db_task.deadline.isoformat() if db_task.deadline else None,
                                        'new': task_update.deadline.isoformat()}
            
            if task_update.tags is not None and set(task_update.tags) != set(db_task.tags or []):
                changes['tags'] = {'old': db_task.tags, 'new': task_update.tags}

            for key, value in task_update.model_dump(exclude_unset=True).items():
                setattr(db_task, key, value)

            for field_name, change in changes.items():
                self._add_history(
                    task_id=db_task.id,
                    user_id=current_user.id,
                    action=f"{field_name}_changed",
                    old_value=str(change.get('old')) if change.get('old') is not None else None,
                    new_value=str(change.get('new')) if change.get('new') is not None else None,
                    details={"field": field_name},
                )

            await self.session.commit()
            await self.session.refresh(db_task)
            
            self.logger.info(f"Task {db_task.id} updated successfully")
            
            if changes and self.notification_trigger:
                await self.notification_trigger.on_task_updated(db_task, current_user, changes)
            
            return db_task

        except (TaskAccessDeniedError, TaskNotFoundError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task {db_task.id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить задачу: {str(e)}")
    
    async def remove_users_from_task(self, task_id: int, data: AddRemoveUsersToTask, current_user: User) -> dict:
        self.logger.info(f"Removing users from task {task_id} by user {current_user.id}")
        
        try:
            task = await self.get_task_by_id(task_id)

            if not task.group:
                self.logger.warning(f"Task {task_id} has no group")
                raise TaskNoGroupError()

            await ensure_user_is_admin(self.session, current_user.id, task.group.id)

            users_to_remove = [u for u in task.assignees if u.id in data.user_ids]
            if not users_to_remove:
                self.logger.warning(f"Users {data.user_ids} not in task {task_id}")
                raise UsersNotInTaskError(data.user_ids)

            for user in users_to_remove:
                task.assignees.remove(user)

            if users_to_remove:
                self._add_history(
                    task_id=task.id,
                    user_id=current_user.id,
                    action="assignees_removed",
                    old_value=", ".join(user.login for user in users_to_remove),
                    details={"user_ids": [user.id for user in users_to_remove]},
                )

            if not task.assignees:
                delete_history_stmt = delete(TaskHistory).where(TaskHistory.task_id == task_id)
                await self.session.execute(delete_history_stmt)
                
                await self.session.delete(task)
                await self.session.commit()
                self.logger.info(f"Task {task_id} deleted as it has no assignees")
                
                if self.notification_trigger:
                    await self.notification_trigger.on_task_deleted(task, current_user)
                
                return {"detail": "Задача удалена, так как не осталось исполнителей"}

            await self.session.commit()
            self.logger.info(f"Users removed from task {task_id} successfully")
            
            if self.notification_trigger:
                await self.notification_trigger.on_users_unassigned_from_task(
                    task=task,
                    unassigned_users=users_to_remove,
                    unassigned_by=current_user
                )
            
            return {"detail": "Пользователи успешно удалены из задачи"}

        except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error removing users from task {task_id}: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось удалить пользователей из задачи: {str(e)}")
    
    async def delete_task(self, task_id: int, current_user: User) -> bool:
        self.logger.info(f"Deleting task {task_id} by user {current_user.id}")
        
        try:
            db_task = await self.get_task_by_id(task_id)

            if not db_task.group_id:
                self.logger.warning(f"Task {task_id} has no group")
                raise TaskNoGroupError()

            is_assignee = any(u.id == current_user.id for u in db_task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, db_task.group_id)

            stmt_history = select(TaskHistory).where(TaskHistory.task_id == task_id)
            result_history = await self.session.execute(stmt_history)
            history_entries = result_history.scalars().all()
            
            for history_entry in history_entries:
                await self.session.delete(history_entry)

            await self.session.delete(db_task)
            await self.session.commit()
            
            self.logger.info(f"Task {task_id} deleted successfully")
            
            if self.notification_trigger:
                await self.notification_trigger.on_task_deleted(db_task, current_user)
            
            return True

        except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting task {task_id}: {e}", exc_info=True)
            raise TaskDeleteError(f"Не удалось удалить задачу: {str(e)}")
    
    async def update_task_status(self, task_id: int, new_status: TaskStatus, current_user: User) -> TaskRead:
        self.logger.info(f"Updating status of task {task_id} to {new_status.value}")
        
        try:
            task = await self.get_task_by_id(task_id)

            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            old_status = task.status
            task.status = new_status

            self._add_history(
                task_id=task_id,
                user_id=current_user.id,
                action="status_changed",
                old_value=old_status.value,
                new_value=new_status.value,
            )

            await self.session.commit()
            await self.session.refresh(task)
            
            self.logger.info(f"Task {task_id} status updated from {old_status.value} to {new_status.value}")
            
            if self.notification_trigger:
                await self.notification_trigger.on_task_status_changed(
                    task=task,
                    changed_by=current_user,
                    old_status=old_status.value,
                    new_status=new_status.value
                )
            
            return task

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task status: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить статус задачи: {str(e)}")
    
    async def update_task_priority(self, task_id: int, new_priority: TaskPriority, current_user: User) -> TaskRead:
        self.logger.info(f"Updating priority of task {task_id} to {new_priority.value}")
        
        try:
            task = await self.get_task_by_id(task_id)

            is_assignee = any(u.id == current_user.id for u in task.assignees)
            if not is_assignee:
                await ensure_user_is_admin(self.session, current_user.id, task.group_id)

            old_priority = task.priority
            task.priority = new_priority

            self._add_history(
                task_id=task_id,
                user_id=current_user.id,
                action="priority_changed",
                old_value=old_priority.value,
                new_value=new_priority.value,
            )

            await self.session.commit()
            await self.session.refresh(task)
            
            self.logger.info(f"Task {task_id} priority updated from {old_priority.value} to {new_priority.value}")
            
            if self.notification_trigger:
                await self.notification_trigger.on_task_priority_changed(
                    task=task,
                    changed_by=current_user,
                    old_priority=old_priority.value,
                    new_priority=new_priority.value
                )
            
            return task

        except (TaskNotFoundError, TaskAccessDeniedError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating task priority: {e}", exc_info=True)
            raise TaskUpdateError(f"Не удалось обновить приоритет задачи: {str(e)}")
    
    async def update_task_position(self, task_id: int, new_position: int, current_user: User) -> TaskRead:
        self.logger.info(f"Updating position of task {task_id} to {new_position}")
        
        try:
            task = await self.get_task_by_id(task_id)

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
    
    async def bulk_update_tasks(self, updates: List[TaskBulkUpdate], current_user: User) -> List[TaskRead]:
        self.logger.info(f"Bulk updating {len(updates)} tasks")
        
        try:
            updated_tasks = []
            
            for update in updates:
                task = await self.get_task_by_id(update.task_id)

                is_assignee = any(u.id == current_user.id for u in task.assignees)
                if not is_assignee:
                    await ensure_user_is_admin(self.session, current_user.id, task.group_id)

                if update.status is not None and update.status != task.status:
                    old_status = task.status
                    task.status = update.status
                    
                    self._add_history(
                        task_id=task.id,
                        user_id=current_user.id,
                        action="status_changed",
                        old_value=old_status.value,
                        new_value=update.status.value,
                    )
                    
                    if self.notification_trigger:
                        await self.notification_trigger.on_task_status_changed(
                            task=task,
                            changed_by=current_user,
                            old_status=old_status.value,
                            new_status=update.status.value
                        )

                if update.position is not None:
                    task.position = update.position

                if update.priority is not None and update.priority != task.priority:
                    old_priority = task.priority
                    task.priority = update.priority
                    
                    self._add_history(
                        task_id=task.id,
                        user_id=current_user.id,
                        action="priority_changed",
                        old_value=old_priority.value,
                        new_value=update.priority.value,
                    )
                    
                    if self.notification_trigger:
                        await self.notification_trigger.on_task_priority_changed(
                            task=task,
                            changed_by=current_user,
                            old_priority=old_priority.value,
                            new_priority=update.priority.value
                        )

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
    
    async def get_project_board_tasks(self, project_id: int, group_id: int, view_mode: str, current_user: User) -> List[TaskReadWithRelations]:
        self.logger.info(f"Fetching board tasks for project {project_id}, group {group_id}, mode {view_mode}")
        
        try:
            stmt_project = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
            result_project = await self.session.execute(stmt_project)
            project = result_project.scalar_one_or_none()

            if not project:
                self.logger.warning(f"Project {project_id} not found")
                raise ProjectNotFoundError(project_id)

            stmt_group = select(Group).where(Group.id == group_id)
            result_group = await self.session.execute(stmt_group)
            group = result_group.scalar_one_or_none()

            if not group:
                self.logger.warning(f"Group {group_id} not found")
                raise GroupNotFoundError(group_id)

            if group not in project.groups:
                self.logger.warning(f"Group {group_id} not in project {project_id}")
                raise GroupNotInProjectError(group_id, project_id)
            if not is_global_admin_user(current_user):
                if not await check_user_in_group(self.session, current_user.id, group_id):
                    self.logger.warning(f"User {current_user.id} not in group {group_id}")
                    raise TaskAccessDeniedError("Вы не состоите в указанной группе")

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
    
    async def quick_create_task(self, task_data: TaskCreate, current_user: User) -> TaskReadWithRelations:
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
    
    async def get_task_comments(self, task_id: int, current_user: User) -> List[TaskComment]:
        await self._ensure_task_view_access(task_id, current_user)

        stmt = (
            select(TaskComment)
            .options(
                selectinload(TaskComment.author),
                selectinload(TaskComment.mentioned_users),
            )
            .where(TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at.asc())
        )
        result = await self.session.execute(stmt)
        comments = result.scalars().unique().all()
        return await self._apply_comment_read_state(comments, current_user)

    async def create_task_comment(
        self,
        task_id: int,
        comment_data: TaskCommentCreate,
        current_user: User,
    ) -> TaskComment:
        task = await self._ensure_task_view_access(task_id, current_user)
        content = comment_data.content.strip()

        if not content:
            raise TaskUpdateError("Комментарий не может быть пустым")

        parent_id = comment_data.parent_id
        if parent_id is not None:
            parent_comment = await self._get_task_comment(task_id, parent_id)
            if parent_comment.is_deleted:
                raise TaskUpdateError("Нельзя ответить на удалённый комментарий")

        mentioned_users = await self._get_mentioned_users(content, task.group_id)

        comment = TaskComment(
            task_id=task_id,
            author_id=current_user.id,
            parent_id=parent_id,
            content=content,
            mentioned_users=mentioned_users,
        )
        self.session.add(comment)
        await self.session.flush()
        await self._mark_comment_read_row(comment.id, current_user.id)

        self._add_history(
            task_id=task_id,
            user_id=current_user.id,
            action="comment_replied" if parent_id else "comment_added",
            new_value=str(comment.id),
            details={
                "comment_id": comment.id,
                "parent_id": parent_id,
                "mentioned_user_ids": [user.id for user in mentioned_users],
            },
        )

        await self.session.commit()

        if self.notification_trigger:
            mentioned_user_ids = {user.id for user in mentioned_users}
            await self.notification_trigger.on_task_comment_added(
                task=task,
                comment_author=current_user,
                mentioned_user_ids=mentioned_user_ids,
            )
            if mentioned_user_ids:
                await self.notification_trigger.on_task_comment_mentions(
                    task=task,
                    comment_author=current_user,
                    mentioned_user_ids=mentioned_user_ids,
                )

        return await self._get_task_comment(task_id, comment.id)

    async def update_task_comment(
        self,
        task_id: int,
        comment_id: int,
        comment_data: TaskCommentUpdate,
        current_user: User,
    ) -> TaskComment:
        comment = await self._get_task_comment(task_id, comment_id)
        task = await self._ensure_comment_manage_access(comment, current_user)

        if comment.is_deleted:
            raise TaskUpdateError("Нельзя изменить удалённый комментарий")

        content = comment_data.content.strip()
        if not content:
            raise TaskUpdateError("Комментарий не может быть пустым")

        old_content = comment.content
        old_mentions = {user.id for user in comment.mentioned_users}
        mentioned_users = await self._get_mentioned_users(content, task.group_id)
        new_mentions = {user.id for user in mentioned_users}

        comment.content = content
        comment.is_edited = True
        comment.mentioned_users = mentioned_users
        await self._reset_comment_read_state_for_others(comment_id, current_user.id)
        await self._mark_comment_read_row(comment_id, current_user.id)

        self._add_history(
            task_id=task_id,
            user_id=current_user.id,
            action="comment_updated",
            old_value=str(comment_id),
            new_value=str(comment_id),
            details={
                "comment_id": comment_id,
                "mentioned_user_ids": list(new_mentions),
            },
        )

        await self.session.commit()

        newly_mentioned_user_ids = new_mentions - old_mentions
        if self.notification_trigger and newly_mentioned_user_ids:
            await self.notification_trigger.on_task_comment_mentions(
                task=task,
                comment_author=current_user,
                mentioned_user_ids=newly_mentioned_user_ids,
            )

        self.logger.debug(
            "Comment %s updated. Old length=%s, new length=%s",
            comment_id,
            len(old_content or ""),
            len(content),
        )
        return await self._get_task_comment(task_id, comment_id)

    async def delete_task_comment(self, task_id: int, comment_id: int, current_user: User) -> dict:
        comment = await self._get_task_comment(task_id, comment_id)
        await self._ensure_comment_manage_access(comment, current_user)

        if comment.is_deleted:
            return {"detail": "Комментарий уже удалён"}

        comment.content = "Комментарий удалён"
        comment.is_deleted = True
        comment.deleted_at = datetime.now(timezone.utc)
        comment.mentioned_users = []

        self._add_history(
            task_id=task_id,
            user_id=current_user.id,
            action="comment_deleted",
            old_value=str(comment_id),
            details={"comment_id": comment_id},
        )

        await self.session.commit()
        return {"detail": "Комментарий удалён"}

    async def mark_task_comment_read(
        self,
        task_id: int,
        comment_id: int,
        current_user: User,
    ) -> dict:
        await self._ensure_task_view_access(task_id, current_user)
        comment = await self._get_task_comment(task_id, comment_id)

        if comment.author_id == current_user.id or comment.is_deleted:
            return {"detail": "Комментарий уже считается прочитанным", "marked_count": 0}

        created = await self._mark_comment_read_row(comment_id, current_user.id)
        if created:
            await self.session.commit()

        return {
            "detail": "Комментарий отмечен как прочитанный",
            "marked_count": 1 if created else 0,
        }

    async def mark_task_comments_read(self, task_id: int, current_user: User) -> dict:
        await self._ensure_task_view_access(task_id, current_user)

        stmt = (
            select(TaskComment)
            .where(TaskComment.task_id == task_id)
            .where(TaskComment.author_id != current_user.id)
            .where(TaskComment.is_deleted.is_(False))
        )
        result = await self.session.execute(stmt)
        comments = result.scalars().unique().all()

        marked_count = 0
        for comment in comments:
            if await self._mark_comment_read_row(comment.id, current_user.id):
                marked_count += 1

        if marked_count:
            await self.session.commit()

        return {
            "detail": "Комментарии отмечены как прочитанные",
            "marked_count": marked_count,
        }

    async def get_task_timeline(self, task_id: int, current_user: User) -> List[Dict[str, Any]]:
        await self._ensure_task_view_access(task_id, current_user)

        comments_stmt = (
            select(TaskComment)
            .options(
                selectinload(TaskComment.author),
                selectinload(TaskComment.mentioned_users),
            )
            .where(TaskComment.task_id == task_id)
        )
        history_stmt = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.user))
            .where(TaskHistory.task_id == task_id)
        )

        comments_result = await self.session.execute(comments_stmt)
        history_result = await self.session.execute(history_stmt)

        timeline: List[Dict[str, Any]] = []

        comments = comments_result.scalars().unique().all()
        await self._apply_comment_read_state(comments, current_user)

        for comment in comments:
            timeline.append({
                "type": "comment",
                "id": comment.id,
                "created_at": comment.created_at,
                "actor": comment.author,
                "comment": comment,
            })

        for item in history_result.scalars().unique().all():
            if item.action in {"comment_added", "comment_replied", "comment_updated", "comment_deleted"}:
                continue

            timeline.append({
                "type": "activity",
                "id": item.id,
                "created_at": item.created_at,
                "actor": item.user,
                "action": item.action,
                "old_value": item.old_value,
                "new_value": item.new_value,
                "details": item.details,
            })

        timeline.sort(key=lambda item: item["created_at"], reverse=True)
        return timeline

    async def get_task_history(self, task_id: int) -> List[TaskHistory]:
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