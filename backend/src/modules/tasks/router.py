from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.security.dependencies import get_current_user
from core.database.session import db_session
from .schemas import AddRemoveUsersToTask, TaskCreate, TaskRead, TaskUpdate, TaskReadWithRelations
from . import service as tasks_service

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=list[TaskRead])
async def get_tasks(session: AsyncSession = Depends(db_session.session_getter)):
    return await tasks_service.get_all_tasks(session)


@router.get("/{task_id}", response_model=TaskReadWithRelations)
async def get_task(task_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    task = await tasks_service.get_task_by_id(session, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task

@router.post("/", response_model=TaskReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_task(task_data: TaskCreate, session: AsyncSession = Depends(db_session.session_getter)):
    try:
        return await tasks_service.create_task(session, task_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/{task_id}/add_users", response_model=TaskReadWithRelations)
async def add_users_to_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    session: AsyncSession = Depends(db_session.session_getter),
):
    try:
        task = await tasks_service.add_users_to_task(session, task_id, data)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{task_id}", response_model=TaskRead)
async def update_task_by_id(
    task_id: int,
    task_data: TaskUpdate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    db_task = await tasks_service.get_task_by_id(session, task_id)
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")

    return await tasks_service.update_task(session, db_task, task_data)

@router.delete("/{task_id}/remove_users", status_code=200)
async def remove_users_from_task_route(
    task_id: int,
    data: AddRemoveUsersToTask,
    session: AsyncSession = Depends(db_session.session_getter),
):
    try:
        updated_task = await tasks_service.remove_users_from_task(session, task_id, data)
        if updated_task is None:
            return {"detail": "Задача удалена, так как нет assignees"}
        return updated_task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task_by_id(task_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    deleted = await tasks_service.delete_task(session, task_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return {"detail": "Задача успешно удалена"}