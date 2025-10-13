from typing import Optional
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.utils.password_hasher import hash_password
from core.database.models import User
from .schemas import UserCreate, UserUpdate
from .exceptions import (
    UserNotFoundError,
    UserAlreadyExistsError,
    UserUpdateError,
    UserCreationError,
    UserDeleteError
)

async def check_user_exists(session: AsyncSession, login: str, email: str) -> tuple[bool, bool]:
    stmt = select(User).where(
        (User.login == login) | (User.email == email)
    )
    result = await session.execute(stmt)
    existing_users = result.scalars().all()
    
    login_exists = any(user.login == login for user in existing_users)
    email_exists = any(user.email == email for user in existing_users)
    
    return login_exists, email_exists

async def get_all_users(session: AsyncSession) -> list[User]:
    stmt = select(User).order_by(User.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[User]:
    stmt = select(User).options(
        selectinload(User.groups),
        selectinload(User.assigned_tasks)
    ).where(User.id == user_id)
    
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def get_user_by_login(session: AsyncSession, login: str) -> Optional[User]:
    stmt = select(User).where(User.login == login)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

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

async def update_user(session: AsyncSession, user_id: int, user_update: UserUpdate) -> User:
    try:
        user = await get_user_by_id(session, user_id)
        if not user:
            raise UserNotFoundError(user_id=user_id)

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

async def delete_user(session: AsyncSession, user_id: int) -> bool:
    try:
        user = await get_user_by_id(session, user_id)
        if not user:
            raise UserNotFoundError(user_id=user_id)

        for task in list(user.assigned_tasks):
            await session.delete(task)

        user.groups.clear()

        await session.delete(user)
        await session.commit()
        return True

    except UserNotFoundError:
        raise
    except Exception as e:
        await session.rollback()
        raise UserDeleteError(f"Не удалось удалить пользователя: {str(e)}")