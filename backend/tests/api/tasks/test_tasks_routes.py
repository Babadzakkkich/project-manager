from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.database.models import TaskPriority, TaskStatus
from modules.auth.dependencies import get_current_user
from modules.tasks.exceptions import (
    GroupNotFoundError,
    GroupNotInProjectError,
    ProjectNotFoundError,
    TaskAccessDeniedError,
    TaskCreationError,
    TaskDeleteError,
    TaskNotFoundError,
    TaskNoGroupError,
    TaskUpdateError,
    UsersNotInGroupError,
    UsersNotInTaskError,
)
from modules.tasks.router import router as tasks_router
from shared.dependencies import get_service_factory


def build_user_obj(user_id: int = 10, login: str = "user_login"):
    return SimpleNamespace(
        id=user_id,
        login=login,
        email=f"user{user_id}@example.com",
        name=f"User {user_id}",
    )


def build_group_user_obj(user_id: int = 10, login: str = "user_login", role: str = "admin"):
    return SimpleNamespace(
        id=user_id,
        login=login,
        email=f"user{user_id}@example.com",
        name=f"User {user_id}",
        role=role,
    )


def build_project_obj(project_id: int = 1):
    return SimpleNamespace(
        id=project_id,
        title="Project Alpha",
        description="Alpha desc",
        status="active",
        start_date=None,
        end_date=None,
    )


def build_group_obj(group_id: int = 1):
    return SimpleNamespace(
        id=group_id,
        name="Backend",
        description="Backend team",
        created_at="2026-01-01T10:00:00",
        users=[build_group_user_obj()],
    )


def build_task_obj(task_id: int = 1):
    return SimpleNamespace(
        id=task_id,
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG.value,
        priority=TaskPriority.HIGH.value,
        position=0,
        start_date=None,
        deadline=None,
        project_id=1,
        group_id=1,
        tags=["backend"],
        project=build_project_obj(1),
        group=build_group_obj(1),
        assignees=[build_user_obj()],
    )


def build_task_read_obj(task_id: int = 1):
    return SimpleNamespace(
        id=task_id,
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG.value,
        priority=TaskPriority.HIGH.value,
        position=0,
        start_date=None,
        deadline=None,
        project_id=1,
        group_id=1,
        tags=["backend"],
    )


class DummyTaskService:
    async def get_all_tasks(self, current_user_id: int):
        return [build_task_read_obj(1), build_task_read_obj(2)]

    async def get_user_tasks(self, user_id: int):
        return [build_task_obj(1)]

    async def get_team_tasks(self, user_id: int):
        return [build_task_obj(2)]

    async def get_task_by_id(self, task_id: int):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        return build_task_obj(task_id)

    async def create_task(self, task_data, current_user):
        if task_data.project_id == 404:
            raise ProjectNotFoundError(task_data.project_id)
        if task_data.group_id == 404:
            raise GroupNotFoundError(task_data.group_id)
        if task_data.group_id == 405:
            raise GroupNotInProjectError(task_data.group_id, task_data.project_id)
        if task_data.group_id == 403:
            raise TaskAccessDeniedError("Вы не состоите в указанной группе")
        if task_data.title == "broken":
            raise TaskCreationError("Ошибка создания задачи")
        return build_task_obj(10)

    async def create_task_for_users(self, task_data, assignee_ids, current_user):
        if assignee_ids == [400]:
            raise UsersNotInGroupError([400])
        if assignee_ids == [403]:
            raise TaskAccessDeniedError("Нет прав")
        return build_task_obj(11)

    async def add_users_to_task(self, task_id: int, data, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if data.user_ids == [400]:
            raise UsersNotInGroupError([400])
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        return build_task_obj(task_id)

    async def update_task(self, db_task, task_data, current_user):
        if db_task.id == 404:
            raise TaskNotFoundError(404)
        if db_task.id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if db_task.id == 400:
            raise TaskUpdateError("Ошибка обновления задачи")

        payload = build_task_read_obj(db_task.id)
        if task_data.title:
            payload.title = task_data.title
        return payload

    async def remove_users_from_task(self, task_id: int, data, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_id == 405:
            raise TaskNoGroupError()
        if data.user_ids == [406]:
            raise UsersNotInTaskError([406])
        return {"detail": "Пользователи успешно удалены из задачи"}

    async def delete_task(self, task_id: int, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_id == 405:
            raise TaskNoGroupError()
        if task_id == 400:
            raise TaskDeleteError("Ошибка удаления задачи")
        return True

    async def get_project_board_tasks(self, project_id: int, group_id: int, view_mode: str, current_user):
        if project_id == 404:
            raise ProjectNotFoundError(project_id)
        if group_id == 404:
            raise GroupNotFoundError(group_id)
        if group_id == 405:
            raise GroupNotInProjectError(group_id, project_id)
        if group_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        return [build_task_obj(21)]

    async def update_task_status(self, task_id: int, new_status, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_id == 400:
            raise TaskUpdateError("Ошибка обновления статуса")
        payload = build_task_read_obj(task_id)
        payload.status = new_status.value if hasattr(new_status, "value") else str(new_status)
        return payload

    async def update_task_position(self, task_id: int, position: int, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_id == 400:
            raise TaskUpdateError("Ошибка обновления позиции")
        payload = build_task_read_obj(task_id)
        payload.position = position
        return payload

    async def update_task_priority(self, task_id: int, new_priority, current_user):
        if task_id == 404:
            raise TaskNotFoundError(task_id)
        if task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_id == 400:
            raise TaskUpdateError("Ошибка обновления приоритета")
        payload = build_task_read_obj(task_id)
        payload.priority = new_priority.value if hasattr(new_priority, "value") else str(new_priority)
        return payload

    async def bulk_update_tasks(self, updates, current_user):
        if updates[0].task_id == 404:
            raise TaskNotFoundError(404)
        if updates[0].task_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if updates[0].task_id == 400:
            raise TaskUpdateError("Ошибка массового обновления")
        return [build_task_read_obj(u.task_id) for u in updates]

    async def get_task_history(self, task_id: int):
        return [
            {
                "id": 1,
                "action": "status_change",
                "old_value": "backlog",
                "new_value": "in_progress",
                "details": None,
                "created_at": "2026-01-01T12:00:00",
                "user": {
                    "id": 10,
                    "login": "user_login",
                    "email": "user@example.com",
                    "name": "User",
                },
            }
        ]

    async def quick_create_task(self, task_data, current_user):
        if task_data.project_id == 404:
            raise ProjectNotFoundError(task_data.project_id)
        if task_data.group_id == 404:
            raise GroupNotFoundError(task_data.group_id)
        if task_data.group_id == 405:
            raise GroupNotInProjectError(task_data.group_id, task_data.project_id)
        if task_data.group_id == 403:
            raise TaskAccessDeniedError("Нет доступа")
        if task_data.title == "broken":
            raise TaskCreationError("Ошибка быстрого создания")
        return build_task_obj(12)


class DummyServiceFactory:
    def __init__(self):
        self.task_service = DummyTaskService()

    def get(self, name: str):
        assert name == "task"
        return self.task_service


class DummySessionResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


@pytest.fixture
def tasks_client(monkeypatch):
    app = FastAPI()
    app.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    async def override_service_factory():
        return DummyServiceFactory()

    async def override_session():
        class DummySession:
            async def execute(self, stmt):
                stmt_str = str(stmt)
                if "404" in stmt_str:
                    return DummySessionResult(None)
                if "403" in stmt_str:
                    return DummySessionResult(build_task_obj(403))
                if "400" in stmt_str:
                    return DummySessionResult(build_task_obj(400))
                return DummySessionResult(build_task_obj(1))

        return DummySession()

    async def mock_check_user_in_group(session, user_id, group_id):
        return group_id != 403

    monkeypatch.setattr(
        "modules.tasks.router.check_user_in_group",
        mock_check_user_in_group,
    )

    from core.database.session import db_session

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory
    app.dependency_overrides[db_session.session_getter] = override_session

    with TestClient(app) as client:
        yield client


def test_get_tasks_returns_list(tasks_client):
    response = tasks_client.get("/tasks/")

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.json()[0]["title"] == "Fix auth"


def test_get_my_tasks_returns_list(tasks_client):
    response = tasks_client.get("/tasks/my")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 1


def test_get_team_tasks_returns_list(tasks_client):
    response = tasks_client.get("/tasks/team")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 2


def test_get_task_returns_task(tasks_client):
    response = tasks_client.get("/tasks/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["title"] == "Fix auth"


def test_get_task_returns_404_for_missing_task(tasks_client):
    response = tasks_client.get("/tasks/404")

    assert response.status_code == 404


def test_create_task_returns_201(tasks_client):
    response = tasks_client.post(
        "/tasks/",
        json={
            "title": "Fix auth",
            "description": "Important task",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 1,
            "group_id": 1,
            "tags": ["backend"],
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == 10


def test_create_task_returns_404_for_missing_project(tasks_client):
    response = tasks_client.post(
        "/tasks/",
        json={
            "title": "Fix auth",
            "description": "Important task",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 404,
            "group_id": 1,
            "tags": [],
        },
    )

    assert response.status_code == 404


def test_create_task_for_users_returns_400_for_users_not_in_group(tasks_client):
    response = tasks_client.post(
        "/tasks/create_for_users",
        json={
            "title": "Fix auth",
            "description": "Important task",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 1,
            "group_id": 1,
            "tags": [],
            "assignee_ids": [400],
        },
    )

    assert response.status_code == 400


def test_add_users_to_task_returns_400_for_invalid_users(tasks_client):
    response = tasks_client.post(
        "/tasks/1/add_users",
        json={"user_ids": [400]},
    )

    assert response.status_code == 400


def test_update_task_returns_updated_task(tasks_client):
    response = tasks_client.put(
        "/tasks/1",
        json={"title": "Updated Task"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated Task"


def test_update_task_returns_403_for_access_error(tasks_client):
    response = tasks_client.put(
        "/tasks/403",
        json={"title": "Updated Task"},
    )

    assert response.status_code == 403


def test_remove_users_from_task_returns_success(tasks_client):
    response = tasks_client.request(
        "DELETE",
        "/tasks/1/remove_users",
        json={"user_ids": [10]},
    )

    assert response.status_code == 200
    assert response.json()["detail"] == "Пользователи успешно удалены из задачи"


def test_delete_task_returns_success(tasks_client):
    response = tasks_client.delete("/tasks/1")

    assert response.status_code == 200
    assert response.json() == {"detail": "Задача успешно удалена"}


def test_get_project_board_returns_tasks(tasks_client):
    response = tasks_client.get("/tasks/board/project/1?group_id=1&view_mode=team")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 21


def test_update_task_status_returns_updated_task(tasks_client):
    response = tasks_client.put(
        f"/tasks/1/status?status_update={TaskStatus.IN_PROGRESS.value}"
    )

    assert response.status_code == 200
    assert response.json()["status"] == TaskStatus.IN_PROGRESS.value


def test_update_task_priority_returns_updated_task(tasks_client):
    response = tasks_client.put(
        f"/tasks/1/priority?priority_update={TaskPriority.LOW.value}"
    )

    assert response.status_code == 200
    assert response.json()["priority"] == TaskPriority.LOW.value


def test_update_task_position_returns_updated_task(tasks_client):
    response = tasks_client.put("/tasks/1/position?position=3")

    assert response.status_code == 200
    assert response.json()["position"] == 3


def test_bulk_update_tasks_returns_list(tasks_client):
    response = tasks_client.post(
        "/tasks/bulk_update",
        json=[
            {
                "task_id": 1,
                "status": TaskStatus.IN_PROGRESS.value,
                "position": 2,
                "priority": TaskPriority.HIGH.value,
            }
        ],
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 1


def test_get_task_history_returns_list(tasks_client):
    response = tasks_client.get("/tasks/1/history")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["action"] == "status_change"


def test_quick_create_task_returns_201(tasks_client):
    response = tasks_client.post(
        "/tasks/quick_create",
        json={
            "title": "Quick task",
            "description": "Important task",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 1,
            "group_id": 1,
            "tags": [],
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == 12