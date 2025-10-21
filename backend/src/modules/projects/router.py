from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import Project, User
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

# Получить все проекты (только для супер-админа)
@router.get("/", response_model=list[ProjectRead])
async def get_projects(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    return await projects_service.get_all_projects(session, current_user.id)

# Получить проекты текущего пользователя
@router.get("/my", response_model=list[ProjectReadWithRelations])
async def get_my_projects(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    return await projects_service.get_user_projects(session, current_user.id)

# Получить информацию о проекте (только для участников групп проекта)
@router.get("/{project_id}", response_model=ProjectReadWithRelations)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    from core.utils.dependencies import check_user_in_project
    if not await check_user_in_project(session, current_user.id, project_id):
        raise InsufficientProjectPermissionsError("Нет доступа к проекту")
    
    try:
        project = await projects_service.get_project_by_id(session, project_id)
        return project
    except ProjectNotFoundError as e:
        raise e

# Создать новый проект
@router.post("/", response_model=ProjectReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    project_data: ProjectCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await projects_service.create_project(session, project_data, current_user)
    except (GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectCreationError) as e:
        raise e

# Добавить группы в проект (только для администраторов групп)
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
    except (ProjectNotFoundError, GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        raise e

# Обновить проект
@router.put("/{project_id}", response_model=ProjectReadWithRelations)
async def update_project_by_id(
    project_id: int,
    project_data: ProjectUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user),
):
    try:
        stmt = (
            select(Project)
            .options(selectinload(Project.groups))
            .where(Project.id == project_id)
        )
        result = await session.execute(stmt)
        db_project = result.scalar_one_or_none()

        if not db_project:
            raise ProjectNotFoundError(project_id)

        return await projects_service.update_project(session, db_project, project_data, current_user)

    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        raise e

# Удалить группы из проекта (только для администраторов групп)
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
    except (ProjectNotFoundError, GroupsNotInProjectError, InsufficientProjectPermissionsError, ProjectUpdateError, ProjectDeleteError) as e:
        raise e

# Удалить проект (только для администраторов групп проекта)
@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_by_id(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        deleted = await projects_service.delete_project(session, project_id, current_user)
        if not deleted:
            raise ProjectNotFoundError(project_id)
        return {"detail": "Проект успешно удалён"}
    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectDeleteError) as e:
        raise e