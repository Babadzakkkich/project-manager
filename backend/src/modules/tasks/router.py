from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import db_session
from .schemas import TaskCreate, TaskRead, TaskUpdate, TaskReadWithRelations
from . import service as tasks_service

router = APIRouter()

@router.get("/", response_model=list[TaskRead])
async def get_tasks(session: AsyncSession = Depends(db_session.session_getter)):
    return await tasks_service.get_all_tasks(session)


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    task = await tasks_service.get_task_by_id(session, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


@router.post("/", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    task_data: TaskCreate,
    session: AsyncSession = Depends(db_session.session_getter),
):
    return await tasks_service.create_task(session, task_data)


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


@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task_by_id(task_id: int, session: AsyncSession = Depends(db_session.session_getter)):
    deleted = await tasks_service.delete_task(session, task_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return {"detail": "Задача успешно удалена"}