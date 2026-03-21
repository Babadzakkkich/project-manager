from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from shared.dependencies import check_user_in_group, get_service_factory
from core.database.models import User
from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from core.logger import logger
from .service import GroupService
from .schemas import AddUsersToGroup, GetUserRoleResponse, GroupCreate, GroupRead, GroupUpdate, GroupReadWithRelations, RemoveUsersFromGroup, UserWithRoleSchema
from .exceptions import (
    GroupNotFoundError,
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupUpdateError,
    GroupDeleteError,
    UserNotInGroupError,
    UserAlreadyInGroupError,
    UserNotFoundInGroupError,
    UsersNotFoundError,
    InsufficientPermissionsError,
    InvalidRoleError
)

router = APIRouter(dependencies=[Depends(get_current_user)])

# Получить все группы (только для супер-админа)
@router.get("/", response_model=list[GroupReadWithRelations])
async def get_all_groups(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /groups requested by user {current_user.id}")
    group_service = service_factory.get('group')
    return await group_service.get_all_groups(current_user.id)

# Получить группы текущего пользователя
@router.get("/my", response_model=list[GroupReadWithRelations])
async def get_groups(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /groups/my requested by user {current_user.id}")
    group_service = service_factory.get('group')
    return await group_service.get_user_groups(current_user.id)

# Получить информацию о группе (только для участников группы)
@router.get("/{group_id}", response_model=GroupReadWithRelations)
async def get_group(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"GET /groups/{group_id} requested by user {current_user.id}")
    
    if not await check_user_in_group(session, current_user.id, group_id):
        logger.warning(f"User {current_user.id} tried to access group {group_id} without membership")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Пользователь с ID {current_user.id} не состоит в группе {group_id}"
        )
    
    try:
        group_service = service_factory.get('group')
        group = await group_service.get_group_by_id(group_id)
        return group
    except GroupNotFoundError as e:
        logger.error(f"Group {group_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )

# Получить свою роль в группе
@router.get("/{group_id}/my_role", response_model=GetUserRoleResponse)
async def get_my_role_in_group(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /groups/{group_id}/my_role requested by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        return await group_service.get_role_for_user_in_group(current_user.id, group_id)
    except UserNotInGroupError as e:
        logger.warning(f"User {current_user.id} not in group {group_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )

# Создать новую группу
@router.post("/", response_model=GroupReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_group(
    group_data: GroupCreate, 
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /groups - creating new group '{group_data.name}' by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        return await group_service.create_group(group_data, current_user)
    except GroupAlreadyExistsError as e:
        logger.error(f"Error creating group: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except GroupCreationError as e:
        logger.error(f"Error creating group: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Добавить пользователей в группу (только для администраторов группы)
@router.post("/{group_id}/add_users", response_model=GroupReadWithRelations)
async def add_users_to_group(
    group_id: int,
    data: AddUsersToGroup,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /groups/{group_id}/add_users by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        updated_group = await group_service.add_users_to_group(group_id, data, current_user)
        return updated_group
    except GroupNotFoundError as e:
        logger.error(f"Error adding users to group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error adding users to group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except UsersNotFoundError as e:
        logger.error(f"Error adding users to group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except UserAlreadyInGroupError as e:
        logger.error(f"Error adding users to group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except (InvalidRoleError, GroupUpdateError) as e:
        logger.error(f"Error adding users to group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Обновить информацию о группе (только для администраторов группы)
@router.put("/{group_id}", response_model=GroupReadWithRelations)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"PUT /groups/{group_id} by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        db_group = await group_service.get_group_by_id(group_id)
        return await group_service.update_group(db_group, group_data, current_user)
    except GroupNotFoundError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupAlreadyExistsError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except GroupUpdateError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Изменить роль пользователя в группе (только для администраторов группы)
@router.put("/{group_id}/change_role", status_code=status.HTTP_200_OK)
async def change_user_role_in_group(
    group_id: int,
    request: UserWithRoleSchema,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /groups/{group_id}/change_role by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        await group_service.change_user_role(
            current_user_id=current_user.id,
            group_id=group_id,
            user_email=request.user_email,
            new_role=request.role
        )
        return {"detail": "Роль успешно изменена"}
    except InsufficientPermissionsError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except InvalidRoleError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserNotFoundInGroupError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupUpdateError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Удалить пользователей из группы (только для администраторов группы)
@router.delete("/{group_id}/remove_users", response_model=GroupReadWithRelations)
async def remove_users_from_group(
    group_id: int,
    data: RemoveUsersFromGroup,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /groups/{group_id}/remove_users by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        updated_group = await group_service.remove_users_from_group(group_id, data, current_user)
        return updated_group
    except GroupNotFoundError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except UserNotFoundInGroupError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except (GroupUpdateError, GroupDeleteError) as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Удалить группу (только для администраторов группы)
@router.delete("/{group_id}", status_code=status.HTTP_200_OK)
async def delete_group_by_id(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /groups/{group_id} by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        deleted = await group_service.delete_group(group_id, current_user)
        if not deleted:
            logger.warning(f"Group {group_id} not found for deletion")
            raise GroupNotFoundError(group_id=group_id)
        logger.info(f"Group {group_id} deleted successfully")
        return {"detail": "Группа успешно удалена"}
    except GroupNotFoundError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except GroupDeleteError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )