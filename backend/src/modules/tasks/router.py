from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskRead, TaskUpdate, TaskReadWithRelations
from . import service as tasks_service
from .exceptions import (
    TaskNotFoundError,
    TaskCreationError,
    TaskUpdateError,
    TaskDeleteError,
    ProjectNotFoundError,
    GroupNotFoundError,
    GroupNotInProjectError,
    UsersNotInGroupError,
    UsersNotInTaskError,
    TaskNoGroupError,
    TaskAccessDeniedError
)

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[TaskRead])
async def get_tasks(session: AsyncSession = Depends(db_session.session_getter)):
    return await tasks_service.get_all_tasks(session)

@router.get("/my", response_model=list[TaskReadWithRelations])
async def get_my_tasks(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.get_user_tasks(session, current_user.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить задачи пользователя: {str(e)}"
        )
    
@router.get("/team", response_model=list[TaskReadWithRelations])
async def get_team_tasks(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.get_team_tasks(session, current_user.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить задачи команды: {str(e)}"
        )

@router.get("/{task_id}", response_model=TaskReadWithRelations)
async def get_task(
    task_id: int,
    session: AsyncSession = Depends(db_session.session_getter)
):
    try:
        task = await tasks_service.get_task_by_id(session, task_id)
        return task
    except TaskNotFoundError as e:
        raise e

@router.post("/", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    task_data: TaskCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.create_task(session, task_data, current_user)
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskCreationError) as e:
        raise e

@router.post("/{task_id}/add_users", response_model=TaskReadWithRelations)
async def add_users_to_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        task = await tasks_service.add_users_to_task(session, task_id, data, current_user)
        return task
    except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError, TaskUpdateError) as e:
        raise e

@router.put("/{task_id}", response_model=TaskRead)
async def update_task_by_id(
    task_id: int,
    task_data: TaskUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        db_task = await tasks_service.get_task_by_id(session, task_id)
        return await tasks_service.update_task(session, db_task, task_data, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        raise e

@router.delete("/{task_id}/remove_users", status_code=status.HTTP_200_OK)
async def remove_users_from_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_task = await tasks_service.remove_users_from_task(session, task_id, data, current_user)
        if updated_task is None:
            return {"detail": "Задача удалена, так как нет assignees"}
        return updated_task
    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError, TaskUpdateError) as e:
        raise e

@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task_by_id(
    task_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        deleted = await tasks_service.delete_task(session, task_id, current_user)
        if not deleted:
            raise TaskNotFoundError(task_id)
        return {"detail": "Задача успешно удалена"}
    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, TaskDeleteError) as e:
        raise e