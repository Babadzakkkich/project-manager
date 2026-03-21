from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import Project, User
from shared.dependencies import check_user_in_project, get_service_factory
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from core.services import ServiceFactory
from core.logger import logger
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
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /projects requested by user {current_user.id}")
    project_service = service_factory.get('project')
    return await project_service.get_all_projects(current_user.id)

# Получить проекты текущего пользователя
@router.get("/my", response_model=list[ProjectReadWithRelations])
async def get_my_projects(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /projects/my requested by user {current_user.id}")
    project_service = service_factory.get('project')
    return await project_service.get_user_projects(current_user.id)

# Получить информацию о проекте (только для участников групп проекта)
@router.get("/{project_id}", response_model=ProjectReadWithRelations)
async def get_project(
    project_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"GET /projects/{project_id} requested by user {current_user.id}")
    
    if not await check_user_in_project(session, current_user.id, project_id):
        logger.warning(f"User {current_user.id} tried to access project {project_id} without permission")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к проекту"
        )
    
    try:
        project_service = service_factory.get('project')
        project = await project_service.get_project_by_id(project_id)
        return project
    except ProjectNotFoundError as e:
        logger.error(f"Project {project_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )

# Создать новый проект
@router.post("/", response_model=ProjectReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    project_data: ProjectCreate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /projects - creating new project '{project_data.title}' by user {current_user.id}")
    project_service = service_factory.get('project')
    
    try:
        return await project_service.create_project(project_data, current_user)
    except GroupsNotFoundError as e:
        logger.error(f"Error creating project: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientProjectPermissionsError as e:
        logger.error(f"Error creating project: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except ProjectCreationError as e:
        logger.error(f"Error creating project: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Добавить группы в проект (только для администраторов групп)
@router.post("/{project_id}/add_groups", response_model=ProjectReadWithRelations)
async def add_groups_to_project_route(
    project_id: int,
    data: AddGroupsToProject,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /projects/{project_id}/add_groups by user {current_user.id}")
    project_service = service_factory.get('project')
    
    try:
        updated_project = await project_service.add_groups_to_project(project_id, data, current_user)
        return updated_project
    except ProjectNotFoundError as e:
        logger.error(f"Error adding groups to project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupsNotFoundError as e:
        logger.error(f"Error adding groups to project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientProjectPermissionsError as e:
        logger.error(f"Error adding groups to project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except ProjectUpdateError as e:
        logger.error(f"Error adding groups to project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Обновить проект
@router.put("/{project_id}", response_model=ProjectReadWithRelations)
async def update_project_by_id(
    project_id: int,
    project_data: ProjectUpdate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"PUT /projects/{project_id} by user {current_user.id}")
    project_service = service_factory.get('project')
    
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

    except ProjectNotFoundError as e:
        logger.error(f"Error updating project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientProjectPermissionsError as e:
        logger.error(f"Error updating project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except ProjectUpdateError as e:
        logger.error(f"Error updating project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Удалить группы из проекта (только для администраторов групп)
@router.delete("/{project_id}/remove_groups", response_model=ProjectReadWithRelations)
async def remove_groups_from_project_route(
    project_id: int,
    data: RemoveGroupsFromProject,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /projects/{project_id}/remove_groups by user {current_user.id}")
    project_service = service_factory.get('project')
    
    try:
        updated_project = await project_service.remove_groups_from_project(project_id, data, current_user)
        return updated_project
    except ProjectNotFoundError as e:
        logger.error(f"Error removing groups from project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupsNotInProjectError as e:
        logger.error(f"Error removing groups from project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientProjectPermissionsError as e:
        logger.error(f"Error removing groups from project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except (ProjectUpdateError, ProjectDeleteError) as e:
        logger.error(f"Error removing groups from project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )

# Удалить проект (только для администраторов групп проекта)
@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_by_id(
    project_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /projects/{project_id} by user {current_user.id}")
    project_service = service_factory.get('project')
    
    try:
        deleted = await project_service.delete_project(project_id, current_user)
        if not deleted:
            logger.warning(f"Project {project_id} not found for deletion")
            raise ProjectNotFoundError(project_id)
        logger.info(f"Project {project_id} deleted successfully")
        return {"detail": "Проект успешно удалён"}
    except ProjectNotFoundError as e:
        logger.error(f"Error deleting project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientProjectPermissionsError as e:
        logger.error(f"Error deleting project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except ProjectDeleteError as e:
        logger.error(f"Error deleting project {project_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )