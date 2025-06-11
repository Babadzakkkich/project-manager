from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

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
async def create_new_group(group_data: GroupCreate, session: AsyncSession = Depends(db_session.session_getter)):
    try:
        return await groups_service.create_group(session, group_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/{group_id}/add_users", response_model=GroupReadWithRelations)
async def add_users_to_group_route(
    group_id: int,
    data: AddUsersToGroup,
    session: AsyncSession = Depends(db_session.session_getter)
):
    try:
        updated_group = await groups_service.add_users_to_group(session, group_id, data)
        return updated_group
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{group_id}", response_model=GroupRead)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    db_group = await groups_service.get_group_by_id(session, group_id)
    if not db_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")

    return await groups_service.update_group(session, db_group, group_data)

@router.delete("/{group_id}/remove_users", response_model=GroupReadWithRelations)
async def remove_users_from_group_route(
    group_id: int,
    data: RemoveUsersFromGroup,
    session: AsyncSession = Depends(db_session.session_getter)
):
    try:
        updated_group = await groups_service.remove_users_from_group(session, group_id, data)
        return updated_group
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{group_id}", status_code=200)
async def delete_group_by_id(group_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    deleted = await groups_service.delete_group(session, group_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    return {"detail": "Группа успешно удалена"}