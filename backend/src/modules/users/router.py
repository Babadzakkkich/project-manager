from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from core.database.session import db_session
from core.database.models import User
from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user
from modules.auth.exceptions import TokenValidationError
from shared.dependencies import get_service_factory
from core.logger import logger
from .schemas import UserCreate, UserRead, UserUpdate, UserWithRelations
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
@router.get("/", response_model=List[UserRead])
async def get_users(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение списка всех пользователей"""
    logger.info(f"GET /users requested by user {current_user.id}")
    user_service = service_factory.get('user')
    return await user_service.get_all_users()

# Получить информацию о текущем пользователе
@router.get("/me", response_model=UserWithRelations)
async def get_current_user_info(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение информации о текущем пользователе"""
    logger.info(f"GET /users/me requested by user {current_user.id}")
    user_service = service_factory.get('user')
    user_with_relations = await user_service.get_user_with_relations(current_user.id)
    if not user_with_relations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь с ID {current_user.id} не найден"
        )
    return user_with_relations

# Получить пользователя по ID (только для супер-админа)
@router.get("/{user_id}", response_model=UserWithRelations)
async def get_user(
    user_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получение пользователя по ID"""
    logger.info(f"GET /users/{user_id} requested by user {current_user.id}")
    user_service = service_factory.get('user')
    
    # Только супер-админ может просматривать других пользователей
    if user_id != current_user.id:
        # Здесь нужно добавить проверку на супер-админа
        # await ensure_user_is_super_admin_global(session, current_user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для просмотра другого пользователя"
        )
    
    user = await user_service.get_user_with_relations(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь с ID {user_id} не найден"
        )
    return user

# Создать нового пользователя (регистрация)
@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    service_factory: ServiceFactory = Depends(get_service_factory)
):
    """Создание нового пользователя"""
    logger.info(f"POST /users - creating new user with login: {user_data.login}")
    user_service = service_factory.get('user')
    
    try:
        return await user_service.create_user(user_data)
    except UserAlreadyExistsError as e:
        logger.warning(f"User creation failed: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserCreationError as e:
        logger.error(f"User creation error: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

@router.put("/me", response_model=UserRead)
async def update_current_user(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory)
):
    """
    Обновление профиля текущего пользователя.
    Позволяет пользователю изменять свои данные без указания ID.
    """
    logger.info(f"PUT /users/me - updating profile for user {current_user.id}")
    user_service = service_factory.get('user')
    
    try:
        updated_user = await user_service.update_user(
            user_id=current_user.id,
            user_update=user_data,
            current_user_id=current_user.id
        )
        return updated_user
    except UserNotFoundError as e:
        logger.error(f"User {current_user.id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except UserAlreadyExistsError as e:
        logger.warning(f"Update failed - duplicate data: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserUpdateError as e:
        logger.error(f"Update error: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )

# Обновить пользователя
@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Обновление пользователя"""
    logger.info(f"PUT /users/{user_id} by user {current_user.id}")
    user_service = service_factory.get('user')
    
    try:
        return await user_service.update_user(user_id, user_data, current_user.id)
    except UserNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except (UserAlreadyExistsError, UserUpdateError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )

@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory)
):
    """
    Удаление аккаунта текущего пользователя.
    Полностью удаляет пользователя и все связанные данные.
    """
    logger.info(f"DELETE /users/me - deleting account for user {current_user.id}")
    user_service = service_factory.get('user')
    
    try:
        deleted = await user_service.delete_user(
            user_id=current_user.id,
            current_user_id=current_user.id
        )
        if not deleted:
            logger.warning(f"User {current_user.id} not found for deletion")
            raise UserNotFoundError(user_id=current_user.id)
        
        logger.info(f"User {current_user.id} successfully deleted their account")
        return {"detail": "Аккаунт успешно удален"}
        
    except UserNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except UserDeleteError as e:
        logger.error(f"Delete error: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Unexpected error during account deletion: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка сервера при удалении аккаунта"
        )

# Удалить пользователя
@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Удаление пользователя"""
    logger.info(f"DELETE /users/{user_id} by user {current_user.id}")
    user_service = service_factory.get('user')
    
    try:
        deleted = await user_service.delete_user(user_id, current_user.id)
        if not deleted:
            raise UserNotFoundError(user_id=user_id)
        return {"detail": "Пользователь успешно удален"}
    except UserNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except UserDeleteError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )