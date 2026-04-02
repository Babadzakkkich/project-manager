from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import modules.projects.router as projects_router_module

from modules.auth.dependencies import get_current_user
from modules.projects.exceptions import (
    GroupsNotFoundError,
    GroupsNotInProjectError,
    InsufficientProjectPermissionsError,
    ProjectCreationError,
    ProjectDeleteError,
    ProjectNotFoundError,
    ProjectUpdateError,
)
from modules.projects.router import router as projects_router
from shared.dependencies import get_service_factory

class DummyProjectService:
    async def get_all_projects(self, current_user_id: int):
        return [
            {
                "id": 1,
                "title": "Project Alpha",
                "description": "Alpha desc",
                "start_date": "2026-01-10T09:00:00",
                "end_date": "2026-02-10T09:00:00",
                "status": "active",
            }
        ]

    async def get_user_projects(self, user_id: int):
        return [
            {
                "id": 1,
                "title": "Project Alpha",
                "description": "Alpha desc",
                "start_date": "2026-01-10T09:00:00",
                "end_date": "2026-02-10T09:00:00",
                "status": "active",
                "groups": [],
                "tasks": [],
            }
        ]

    async def get_project_by_id(self, project_id: int):
        if project_id == 404:
            raise ProjectNotFoundError(project_id)

        return {
            "id": project_id,
            "title": "Project Alpha",
            "description": "Alpha desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "groups": [],
            "tasks": [],
        }

    async def create_project(self, project_data, current_user):
        if project_data.group_ids == [404]:
            raise GroupsNotFoundError([404])
        if project_data.group_ids == [403]:
            raise InsufficientProjectPermissionsError("Недостаточно прав")
        if project_data.title == "broken":
            raise ProjectCreationError("Ошибка создания проекта")

        return {
            "id": 2,
            "title": project_data.title,
            "description": project_data.description,
            "start_date": project_data.start_date.isoformat(),
            "end_date": project_data.end_date.isoformat(),
            "status": project_data.status,
            "groups": [],
            "tasks": [],
        }

    async def update_project(self, db_project, project_data, current_user):
        if db_project.id == 403:
            raise InsufficientProjectPermissionsError("Недостаточно прав")
        if db_project.id == 400:
            raise ProjectUpdateError("Ошибка обновления проекта")

        return {
            "id": db_project.id,
            "title": project_data.title or db_project.title,
            "description": project_data.description or db_project.description,
            "start_date": (
                project_data.start_date.isoformat()
                if project_data.start_date
                else db_project.start_date
            ),
            "end_date": (
                project_data.end_date.isoformat()
                if project_data.end_date
                else db_project.end_date
            ),
            "status": project_data.status or db_project.status,
            "groups": [],
            "tasks": [],
        }

    async def add_groups_to_project(self, project_id: int, data, current_user):
        if project_id == 404:
            raise ProjectNotFoundError(project_id)
        if data.group_ids == [405]:
            raise GroupsNotFoundError([405])
        if data.group_ids == [403]:
            raise InsufficientProjectPermissionsError("Недостаточно прав")
        if data.group_ids == [400]:
            raise ProjectUpdateError("Ошибка обновления проекта")

        return {
            "id": project_id,
            "title": "Project Alpha",
            "description": "Alpha desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "groups": [],
            "tasks": [],
        }

    async def remove_groups_from_project(self, project_id: int, data, current_user):
        if project_id == 404:
            raise ProjectNotFoundError(project_id)
        if data.group_ids == [405]:
            raise GroupsNotInProjectError([405])
        if data.group_ids == [403]:
            raise InsufficientProjectPermissionsError("Недостаточно прав")
        if data.group_ids == [400]:
            raise ProjectUpdateError("Ошибка удаления групп из проекта")

        return {
            "id": project_id,
            "title": "Project Alpha",
            "description": "Alpha desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "groups": [],
            "tasks": [],
        }

    async def delete_project(self, project_id: int, current_user):
        if project_id == 404:
            raise ProjectNotFoundError(project_id)
        if project_id == 403:
            raise InsufficientProjectPermissionsError("Недостаточно прав")
        if project_id == 400:
            raise ProjectDeleteError("Ошибка удаления проекта")
        return True


class DummyServiceFactory:
    def __init__(self):
        self.project_service = DummyProjectService()

    def get(self, name: str):
        assert name == "project"
        return self.project_service


class DummyScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


@pytest.fixture
def projects_client(monkeypatch):
    app = FastAPI()
    app.include_router(projects_router, prefix="/projects", tags=["Projects"])

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
                project_id = None
                try:
                    where_part = str(stmt.whereclause)
                    if "403" in where_part:
                        project_id = 403
                    elif "404" in where_part:
                        project_id = 404
                    elif "400" in where_part:
                        project_id = 400
                    else:
                        project_id = 1
                except Exception:
                    project_id = 1

                if project_id == 404:
                    return DummyScalarResult(None)

                return DummyScalarResult(
                    SimpleNamespace(
                        id=project_id,
                        title="Project Alpha",
                        description="Alpha desc",
                        start_date="2026-01-10T09:00:00",
                        end_date="2026-02-10T09:00:00",
                        status="active",
                        groups=[],
                    )
                )

        return DummySession()

    async def mock_check_user_in_project(session, user_id, project_id):
        return project_id != 403

    monkeypatch.setattr(
        "modules.projects.router.check_user_in_project",
        mock_check_user_in_project,
    )

    from core.database.session import db_session

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory
    app.dependency_overrides[db_session.session_getter] = override_session

    with TestClient(app) as client:
        yield client


def test_get_projects_returns_list(projects_client):
    response = projects_client.get("/projects/")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Project Alpha"


def test_get_my_projects_returns_list(projects_client):
    response = projects_client.get("/projects/my")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Project Alpha"


def test_get_project_returns_project(projects_client):
    response = projects_client.get("/projects/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["title"] == "Project Alpha"


def test_get_project_returns_403_when_user_has_no_access(projects_client):
    response = projects_client.get("/projects/403")

    assert response.status_code == 403
    assert "Нет доступа" in response.json()["detail"]


def test_get_project_returns_404_for_missing_project(projects_client):
    response = projects_client.get("/projects/404")

    assert response.status_code == 404
    assert "не найден" in response.json()["detail"]


def test_create_project_returns_201(projects_client):
    response = projects_client.post(
        "/projects/",
        json={
            "title": "New Project",
            "description": "Desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "group_ids": [1],
        },
    )

    assert response.status_code == 201
    assert response.json()["title"] == "New Project"


def test_create_project_returns_404_for_missing_groups(projects_client):
    response = projects_client.post(
        "/projects/",
        json={
            "title": "New Project",
            "description": "Desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "group_ids": [404],
        },
    )

    assert response.status_code == 404
    assert "не найдены" in response.json()["detail"]


def test_create_project_returns_403_for_insufficient_permissions(projects_client):
    response = projects_client.post(
        "/projects/",
        json={
            "title": "New Project",
            "description": "Desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "group_ids": [403],
        },
    )

    assert response.status_code == 403


def test_create_project_returns_400_for_creation_error(projects_client):
    response = projects_client.post(
        "/projects/",
        json={
            "title": "broken",
            "description": "Desc",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T09:00:00",
            "status": "active",
            "group_ids": [1],
        },
    )

    assert response.status_code == 400
    assert "Ошибка создания" in response.json()["detail"]


def test_add_groups_to_project_returns_updated_project(projects_client):
    response = projects_client.post(
        "/projects/1/add_groups",
        json={"group_ids": [2]},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_add_groups_to_project_returns_404_for_missing_project(projects_client):
    response = projects_client.post(
        "/projects/404/add_groups",
        json={"group_ids": [2]},
    )

    assert response.status_code == 404


def test_add_groups_to_project_returns_404_for_missing_groups(projects_client):
    response = projects_client.post(
        "/projects/1/add_groups",
        json={"group_ids": [405]},
    )

    assert response.status_code == 404


def test_add_groups_to_project_returns_403_for_permissions_error(projects_client):
    response = projects_client.post(
        "/projects/1/add_groups",
        json={"group_ids": [403]},
    )

    assert response.status_code == 403


def test_update_project_returns_updated_project(projects_client):
    response = projects_client.put(
        "/projects/1",
        json={"title": "Updated Project"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["title"] == "Updated Project"


def test_update_project_returns_404_for_missing_project(projects_client, monkeypatch):
    async def mock_update_project(self, db_project, project_data, current_user):
        raise ProjectNotFoundError(404)

    monkeypatch.setattr(
        DummyProjectService,
        "update_project",
        mock_update_project,
    )

    response = projects_client.put(
        "/projects/404",
        json={"title": "Updated Project"},
    )

    assert response.status_code == 404
    assert "не найден" in response.json()["detail"]


def test_update_project_returns_403_for_permissions_error(projects_client, monkeypatch):
    async def mock_update_project(self, db_project, project_data, current_user):
        raise InsufficientProjectPermissionsError("Недостаточно прав")

    monkeypatch.setattr(
        DummyProjectService,
        "update_project",
        mock_update_project,
    )

    response = projects_client.put(
        "/projects/403",
        json={"title": "Updated Project"},
    )

    assert response.status_code == 403


def test_update_project_returns_400_for_update_error(projects_client, monkeypatch):
    async def mock_update_project(self, db_project, project_data, current_user):
        raise ProjectUpdateError("Ошибка обновления проекта")

    monkeypatch.setattr(
        DummyProjectService,
        "update_project",
        mock_update_project,
    )

    response = projects_client.put(
        "/projects/400",
        json={"title": "Updated Project"},
    )

    assert response.status_code == 400


def test_remove_groups_from_project_returns_updated_project(projects_client):
    response = projects_client.request(
        "DELETE",
        "/projects/1/remove_groups",
        json={"group_ids": [2]},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_remove_groups_from_project_returns_404_for_missing_project(projects_client):
    response = projects_client.request(
        "DELETE",
        "/projects/404/remove_groups",
        json={"group_ids": [2]},
    )

    assert response.status_code == 404


def test_remove_groups_from_project_returns_404_for_groups_not_in_project(projects_client):
    response = projects_client.request(
        "DELETE",
        "/projects/1/remove_groups",
        json={"group_ids": [405]},
    )

    assert response.status_code == 404


def test_remove_groups_from_project_returns_403_for_permissions_error(projects_client):
    response = projects_client.request(
        "DELETE",
        "/projects/1/remove_groups",
        json={"group_ids": [403]},
    )

    assert response.status_code == 403


def test_delete_project_returns_success_message(projects_client):
    response = projects_client.delete("/projects/1")

    assert response.status_code == 200
    assert response.json() == {"detail": "Проект успешно удалён"}


def test_delete_project_returns_404_for_missing_project(projects_client):
    response = projects_client.delete("/projects/404")

    assert response.status_code == 404


def test_delete_project_returns_403_for_permissions_error(projects_client):
    response = projects_client.delete("/projects/403")

    assert response.status_code == 403


def test_delete_project_returns_400_for_delete_error(projects_client):
    response = projects_client.delete("/projects/400")

    assert response.status_code == 400