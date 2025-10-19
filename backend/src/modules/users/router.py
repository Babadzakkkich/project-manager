from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.database.session import db_session
from modules.auth.dependencies import get_current_user
from core.utils.dependencies import ensure_user_is_super_admin_global, check_users_in_same_group
from . import service as users_service
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

@router.get("/", response_model=list[UserRead])
async def get_users(
    session: AsyncSession = Depends(db_session.session_getter), 
    current_user: User = Depends(get_current_user)
):
    # Только супер-админ может видеть всех пользователей
    await ensure_user_is_super_admin_global(session, current_user.id)
    users = await users_service.get_all_users(session)
    return users

@router.get("/me", response_model=UserWithRelations)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    user = await users_service.get_user_by_id(session, current_user.id)
    if not user:
        raise UserNotFoundError(user_id=current_user.id)
    return user

@router.get("/{user_id}", response_model=UserWithRelations)
async def get_user_by_id(
    user_id: int, 
    session: AsyncSession = Depends(db_session.session_getter), 
    current_user: User = Depends(get_current_user)
):
    # Можно смотреть только своих данных или данные пользователей из своих групп
    if user_id != current_user.id:
        in_same_group = await check_users_in_same_group(session, current_user.id, user_id)
        if not in_same_group:
            raise UserAccessDeniedError("Нет доступа к информации о пользователе")
    
    user = await users_service.get_user_by_id(session, user_id)
    if not user:
        raise UserNotFoundError(user_id=user_id)
    return user

@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    user_data: UserCreate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    try:
        user = await users_service.create_user(session, user_data)
        return user
    except (UserAlreadyExistsError, UserCreationError) as e:
        raise e

@router.put("/me", response_model=UserRead)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    try:
        updated_user = await users_service.update_user(session, current_user.id, user_update, current_user.id)
        return updated_user
    except (UserNotFoundError, UserAlreadyExistsError, UserUpdateError) as e:
        raise e

@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    try:
        deleted = await users_service.delete_user(session, current_user.id, current_user.id)
        if not deleted:
            raise UserNotFoundError(user_id=current_user.id)
        return {"detail": "Ваш профиль успешно удалён"}
    except (UserNotFoundError, UserDeleteError) as e:
        raise e

@router.put("/{user_id}", response_model=UserRead)
async def update_user_by_id(
    user_id: int,
    user_update: UserUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        # Только супер-админ может обновлять других пользователей
        updated_user = await users_service.update_user(session, user_id, user_update, current_user.id)
        return updated_user
    except (UserNotFoundError, UserAlreadyExistsError, UserUpdateError) as e:
        raise e

@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user_by_id(
    user_id: int, 
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        # Только супер-админ может удалять других пользователей
        deleted = await users_service.delete_user(session, user_id, current_user.id)
        if not deleted:
            raise UserNotFoundError(user_id=user_id)
        return {"detail": f"Пользователь с id:{user_id} успешно удалён"}
    except (UserNotFoundError, UserDeleteError) as e:
        raise e