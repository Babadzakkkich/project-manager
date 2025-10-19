from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from .schemas import AddGroupsToProject, ProjectCreate, ProjectRead, ProjectUpdate, ProjectReadWithRelations, RemoveGroupsFromProject
from . import service as projects_service
from .exceptions import (
    ProjectNotFoundError,
    ProjectCreationError,
    ProjectUpdateError,
    ProjectDeleteError,
    GroupsNotFoundError,
    GroupsNotInProjectError,
    InsufficientProjectPermissionsError
)

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[ProjectRead])
async def get_projects(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить все проекты (только для супер-админа)"""
    return await projects_service.get_all_projects(session, current_user.id)

@router.get("/my", response_model=list[ProjectReadWithRelations])
async def get_my_projects(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить проекты текущего пользователя"""
    return await projects_service.get_user_projects(session, current_user.id)

@router.get("/{project_id}", response_model=ProjectReadWithRelations)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Получить информацию о проекте (только для участников групп проекта)"""
    # Проверяем, что пользователь состоит в одной из групп проекта
    from core.utils.dependencies import check_user_in_project
    if not await check_user_in_project(session, current_user.id, project_id):
        raise InsufficientProjectPermissionsError("Нет доступа к проекту")
    
    try:
        project = await projects_service.get_project_by_id(session, project_id)
        return project
    except ProjectNotFoundError as e:
        raise e

@router.post("/", response_model=ProjectReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    project_data: ProjectCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Создать новый проект"""
    try:
        return await projects_service.create_project(session, project_data, current_user)
    except (GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectCreationError) as e:
        raise e

@router.post("/{project_id}/add_groups", response_model=ProjectReadWithRelations)
async def add_groups_to_project_route(
    project_id: int,
    data: AddGroupsToProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Добавить группы в проект (только для администраторов групп)"""
    try:
        updated_project = await projects_service.add_groups_to_project(session, project_id, data, current_user)
        return updated_project
    except (ProjectNotFoundError, GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        raise e

@router.put("/{project_id}", response_model=ProjectReadWithRelations)
async def update_project_by_id(
    project_id: int,
    project_data: ProjectUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Обновить проект (только для администраторов групп проекта)"""
    try:
        db_project = await projects_service.get_project_by_id(session, project_id)
        return await projects_service.update_project(session, db_project, project_data, current_user)
    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        raise e

@router.delete("/{project_id}/remove_groups", response_model=ProjectReadWithRelations)
async def remove_groups_from_project_route(
    project_id: int,
    data: RemoveGroupsFromProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Удалить группы из проекта (только для администраторов групп)"""
    try:
        updated_project = await projects_service.remove_groups_from_project(session, project_id, data, current_user)
        return updated_project
    except (ProjectNotFoundError, GroupsNotInProjectError, InsufficientProjectPermissionsError, ProjectUpdateError, ProjectDeleteError) as e:
        raise e

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_by_id(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """Удалить проект (только для администраторов групп проекта)"""
    try:
        deleted = await projects_service.delete_project(session, project_id, current_user)
        if not deleted:
            raise ProjectNotFoundError(project_id)
        return {"detail": "Проект успешно удалён"}
    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectDeleteError) as e:
        raise e