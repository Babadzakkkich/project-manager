from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.database.session import db_session
from modules.auth.dependencies import get_current_user
from core.utils.dependencies import ensure_user_is_super_admin_global, check_users_in_same_group
from core.logger import logger
from .service import UserService
from .schemas import UserRead, UserCreate, UserUpdate, UserWithRelations
from .exceptions import (
    UserNotFoundError,
    UserAlreadyExistsError,
    UserCreationError,
    UserUpdateError,
    UserDeleteError,
    UserAccessDeniedError
)

router = APIRouter()

# Получить всех пользователей (только для супер-админа)
@router.get("/", response_model=list[UserRead])
async def get_users(
    session: AsyncSession = Depends(db_session.session_getter), 
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /users requested by user {current_user.id}")
    await ensure_user_is_super_admin_global(session, current_user.id)
    user_service = UserService(session)
    users = await user_service.get_all_users()
    return users

# Получить профиль текущего пользователя
@router.get("/me", response_model=UserWithRelations)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"GET /users/me requested by user {current_user.id}")
    user_service = UserService(session)
    user = await user_service.get_user_by_id(current_user.id)
    if not user:
        logger.error(f"Current user {current_user.id} not found in database")
        raise UserNotFoundError(user_id=current_user.id)
    return user

# Получить пользователя по ID
@router.get("/{user_id}", response_model=UserWithRelations)
async def get_user_by_id(
    user_id: int, 
    session: AsyncSession = Depends(db_session.session_getter), 
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /users/{user_id} requested by user {current_user.id}")
    
    if user_id != current_user.id:
        in_same_group = await check_users_in_same_group(session, current_user.id, user_id)
        if not in_same_group:
            logger.warning(f"User {current_user.id} tried to access user {user_id} without permission")
            raise UserAccessDeniedError("Нет доступа к информации о пользователе")
    
    user_service = UserService(session)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        logger.warning(f"User {user_id} not found")
        raise UserNotFoundError(user_id=user_id)
    return user

# Создать нового пользователя
@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    user_data: UserCreate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    logger.info(f"POST /users - creating new user with login: {user_data.login}")
    user_service = UserService(session)
    
    try:
        user = await user_service.create_user(user_data)
        logger.info(f"User created successfully with ID: {user.id}")
        return user
    except (UserAlreadyExistsError, UserCreationError) as e:
        logger.error(f"Error creating user: {e.detail}")
        raise e

# Обновить профиль текущего пользователя
@router.put("/me", response_model=UserRead)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"PUT /users/me requested by user {current_user.id}")
    user_service = UserService(session)
    
    try:
        updated_user = await user_service.update_user(current_user.id, user_update, current_user.id)
        logger.info(f"User {current_user.id} updated successfully")
        return updated_user
    except (UserNotFoundError, UserAlreadyExistsError, UserUpdateError) as e:
        logger.error(f"Error updating user: {e.detail}")
        raise e

# Удалить текущего пользователя
@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"DELETE /users/me requested by user {current_user.id}")
    user_service = UserService(session)
    
    try:
        deleted = await user_service.delete_user(current_user.id, current_user.id)
        if not deleted:
            logger.error(f"User {current_user.id} not found for deletion")
            raise UserNotFoundError(user_id=current_user.id)
        logger.info(f"User {current_user.id} deleted successfully")
        return {"detail": "Ваш профиль успешно удалён"}
    except (UserNotFoundError, UserDeleteError) as e:
        logger.error(f"Error deleting user: {e.detail}")
        raise e

# Обновить пользователя по ID
@router.put("/{user_id}", response_model=UserRead)
async def update_user_by_id(
    user_id: int,
    user_update: UserUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /users/{user_id} requested by user {current_user.id}")
    user_service = UserService(session)
    
    try:
        updated_user = await user_service.update_user(user_id, user_update, current_user.id)
        logger.info(f"User {user_id} updated successfully by admin {current_user.id}")
        return updated_user
    except (UserNotFoundError, UserAlreadyExistsError, UserUpdateError) as e:
        logger.error(f"Error updating user {user_id}: {e.detail}")
        raise e

# Удалить пользователя по ID
@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user_by_id(
    user_id: int, 
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /users/{user_id} requested by user {current_user.id}")
    user_service = UserService(session)
    
    try:
        deleted = await user_service.delete_user(user_id, current_user.id)
        if not deleted:
            logger.warning(f"User {user_id} not found for deletion")
            raise UserNotFoundError(user_id=user_id)
        logger.info(f"User {user_id} deleted successfully by admin {current_user.id}")
        return {"detail": f"Пользователь с id:{user_id} успешно удалён"}
    except (UserNotFoundError, UserDeleteError) as e:
        logger.error(f"Error deleting user {user_id}: {e.detail}")
        raise e