from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from .schemas import AddUsersToGroup, GetUserRoleResponse, GroupCreate, GroupRead, GroupUpdate, GroupReadWithRelations, RemoveUsersFromGroup, UserWithRoleSchema
from . import service as groups_service
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

@router.get("/", response_model=list[GroupReadWithRelations])
async def get_all_groups(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить все группы (только для супер-админа)"""
    return await groups_service.get_all_groups(session, current_user.id)

@router.get("/my", response_model=list[GroupReadWithRelations])
async def get_groups(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить группы текущего пользователя"""
    return await groups_service.get_user_groups(session, current_user.id)

@router.get("/{group_id}", response_model=GroupReadWithRelations)
async def get_group(
    group_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить информацию о группе (только для участников группы)"""
    # Проверяем, что пользователь состоит в группе
    from core.utils.dependencies import check_user_in_group
    if not await check_user_in_group(session, current_user.id, group_id):
        raise UserNotInGroupError(user_id=current_user.id, group_id=group_id)
    
    try:
        group = await groups_service.get_group_by_id(session, group_id)
        return group
    except GroupNotFoundError as e:
        raise e

@router.get("/{group_id}/my_role", response_model=GetUserRoleResponse)
async def get_my_role_in_group(
    group_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить свою роль в группе"""
    try:
        return await groups_service.get_role_for_user_in_group(session, current_user.id, group_id)
    except UserNotInGroupError as e:
        raise e

@router.post("/", response_model=GroupReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_group(
    group_data: GroupCreate, 
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Создать новую группу"""
    try:
        return await groups_service.create_group(session, group_data, current_user)
    except (GroupAlreadyExistsError, GroupCreationError) as e:
        raise e

@router.post("/{group_id}/add_users", response_model=GroupReadWithRelations)
async def add_users_to_group(
    group_id: int,
    data: AddUsersToGroup,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Добавить пользователей в группу (только для администраторов группы)"""
    try:
        updated_group = await groups_service.add_users_to_group(session, group_id, data, current_user)
        return updated_group
    except (
        GroupNotFoundError,
        InsufficientPermissionsError,
        UsersNotFoundError,
        UserAlreadyInGroupError,
        InvalidRoleError,
        GroupUpdateError
    ) as e:
        raise e

@router.put("/{group_id}", response_model=GroupReadWithRelations)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Обновить информацию о группе (только для администраторов группы)"""
    try:
        db_group = await groups_service.get_group_by_id(session, group_id)
        return await groups_service.update_group(session, db_group, group_data, current_user)
    except (
        GroupNotFoundError,
        GroupAlreadyExistsError,
        InsufficientPermissionsError,
        GroupUpdateError
    ) as e:
        raise e

@router.put("/{group_id}/change_role", status_code=status.HTTP_200_OK)
async def change_user_role_in_group(
    group_id: int,
    request: UserWithRoleSchema,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Изменить роль пользователя в группе (только для администраторов группы)"""
    try:
        await groups_service.change_user_role(
            session=session,
            current_user_id=current_user.id,
            group_id=group_id,
            user_email=request.user_email,
            new_role=request.role
        )
        return {"detail": "Роль успешно изменена"}
    except (
        InsufficientPermissionsError,
        InvalidRoleError,
        UserNotFoundInGroupError,
        GroupUpdateError
    ) as e:
        raise e

@router.delete("/{group_id}/remove_users", response_model=GroupReadWithRelations)
async def remove_users_from_group(
    group_id: int,
    data: RemoveUsersFromGroup,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Удалить пользователей из группы (только для администраторов группы)"""
    try:
        updated_group = await groups_service.remove_users_from_group(session, group_id, data, current_user)
        return updated_group
    except (
        GroupNotFoundError,
        InsufficientPermissionsError,
        UserNotFoundInGroupError,
        GroupUpdateError,
        GroupDeleteError
    ) as e:
        raise e

@router.delete("/{group_id}", status_code=status.HTTP_200_OK)
async def delete_group_by_id(
    group_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Удалить группу (только для администраторов группы)"""
    try:
        deleted = await groups_service.delete_group(session, group_id, current_user)
        if not deleted:
            raise GroupNotFoundError(group_id=group_id)
        return {"detail": "Группа успешно удалена"}
    except (
        GroupNotFoundError,
        InsufficientPermissionsError,
        GroupDeleteError
    ) as e:
        raise e