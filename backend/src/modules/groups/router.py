from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.security.dependencies import get_current_user
from core.database.session import db_session
from .schemas import AddUsersToGroup, GroupCreate, GroupRead, GroupUpdate, GroupReadWithRelations, RemoveUsersFromGroup
from . import service as groups_service

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[GroupRead])
async def get_groups(session: AsyncSession = Depends(db_session.session_getter)):
    return await groups_service.get_all_groups(session)


@router.get("/{group_id}", response_model=GroupReadWithRelations)
async def get_group(group_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    group = await groups_service.get_group_by_id(session, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    return group


@router.post("/", response_model=GroupReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_group(group_data: GroupCreate, 
                           session: AsyncSession = Depends(db_session.session_getter),
                           current_user: User = Depends(get_current_user)):
    try:
        return await groups_service.create_group(session, group_data, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/{group_id}/add_users", response_model=GroupReadWithRelations)
async def add_users_to_group(
    group_id: int,
    data: AddUsersToGroup,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_group = await groups_service.add_users_to_group(session, group_id, data, current_user)
        return updated_group
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.put("/{group_id}", response_model=GroupRead)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    db_group = await groups_service.get_group_by_id(session, group_id)
    if not db_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    try:
        return await groups_service.update_group(session, db_group, group_data, current_user)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail="Ошибка обновления группы")

@router.delete("/{group_id}/remove_users", response_model=GroupReadWithRelations)
async def remove_users_from_group(
    group_id: int,
    data: RemoveUsersFromGroup,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_group = await groups_service.remove_users_from_group(session, group_id, data, current_user)
        return updated_group
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail="Ошибка удаления пользователей из группы")

@router.delete("/{group_id}", status_code=200)
async def delete_group_by_id(group_id: int, session: AsyncSession = Depends(db_session.session_getter), current_user: User = Depends(get_current_user)):
    try:
        deleted = await groups_service.delete_group(session, group_id, current_user)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
        return {"detail": "Группа успешно удалена"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail="Ошибка удаления группы")