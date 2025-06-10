from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.security.dependencies import get_current_user
from core.database import db_session
from .schemas import GroupCreate, GroupRead, GroupUpdate
from . import service as projects_service

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[GroupRead])
async def get_groups(session: AsyncSession = Depends(db_session.session_getter)):
    return await projects_service.get_all_groups(session)


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(group_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    group = await projects_service.get_group_by_id(session, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    return group


@router.post("/", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(group_data: GroupCreate, session: AsyncSession = Depends(db_session.session_getter)):
    return await projects_service.create_group(session, group_data)


@router.put("/{group_id}", response_model=GroupRead)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    db_group = await projects_service.get_group_by_id(session, group_id)
    if not db_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")

    return await projects_service.update_group(session, db_group, group_data)


@router.delete("/{group_id}", status_code=200)
async def delete_group_by_id(group_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    deleted = await projects_service.delete_group(session, group_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    return {"detail": "Группа успешно удалена"}