from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.security.dependencies import get_current_user
from core.database.session import db_session

from .schemas import AddGroupsToProject, ProjectCreate, ProjectRead, ProjectUpdate, ProjectReadWithRelations, RemoveGroupsFromProject
from . import service as projects_service

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[ProjectRead])
async def get_projects(session: AsyncSession = Depends(db_session.session_getter)):
    return await projects_service.get_all_projects(session)

@router.get("/{project_id}", response_model=ProjectReadWithRelations)
async def get_project(project_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    project = await projects_service.get_project_by_id(session, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")
    return project

@router.post("/", response_model=ProjectReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    project_data: ProjectCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await projects_service.create_project(session, project_data, current_user)
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{project_id}/add_groups", response_model=ProjectReadWithRelations)
async def add_groups_to_project_route(
    project_id: int,
    data: AddGroupsToProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_project = await projects_service.add_groups_to_project(session, project_id, data, current_user)
        return updated_project
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/{project_id}", response_model=ProjectReadWithRelations)
async def update_project_by_id(
    project_id: int,
    project_data: ProjectUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    db_project = await projects_service.get_project_by_id(session, project_id)
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")

    try:
        return await projects_service.update_project(session, db_project, project_data, current_user)
    except HTTPException as e:
        raise e

@router.delete("/{project_id}/remove_groups", response_model=ProjectReadWithRelations)
async def remove_groups_from_project_route(
    project_id: int,
    data: RemoveGroupsFromProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_project = await projects_service.remove_groups_from_project(session, project_id, data, current_user)
        return updated_project
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_by_id(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    deleted = await projects_service.delete_project(session, project_id, current_user)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")
    return {"detail": "Проект успешно удалён"}