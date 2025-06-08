from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import db_session

from . import service as users_service
from .schemas import UserRead, UserCreate, UserUpdate

router = APIRouter()

@router.get("/", response_model=list[UserRead])
async def get_users(session: AsyncSession = Depends(db_session.session_getter)):
    users = await users_service.get_all_users(session)
    return users


@router.get("/{user_id}", response_model=UserRead)
async def get_user_by_id(user_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    user = await users_service.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user

@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    user_data: UserCreate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    try:
        user = await users_service.create_user(session, user_data)
        return user
    except Exception as e:
        raise HTTPException(status_code=400, detail="Ошибка создания пользователя")
    
@router.put("/{user_id}", response_model=UserRead)
async def update_user_by_id(
    user_id: int,
    user_update: UserUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    updated_user = await users_service.update_user(session, user_id, user_update)
    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return updated_user


@router.patch("/{user_id}", response_model=UserRead)
async def partial_update_user(
    user_id: int,
    user_update: UserUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    updated_user = await users_service.update_user(session, user_id, user_update)
    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return updated_user

@router.delete("/{user_id}", status_code=200)
async def delete_user_by_id(user_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    deleted = await users_service.delete_user(session, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return {f"detail": "Пользователь с id:{user_id} успешно удалён"}