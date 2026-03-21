from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from shared.dependencies import check_user_in_group, get_service_factory
from core.database.models import User, TaskStatus, TaskPriority
from modules.auth.dependencies import get_current_user
from core.database.session import db_session
from core.services import ServiceFactory
from core.logger import logger
from .service import TaskService
from .schemas import (
    AddRemoveUsersToTask, TaskCreate, TaskCreateExtended, TaskRead, 
    TaskUpdate, TaskReadWithRelations, TaskBulkUpdate, BoardViewRequest,
    TaskHistoryRead
)
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
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /tasks requested by user {current_user.id}")
    task_service = service_factory.get('task')
    return await task_service.get_all_tasks(current_user.id)

# Получить задачи текущего пользователя
@router.get("/my", response_model=list[TaskReadWithRelations])
async def get_my_tasks(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /tasks/my requested by user {current_user.id}")
    try:
        task_service = service_factory.get('task')
        return await task_service.get_user_tasks(current_user.id)
    except Exception as e:
        logger.error(f"Error getting user tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить задачи пользователя: {str(e)}"
        )
    
# Получить задачи команд (где пользователь администратор)
@router.get("/team", response_model=list[TaskReadWithRelations])
async def get_team_tasks(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /tasks/team requested by user {current_user.id}")
    try:
        task_service = service_factory.get('task')
        return await task_service.get_team_tasks(current_user.id)
    except Exception as e:
        logger.error(f"Error getting team tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить задачи команды: {str(e)}"
        )

# Получить информацию о задаче (только для участников группы задачи)
@router.get("/{task_id}", response_model=TaskReadWithRelations)
async def get_task(
    task_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"GET /tasks/{task_id} requested by user {current_user.id}")
    
    try:
        task_service = service_factory.get('task')
        task = await task_service.get_task_by_id(task_id)
        
        if not await check_user_in_group(session, current_user.id, task.group_id):
            logger.warning(f"User {current_user.id} tried to access task {task_id} without permission")
            raise TaskAccessDeniedError("Нет доступа к задаче")
            
        return task
    except (TaskNotFoundError, TaskAccessDeniedError) as e:
        logger.error(f"Error getting task {task_id}: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Создать новую задачу
@router.post("/", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    task_data: TaskCreate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /tasks - creating new task '{task_data.title}' by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.create_task(task_data, current_user)
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskCreationError, TaskAccessDeniedError) as e:
        logger.error(f"Error creating task: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )
    
# Создать задачу для указанных пользователей
@router.post("/create_for_users", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_task_for_users(
    task_data: TaskCreateExtended,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /tasks/create_for_users by user {current_user.id}")
    
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
        
        task_service = service_factory.get('task')
        return await task_service.create_task_for_users(
            base_task_data,
            task_data.assignee_ids,
            current_user
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, 
            TaskCreationError, TaskAccessDeniedError, UsersNotInGroupError) as e:
        logger.error(f"Error creating task for users: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Добавить пользователей в задачу (только для исполнителей или администраторов)
@router.post("/{task_id}/add_users", response_model=TaskReadWithRelations)
async def add_users_to_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /tasks/{task_id}/add_users by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        task = await task_service.add_users_to_task(task_id, data, current_user)
        return task
    except (TaskNotFoundError, TaskAccessDeniedError, UsersNotInGroupError, TaskUpdateError) as e:
        logger.error(f"Error adding users to task {task_id}: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Обновить задачу (только для исполнителей или администраторов)
@router.put("/{task_id}", response_model=TaskRead)
async def update_task_by_id(
    task_id: int,
    task_data: TaskUpdate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /tasks/{task_id} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        db_task = await task_service.get_task_by_id(task_id)
        return await task_service.update_task(db_task, task_data, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        logger.error(f"Error updating task {task_id}: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Удалить пользователей из задачи (только для исполнителей или администраторов)
@router.delete("/{task_id}/remove_users", status_code=status.HTTP_200_OK)
async def remove_users_from_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /tasks/{task_id}/remove_users by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        result = await task_service.remove_users_from_task(task_id, data, current_user)
        return result
    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, UsersNotInTaskError, TaskUpdateError) as e:
        logger.error(f"Error removing users from task {task_id}: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Удалить задачу (только для исполнителей или администраторов)
@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task_by_id(
    task_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"DELETE /tasks/{task_id} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        deleted = await task_service.delete_task(task_id, current_user)
        if not deleted:
            logger.warning(f"Task {task_id} not found for deletion")
            raise TaskNotFoundError(task_id)
        logger.info(f"Task {task_id} deleted successfully")
        return {"detail": "Задача успешно удалена"}
    except (TaskNotFoundError, TaskNoGroupError, TaskAccessDeniedError, TaskDeleteError) as e:
        logger.error(f"Error deleting task {task_id}: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )
    
# Получить задачи для Kanban доски проекта
@router.get("/board/project/{project_id}", response_model=List[TaskReadWithRelations])
async def get_project_board(
    project_id: int,
    group_id: int = Query(..., description="ID группы"),
    view_mode: str = Query("team", description="Режим просмотра: team или personal"),
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"GET /tasks/board/project/{project_id}?group_id={group_id}&view_mode={view_mode} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.get_project_board_tasks(
            project_id, group_id, view_mode, current_user
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError, TaskAccessDeniedError) as e:
        logger.error(f"Error getting board: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Unexpected error getting board: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось загрузить доску проекта: {str(e)}"
        )

# Обновить статус задачи
@router.put("/{task_id}/status", response_model=TaskRead)
async def update_task_status(
    task_id: int,
    status_update: TaskStatus,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /tasks/{task_id}/status to {status_update.value} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.update_task_status(task_id, status_update, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        logger.error(f"Error updating task status: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Обновить позицию задачи в колонке
@router.put("/{task_id}/position", response_model=TaskRead)
async def update_task_position(
    task_id: int,
    position: int = Query(..., ge=0, description="Новая позиция в колонке"),
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /tasks/{task_id}/position to {position} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.update_task_position(task_id, position, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        logger.error(f"Error updating task position: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Обновить приоритет задачи
@router.put("/{task_id}/priority", response_model=TaskRead)
async def update_task_priority(
    task_id: int,
    priority_update: TaskPriority,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PUT /tasks/{task_id}/priority to {priority_update.value} by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.update_task_priority(task_id, priority_update, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        logger.error(f"Error updating task priority: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Массовое обновление задач (для drag & drop)
@router.post("/bulk_update", response_model=List[TaskRead])
async def bulk_update_tasks(
    updates: List[TaskBulkUpdate],
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /tasks/bulk_update with {len(updates)} updates by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.bulk_update_tasks(updates, current_user)
    except (TaskNotFoundError, TaskAccessDeniedError, TaskUpdateError) as e:
        logger.error(f"Error in bulk update: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Получить историю изменений задачи
@router.get("/{task_id}/history", response_model=List[TaskHistoryRead])
async def get_task_history(
    task_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"GET /tasks/{task_id}/history by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        task = await task_service.get_task_by_id(task_id)
        
        if not await check_user_in_group(session, current_user.id, task.group_id):
            logger.warning(f"User {current_user.id} tried to access history of task {task_id} without permission")
            raise TaskAccessDeniedError("Нет доступа к истории задачи")
            
        return await task_service.get_task_history(task_id)
    except (TaskNotFoundError, TaskAccessDeniedError) as e:
        logger.error(f"Error getting task history: {e.detail}")
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail
        )

# Быстрое создание задачи
@router.post("/quick_create", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def quick_create_task(
    task_data: TaskCreate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"POST /tasks/quick_create by user {current_user.id}")
    task_service = service_factory.get('task')
    
    try:
        return await task_service.quick_create_task(task_data, current_user)
    except TaskCreationError as e:
        logger.error(f"Error in quick create task: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except (ProjectNotFoundError, GroupNotFoundError, GroupNotInProjectError) as e:
        logger.error(f"Error in quick create task: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except TaskAccessDeniedError as e:
        logger.error(f"Access denied in quick create task: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Unexpected error in quick create task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось быстро создать задачу"
        )