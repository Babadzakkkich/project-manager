from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.utils.dependencies import check_user_in_group
from core.database.models import User, TaskStatus, TaskPriority
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from .schemas import (
    AddRemoveUsersToTask, TaskCreate, TaskCreateExtended, TaskRead, 
    TaskUpdate, TaskReadWithRelations, TaskBulkUpdate, BoardViewRequest,
    TaskHistoryRead
)
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

# Получить все задачи (только для супер-админа)
@router.get("/", response_model=list[TaskRead])
async def get_tasks(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    return await tasks_service.get_all_tasks(session, current_user.id)

# Получить задачи текущего пользователя
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
    
# Получить задачи команд (где пользователь администратор)
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

# Получить информацию о задаче (только для участников группы задачи)
@router.get("/{task_id}", response_model=TaskReadWithRelations)
async def get_task(
    task_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        task = await tasks_service.get_task_by_id(session, task_id)
        
        from core.utils.dependencies import check_user_in_group
        if not await check_user_in_group(session, current_user.id, task.group_id):
            raise TaskAccessDeniedError("Нет доступа к задаче")
            
        return task
    except (TaskNotFoundError, TaskAccessDeniedError) as e:
        raise e

# Создать новую задачу
@router.post("/", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    task_data: TaskCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.create_task(session, task_data, current_user)
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskCreationError, TaskAccessDeniedError) as e:
        raise e
    
# Создать задачу для указанных пользователей
@router.post("/create_for_users", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_task_for_users(
    task_data: TaskCreateExtended,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        base_task_data = TaskCreate(
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            priority=task_data.priority,
            start_date=task_data.start_date,
            deadline=task_data.deadline,
            project_id=task_data.project_id,
            group_id=task_data.group_id,
            tags=task_data.tags
        )
        
        return await tasks_service.create_task_for_users(
            session, 
            base_task_data,
            task_data.assignee_ids,
            current_user
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
            TaskCreationError, TaskAccessDeniedError, UsersNotInGroupError) as e:
        raise e

# Добавить пользователей в задачу (только для исполнителей или администраторов)
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

# Обновить задачу (только для исполнителей или администраторов)
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

# Удалить пользователей из задачи (только для исполнителей или администраторов)
@router.delete("/{task_id}/remove_users", status_code=status.HTTP_200_OK)
async def remove_users_from_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        result = await tasks_service.remove_users_from_task(session, task_id, data, current_user)
        return result
    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError, TaskUpdateError) as e:
        raise e

# Удалить задачу (только для исполнителей или администраторов)
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
    
# Получить задачи для Kanban доски проекта
@router.get("/board/project/{project_id}", response_model=List[TaskReadWithRelations])
async def get_project_board(
    project_id: int,
    group_id: int = Query(..., description="ID группы"),
    view_mode: str = Query("team", description="Режим просмотра: team или personal"),
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.get_project_board_tasks(
            session, project_id, group_id, view_mode, current_user
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError) as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить доску проекта: {str(e)}"
        )

# Обновить статус задачи
@router.put("/{task_id}/status", response_model=TaskRead)
async def update_task_status(
    task_id: int,
    status_update: TaskStatus,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.update_task_status(
            session, task_id, status_update, current_user
        )
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        raise e

# Обновить позицию задачи в колонке
@router.put("/{task_id}/position", response_model=TaskRead)
async def update_task_position(
    task_id: int,
    position: int = Query(..., ge=0, description="Новая позиция в колонке"),
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.update_task_position(
            session, task_id, position, current_user
        )
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        raise e

# Обновить приоритет задачи
@router.put("/{task_id}/priority", response_model=TaskRead)
async def update_task_priority(
    task_id: int,
    priority_update: TaskPriority,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.update_task_priority(
            session, task_id, priority_update, current_user
        )
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        raise e

# Массовое обновление задач (для drag & drop)
@router.post("/bulk_update", response_model=List[TaskRead])
async def bulk_update_tasks(
    updates: List[TaskBulkUpdate],
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.bulk_update_tasks(
            session, updates, current_user
        )
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        raise e

# Получить историю изменений задачи
@router.get("/{task_id}/history", response_model=List[TaskHistoryRead])
async def get_task_history(
    task_id: int,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        task = await tasks_service.get_task_by_id(session, task_id)
        
        if not await check_user_in_group(session, current_user.id, task.group_id):
            raise TaskAccessDeniedError("Нет доступа к истории задачи")
            
        return await tasks_service.get_task_history(session, task_id)
    except (TaskNotFoundError, TaskAccessDeniedError) as e:
        raise e

# Быстрое создание задачи
@router.post("/quick_create", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def quick_create_task(
    task_data: TaskCreate,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    try:
        return await tasks_service.quick_create_task(
            session, task_data, current_user
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskCreationError, TaskAccessDeniedError) as e:
        raise e