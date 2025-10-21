from typing import Optional
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.utils.password_hasher import hash_password
from core.utils.dependencies import ensure_user_is_super_admin_global
from core.database.models import Task, User, GroupMember
from .schemas import UserCreate, UserUpdate
from .exceptions import (
    UserNotFoundError,
    UserAlreadyExistsError,
    UserUpdateError,
    UserCreationError,
    UserDeleteError
)

# Проверить существование пользователя
async def check_user_exists(session: AsyncSession, login: str, email: str) -> tuple[bool, bool]:
    stmt = select(User).where(
        (User.login == login) | (User.email == email)
    )
    result = await session.execute(stmt)
    existing_users = result.scalars().all()
    
    login_exists = any(user.login == login for user in existing_users)
    email_exists = any(user.email == email for user in existing_users)
    
    return login_exists, email_exists

# Получить всех пользователей
async def get_all_users(session: AsyncSession) -> list[User]:
    stmt = select(User).order_by(User.id)
    result = await session.scalars(stmt)
    return result.all()

# Получить пользователя по ID
async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[User]:
    stmt = select(User).options(
        selectinload(User.group_memberships).selectinload(GroupMember.group),
        selectinload(User.assigned_tasks)
    ).where(User.id == user_id)
    
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user:
        user.groups = [membership.group for membership in user.group_memberships]
    
    return user

# Получить пользователя по логину
async def get_user_by_login(session: AsyncSession, login: str) -> Optional[User]:
    stmt = select(User).where(User.login == login)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

# Получить пользователя по email
async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

# Создать пользователя
async def create_user(session: AsyncSession, user_create: UserCreate) -> User:
    try:
        login_exists, email_exists = await check_user_exists(
            session, user_create.login, user_create.email
        )
        
        if login_exists or email_exists:
            if login_exists and email_exists:
                raise UserAlreadyExistsError(
                    login=user_create.login,
                    email=user_create.email
                )
            elif login_exists:
                raise UserAlreadyExistsError(login=user_create.login)
            else:
                raise UserAlreadyExistsError(email=user_create.email)

        hashed_password = hash_password(user_create.password)

        new_user = User(
            login=user_create.login,
            email=user_create.email,
            password_hash=hashed_password,
            name=user_create.name,
        )

        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)

        return new_user

    except ValidationError as e:
        raise UserCreationError(f"Ошибка валидации данных: {str(e)}")
    except (UserAlreadyExistsError, UserCreationError):
        raise
    except Exception as e:
        await session.rollback()
        raise UserCreationError(f"Не удалось создать пользователя: {str(e)}")

# Обновить пользователя
async def update_user(session: AsyncSession, user_id: int, user_update: UserUpdate, current_user_id: Optional[int] = None) -> User:
    try:
        user = await get_user_by_id(session, user_id)
        if not user:
            raise UserNotFoundError(user_id=user_id)

        if current_user_id and user_id != current_user_id:
            await ensure_user_is_super_admin_global(session, current_user_id)

        if user_update.login or user_update.email:
            login_to_check = user_update.login if user_update.login else user.login
            email_to_check = user_update.email if user_update.email else user.email
            
            stmt_check = select(User).where(
                ((User.login == login_to_check) | (User.email == email_to_check)) &
                (User.id != user_id)
            )
            result_check = await session.execute(stmt_check)
            conflicting_users = result_check.scalars().all()
            
            for conflicting_user in conflicting_users:
                if conflicting_user.login == login_to_check:
                    raise UserAlreadyExistsError(login=login_to_check)
                if conflicting_user.email == email_to_check:
                    raise UserAlreadyExistsError(email=email_to_check)

        update_data = user_update.model_dump(exclude_unset=True)

        if "password" in update_data:
            update_data["password_hash"] = hash_password(update_data.pop("password"))

        for key, value in update_data.items():
            setattr(user, key, value)

        await session.commit()
        await session.refresh(user)
        return user

    except (UserNotFoundError, UserAlreadyExistsError):
        raise
    except Exception as e:
        await session.rollback()
        raise UserUpdateError(f"Не удалось обновить пользователя: {str(e)}")

# Удалить пользователя
async def delete_user(
    session: AsyncSession,
    user_id: int,
    current_user_id: Optional[int] = None
) -> bool:
    try:
        user = await get_user_by_id(session, user_id)
        if not user:
            raise UserNotFoundError(user_id=user_id)

        if current_user_id and user_id != current_user_id:
            await ensure_user_is_super_admin_global(session, current_user_id)

        user_groups_stmt = select(GroupMember).where(GroupMember.user_id == user_id)
        user_groups_result = await session.execute(user_groups_stmt)
        user_groups = user_groups_result.scalars().all()
        
        group_ids = [ug.group_id for ug in user_groups]

        user_tasks_stmt = select(Task).options(
            selectinload(Task.assignees)
        ).join(
            Task.assignees
        ).where(
            User.id == user_id
        )
        user_tasks_result = await session.execute(user_tasks_stmt)
        user_tasks = user_tasks_result.scalars().all()

        if user_tasks:
            from core.database.models import TaskHistory
            delete_user_history_stmt = delete(TaskHistory).where(
                TaskHistory.user_id == user_id
            )
            await session.execute(delete_user_history_stmt)

        from core.database.models import RefreshToken
        stmt_tokens = delete(RefreshToken).where(RefreshToken.user_id == user_id)
        await session.execute(stmt_tokens)

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
            await session.execute(delete_task_history_stmt)
            
            await session.delete(task)

        delete_memberships_stmt = delete(GroupMember).where(GroupMember.user_id == user_id)
        await session.execute(delete_memberships_stmt)

        await session.delete(user)

        for group_id in group_ids:
            remaining_members_stmt = select(GroupMember).where(GroupMember.group_id == group_id)
            remaining_members_result = await session.execute(remaining_members_stmt)
            remaining_members = remaining_members_result.scalars().all()
            
            if not remaining_members:
                from modules.groups.service import delete_group_auto
                await delete_group_auto(session, group_id)

        await session.commit()
        return True

    except UserNotFoundError:
        raise
    except Exception as e:
        await session.rollback()
        raise UserDeleteError(f"Не удалось удалить пользователя: {str(e)}")