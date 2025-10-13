from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.database.session import db_session
from modules.auth.dependencies import get_current_user
from . import service as users_service
from .schemas import UserRead, UserCreate, UserUpdate, UserWithRelations
from .exceptions import (
    UserNotFoundError,
    UserAlreadyExistsError,
    UserCreationError,
    UserUpdateError,
    UserDeleteError
)

router = APIRouter()

@router.get("/", response_model=list[UserRead])
async def get_users(
    session: AsyncSession = Depends(db_session.session_getter), 
    current_user: User = Depends(get_current_user)
):
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
        updated_user = await users_service.update_user(session, current_user.id, user_update)
        return updated_user
    except (UserNotFoundError, UserAlreadyExistsError, UserUpdateError) as e:
        raise e

@router.put("/{user_id}", response_model=UserRead)
async def update_user_by_id(
    user_id: int,
    user_update: UserUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_user = await users_service.update_user(session, user_id, user_update)
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
        deleted = await users_service.delete_user(session, user_id)
        if not deleted:
            raise UserNotFoundError(user_id=user_id)
        return {"detail": f"Пользователь с id:{user_id} успешно удалён"}
    except (UserNotFoundError, UserDeleteError) as e:
        raise e