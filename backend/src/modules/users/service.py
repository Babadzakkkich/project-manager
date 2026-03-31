from typing import Optional, List, Dict, Any, TYPE_CHECKING
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas import BaseGroupInfo, BaseTaskInfo
from core.utils.password_hasher import hash_password
from shared.dependencies import ensure_user_is_super_admin_global
from core.database.models import RefreshToken, Task, TaskHistory, User, GroupMember
from core.logger import logger
from .schemas import UserCreate, UserUpdate, UserWithRelations
from modules.groups.service import GroupService
from .exceptions import (
    UserNotFoundError,
    UserAlreadyExistsError,
    UserUpdateError,
    UserCreationError,
    UserDeleteError
)

if TYPE_CHECKING:
    from core.services import ServiceFactory


class UserService:
    """Сервис для работы с пользователями"""
    
    def __init__(self, session: AsyncSession, service_factory: Optional['ServiceFactory'] = None):
        self.session = session
        self.service_factory = service_factory
        self.logger = logger
        self._group_service = None
    
    @property
    def group_service(self):
        """Ленивая загрузка GroupService через фабрику"""
        if self._group_service is None and self.service_factory:
            from modules.groups.service import GroupService
            self._group_service = self.service_factory.get_or_create('group', GroupService)
        return self._group_service
    
    async def check_user_exists(self, login: str, email: str) -> tuple[bool, bool]:
        """Проверка существования пользователя по логину и email"""
        stmt = select(User).where(
            (User.login == login) | (User.email == email)
        )
        result = await self.session.execute(stmt)
        existing_users = result.scalars().all()
        
        login_exists = any(user.login == login for user in existing_users)
        email_exists = any(user.email == email for user in existing_users)
        
        return login_exists, email_exists
    
    async def get_all_users(self) -> List[User]:
        """Получение всех пользователей"""
        self.logger.info("Fetching all users")
        stmt = select(User).order_by(User.id)
        result = await self.session.scalars(stmt)
        users = result.all()
        self.logger.debug(f"Found {len(users)} users")
        return users
    
    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Получение пользователя по ID (только модель SQLAlchemy)"""
        self.logger.debug(f"Fetching user by ID: {user_id}")
        stmt = select(User).options(
            selectinload(User.group_memberships).selectinload(GroupMember.group),
            selectinload(User.assigned_tasks)
        ).where(User.id == user_id)
        
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        
        return user
    
    async def get_user_with_relations(self, user_id: int) -> Optional[UserWithRelations]:
        """Получение пользователя со связанными данными"""
        user = await self.get_user_by_id(user_id)
        if not user:
            return None
        
        # Преобразуем группы в BaseGroupInfo
        groups = []
        for membership in user.group_memberships:
            groups.append(BaseGroupInfo(
                id=membership.group.id,
                name=membership.group.name,
                description=membership.group.description,
                created_at=membership.group.created_at
            ))
        
        # Преобразуем задачи в BaseTaskInfo
        assigned_tasks = []
        for task in user.assigned_tasks:
            assigned_tasks.append(BaseTaskInfo(
                id=task.id,
                title=task.title,
                status=task.status,
                priority=task.priority,
                deadline=task.deadline
            ))
        
        # Создаем UserWithRelations
        return UserWithRelations(
            id=user.id,
            login=user.login,
            email=user.email,
            name=user.name,
            created_at=user.created_at,
            groups=groups,
            assigned_tasks=assigned_tasks
        )
        
    async def get_user_by_login(self, login: str) -> Optional[User]:
        """Получение пользователя по логину"""
        self.logger.debug(f"Fetching user by login: {login}")
        stmt = select(User).where(User.login == login)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        return user
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Получение пользователя по email"""
        self.logger.debug(f"Fetching user by email: {email}")
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        return user
    
    async def create_user(self, user_create: UserCreate) -> User:
        """Создание нового пользователя"""
        self.logger.info(f"Creating new user with login: {user_create.login}")
        
        try:
            login_exists, email_exists = await self.check_user_exists(
                user_create.login, user_create.email
            )
            
            if login_exists or email_exists:
                if login_exists and email_exists:
                    self.logger.warning(f"User with login {user_create.login} and email {user_create.email} already exists")
                    raise UserAlreadyExistsError(
                        login=user_create.login,
                        email=user_create.email
                    )
                elif login_exists:
                    self.logger.warning(f"User with login {user_create.login} already exists")
                    raise UserAlreadyExistsError(login=user_create.login)
                else:
                    self.logger.warning(f"User with email {user_create.email} already exists")
                    raise UserAlreadyExistsError(email=user_create.email)

            hashed_password = hash_password(user_create.password)

            new_user = User(
                login=user_create.login,
                email=user_create.email,
                password_hash=hashed_password,
                name=user_create.name,
            )

            self.session.add(new_user)
            await self.session.commit()
            await self.session.refresh(new_user)

            self.logger.info(f"User created successfully with ID: {new_user.id}")
            return new_user

        except ValidationError as e:
            self.logger.error(f"Validation error creating user: {e}")
            raise UserCreationError(f"Ошибка валидации данных: {str(e)}")
        except (UserAlreadyExistsError, UserCreationError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating user: {e}", exc_info=True)
            raise UserCreationError(f"Не удалось создать пользователя: {str(e)}")
    
    async def update_user(self, user_id: int, user_update: UserUpdate, current_user_id: Optional[int] = None) -> User:
        """Обновление пользователя"""
        self.logger.info(f"Updating user with ID: {user_id}")
        
        try:
            user = await self.get_user_by_id(user_id)
            if not user:
                self.logger.warning(f"User with ID {user_id} not found for update")
                raise UserNotFoundError(user_id=user_id)

            if current_user_id and user_id != current_user_id:
                await ensure_user_is_super_admin_global(self.session, current_user_id)

            if user_update.login or user_update.email:
                login_to_check = user_update.login if user_update.login else user.login
                email_to_check = user_update.email if user_update.email else user.email
                
                stmt_check = select(User).where(
                    ((User.login == login_to_check) | (User.email == email_to_check)) &
                    (User.id != user_id)
                )
                result_check = await self.session.execute(stmt_check)
                conflicting_users = result_check.scalars().all()
                
                for conflicting_user in conflicting_users:
                    if conflicting_user.login == login_to_check:
                        self.logger.warning(f"Login {login_to_check} already exists")
                        raise UserAlreadyExistsError(login=login_to_check)
                    if conflicting_user.email == email_to_check:
                        self.logger.warning(f"Email {email_to_check} already exists")
                        raise UserAlreadyExistsError(email=email_to_check)

            update_data = user_update.model_dump(exclude_unset=True)

            if "password" in update_data:
                update_data["password_hash"] = hash_password(update_data.pop("password"))

            for key, value in update_data.items():
                setattr(user, key, value)

            await self.session.commit()
            await self.session.refresh(user)
            
            self.logger.info(f"User {user_id} updated successfully")
            return user

        except (UserNotFoundError, UserAlreadyExistsError):
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
            raise UserUpdateError(f"Не удалось обновить пользователя: {str(e)}")
    
    async def delete_user(self, user_id: int, current_user_id: Optional[int] = None) -> bool:
        """Удаление пользователя"""
        self.logger.info(f"Deleting user with ID: {user_id}")
        
        try:
            user = await self.get_user_by_id(user_id)
            if not user:
                self.logger.warning(f"User with ID {user_id} not found for deletion")
                raise UserNotFoundError(user_id=user_id)

            if current_user_id and user_id != current_user_id:
                await ensure_user_is_super_admin_global(self.session, current_user_id)

            user_groups_stmt = select(GroupMember).where(GroupMember.user_id == user_id)
            user_groups_result = await self.session.execute(user_groups_stmt)
            user_groups = user_groups_result.scalars().all()
            group_ids = [ug.group_id for ug in user_groups]

            user_tasks_stmt = select(Task).options(
                selectinload(Task.assignees)
            ).join(
                Task.assignees
            ).where(
                User.id == user_id
            )
            user_tasks_result = await self.session.execute(user_tasks_stmt)
            user_tasks = user_tasks_result.scalars().all()

            if user_tasks:
                delete_user_history_stmt = delete(TaskHistory).where(
                    TaskHistory.user_id == user_id
                )
                await self.session.execute(delete_user_history_stmt)

            stmt_tokens = delete(RefreshToken).where(RefreshToken.user_id == user_id)
            await self.session.execute(stmt_tokens)

            tasks_to_delete = []
            for task in user_tasks:
                if user in task.assignees:
                    task.assignees.remove(user)
                
                if len(task.assignees) == 0:
                    tasks_to_delete.append(task)

            for task in tasks_to_delete:
                delete_task_history_stmt = delete(TaskHistory).where(
                    TaskHistory.task_id == task.id
                )
                await self.session.execute(delete_task_history_stmt)
                await self.session.delete(task)

            delete_memberships_stmt = delete(GroupMember).where(GroupMember.user_id == user_id)
            await self.session.execute(delete_memberships_stmt)

            await self.session.delete(user)

            if group_ids:
                from sqlalchemy import func
                members_count_stmt = (
                    select(GroupMember.group_id, func.count(GroupMember.id))
                    .where(GroupMember.group_id.in_(group_ids))
                    .group_by(GroupMember.group_id)
                )
                members_count_result = await self.session.execute(members_count_stmt)
                members_counts = dict(members_count_result.all())
                
                # Используем group_service через свойство
                if self.group_service:
                    for group_id in group_ids:
                        if members_counts.get(group_id, 0) == 0:
                            await self.group_service.delete_group_auto(group_id)

            await self.session.commit()
            self.logger.info(f"User {user_id} deleted successfully")
            return True

        except UserNotFoundError:
            raise
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting user {user_id}: {e}", exc_info=True)
            raise UserDeleteError(f"Не удалось удалить пользователя: {str(e)}")