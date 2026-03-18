from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import Project, User
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from core.logger import logger
from .service import ProjectService
from .schemas import AddGroupsToProject, ProjectCreate, ProjectRead, ProjectUpdate, ProjectReadWithRelations, RemoveGroupsFromProject
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
    logger.info(f"GET /projects requested by user {current_user.id}")
    project_service = ProjectService(session)
    return await project_service.get_all_projects(current_user.id)

# Получить проекты текущего пользователя
@router.get("/my", response_model=list[ProjectReadWithRelations])
async def get_my_projects(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /projects/my requested by user {current_user.id}")
    project_service = ProjectService(session)
    return await project_service.get_user_projects(current_user.id)

# Получить информацию о проекте (только для участников групп проекта)
@router.get("/{project_id}", response_model=ProjectReadWithRelations)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /projects/{project_id} requested by user {current_user.id}")
    
    from core.utils.dependencies import check_user_in_project
    if not await check_user_in_project(session, current_user.id, project_id):
        logger.warning(f"User {current_user.id} tried to access project {project_id} without permission")
        raise InsufficientProjectPermissionsError("Нет доступа к проекту")
    
    try:
        project_service = ProjectService(session)
        project = await project_service.get_project_by_id(project_id)
        return project
    except ProjectNotFoundError as e:
        logger.error(f"Project {project_id} not found")
        raise e

# Создать новый проект
@router.post("/", response_model=ProjectReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    project_data: ProjectCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /projects - creating new project '{project_data.title}' by user {current_user.id}")
    project_service = ProjectService(session)
    
    try:
        return await project_service.create_project(project_data, current_user)
    except (GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectCreationError) as e:
        logger.error(f"Error creating project: {e.detail}")
        raise e

# Добавить группы в проект (только для администраторов групп)
@router.post("/{project_id}/add_groups", response_model=ProjectReadWithRelations)
async def add_groups_to_project_route(
    project_id: int,
    data: AddGroupsToProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /projects/{project_id}/add_groups by user {current_user.id}")
    project_service = ProjectService(session)
    
    try:
        updated_project = await project_service.add_groups_to_project(project_id, data, current_user)
        return updated_project
    except (ProjectNotFoundError, GroupsNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        logger.error(f"Error adding groups to project {project_id}: {e.detail}")
        raise e

# Обновить проект
@router.put("/{project_id}", response_model=ProjectReadWithRelations)
async def update_project_by_id(
    project_id: int,
    project_data: ProjectUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user),
):
    logger.info(f"PUT /projects/{project_id} by user {current_user.id}")
    project_service = ProjectService(session)
    
    try:
        stmt = (
            select(Project)
            .options(selectinload(Project.groups))
            .where(Project.id == project_id)
        )
        result = await session.execute(stmt)
        db_project = result.scalar_one_or_none()

        if not db_project:
            logger.warning(f"Project {project_id} not found")
            raise ProjectNotFoundError(project_id)

        return await project_service.update_project(db_project, project_data, current_user)

    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectUpdateError) as e:
        logger.error(f"Error updating project {project_id}: {e.detail}")
        raise e

# Удалить группы из проекта (только для администраторов групп)
@router.delete("/{project_id}/remove_groups", response_model=ProjectReadWithRelations)
async def remove_groups_from_project_route(
    project_id: int,
    data: RemoveGroupsFromProject,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /projects/{project_id}/remove_groups by user {current_user.id}")
    project_service = ProjectService(session)
    
    try:
        updated_project = await project_service.remove_groups_from_project(project_id, data, current_user)
        return updated_project
    except (ProjectNotFoundError, GroupsNotInProjectError, InsufficientProjectPermissionsError, ProjectUpdateError, ProjectDeleteError) as e:
        logger.error(f"Error removing groups from project {project_id}: {e.detail}")
        raise e

# Удалить проект (только для администраторов групп проекта)
@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_by_id(
    project_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /projects/{project_id} by user {current_user.id}")
    project_service = ProjectService(session)
    
    try:
        deleted = await project_service.delete_project(project_id, current_user)
        if not deleted:
            logger.warning(f"Project {project_id} not found for deletion")
            raise ProjectNotFoundError(project_id)
        logger.info(f"Project {project_id} deleted successfully")
        return {"detail": "Проект успешно удалён"}
    except (ProjectNotFoundError, InsufficientProjectPermissionsError, ProjectDeleteError) as e:
        logger.error(f"Error deleting project {project_id}: {e.detail}")
        raise e