from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.database.models import TaskPriority, TaskStatus, User
from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user
from shared.dependencies import get_service_factory
from .exceptions import AdminActionError, AdminObjectNotFoundError, AdminPermissionError
from .schemas import (
    AdminActionResult,
    AdminAuditLogRead,
    AdminGroupDetailRead,
    AdminGroupRead,
    AdminProjectDetailRead,
    AdminProjectRead,
    AdminStatsRead,
    AdminTaskDetailRead,
    AdminTaskHistoryRead,
    AdminTaskRead,
    AdminUserRead,
    UserBlockRequest,
)
from .service import AdminService

router = APIRouter()


def _map_admin_error(error: Exception) -> HTTPException:
    if isinstance(error, AdminPermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        )

    if isinstance(error, AdminObjectNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )

    if isinstance(error, AdminActionError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Ошибка административного модуля",
    )


def _get_admin_service(service_factory: ServiceFactory) -> AdminService:
    return service_factory.get("admin")


@router.get("/stats", response_model=AdminStatsRead)
async def get_admin_stats(
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Сводная статистика системы для глобального администратора."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_stats(current_user)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/users", response_model=list[AdminUserRead])
async def get_admin_users(
    q: str | None = Query(None, description="Поиск по логину, имени или email"),
    blocked: bool | None = Query(None, description="Фильтр по блокировке"),
    global_admin: bool | None = Query(None, description="Фильтр по системной роли global_admin"),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Список пользователей системы."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_users(
            actor=current_user,
            q=q,
            blocked=blocked,
            global_admin=global_admin,
        )
    except Exception as error:
        raise _map_admin_error(error) from error


@router.patch("/users/{user_id}/block", response_model=AdminUserRead)
async def block_admin_user(
    user_id: int,
    data: UserBlockRequest,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Блокировка пользователя. Физического удаления пользователей нет."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.block_user(current_user, user_id, data.reason)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.patch("/users/{user_id}/unblock", response_model=AdminUserRead)
async def unblock_admin_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Разблокировка пользователя."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.unblock_user(current_user, user_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.patch("/users/{user_id}/make-global-admin", response_model=AdminUserRead)
async def make_user_global_admin(
    user_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Назначение пользователя глобальным администратором.

    Обратного endpoint для снятия global_admin намеренно нет.
    """
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.make_global_admin(current_user, user_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/groups", response_model=list[AdminGroupRead])
async def get_admin_groups(
    q: str | None = Query(None, description="Поиск по названию или описанию группы"),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Просмотр всех групп системы."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_groups(current_user, q=q)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/groups/{group_id}", response_model=AdminGroupDetailRead)
async def get_admin_group_detail(
    group_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Read-only просмотр группы через административный контур."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_group_detail(current_user, group_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.delete("/groups/{group_id}", response_model=AdminActionResult)
async def emergency_delete_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Аварийное удаление группы глобальным администратором."""
    try:
        admin_service = _get_admin_service(service_factory)
        await admin_service.emergency_delete_group(current_user, group_id)
        return AdminActionResult(detail="Группа аварийно удалена")
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/projects", response_model=list[AdminProjectRead])
async def get_admin_projects(
    q: str | None = Query(None, description="Поиск по названию или описанию проекта"),
    project_status: str | None = Query(None, alias="status", description="Статус проекта"),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Просмотр всех проектов системы."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_projects(current_user, q=q, status=project_status)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/projects/{project_id}", response_model=AdminProjectDetailRead)
async def get_admin_project_detail(
    project_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Read-only просмотр проекта через административный контур."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_project_detail(current_user, project_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.delete("/projects/{project_id}", response_model=AdminActionResult)
async def emergency_delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Аварийное удаление проекта глобальным администратором."""
    try:
        admin_service = _get_admin_service(service_factory)
        await admin_service.emergency_delete_project(current_user, project_id)
        return AdminActionResult(detail="Проект аварийно удалён")
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/tasks", response_model=list[AdminTaskRead])
async def get_admin_tasks(
    q: str | None = Query(None, description="Поиск по названию или описанию задачи"),
    task_status: TaskStatus | None = Query(None, alias="status", description="Статус задачи"),
    priority: TaskPriority | None = Query(None, description="Приоритет задачи"),
    overdue: bool | None = Query(None, description="Фильтр просроченных задач"),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Просмотр всех задач системы."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_tasks(
            actor=current_user,
            q=q,
            status=task_status,
            priority=priority,
            overdue=overdue,
        )
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/tasks/{task_id}", response_model=AdminTaskDetailRead)
async def get_admin_task_detail(
    task_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Read-only просмотр задачи через административный контур."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_task_detail(current_user, task_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/tasks/{task_id}/history", response_model=list[AdminTaskHistoryRead])
async def get_admin_task_history(
    task_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Read-only просмотр истории задачи через административный контур."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_task_history(current_user, task_id)
    except Exception as error:
        raise _map_admin_error(error) from error


@router.delete("/tasks/{task_id}", response_model=AdminActionResult)
async def emergency_delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Аварийное удаление задачи глобальным администратором."""
    try:
        admin_service = _get_admin_service(service_factory)
        await admin_service.emergency_delete_task(current_user, task_id)
        return AdminActionResult(detail="Задача аварийно удалена")
    except Exception as error:
        raise _map_admin_error(error) from error


@router.get("/audit", response_model=list[AdminAuditLogRead])
async def get_admin_audit(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, description="Фильтр по действию"),
    target_type: str | None = Query(None, description="Фильтр по типу объекта"),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory),
):
    """Журнал действий глобальных администраторов."""
    try:
        admin_service = _get_admin_service(service_factory)
        return await admin_service.get_audit_logs(
            actor=current_user,
            limit=limit,
            offset=offset,
            action=action,
            target_type=target_type,
        )
    except Exception as error:
        raise _map_admin_error(error) from error