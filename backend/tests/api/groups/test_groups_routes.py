from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from modules.auth.dependencies import get_current_user, get_optional_current_user
from modules.groups.exceptions import (
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupDeleteError,
    GroupNotFoundError,
    GroupUpdateError,
    InsufficientPermissionsError,
    UserNotFoundInGroupError,
)
from modules.groups.router import router as groups_router
from shared.dependencies import get_service_factory


class DummyGroupService:
    async def get_all_groups(self, current_user_id: int):
        return [
            {
                "id": 1,
                "name": "Backend",
                "description": "Backend team",
                "created_at": "2026-01-01T12:00:00",
                "users": [],
                "projects": [],
            }
        ]

    async def get_user_groups(self, user_id: int):
        return [
            {
                "id": 1,
                "name": "Backend",
                "description": "Backend team",
                "created_at": "2026-01-01T12:00:00",
                "users": [],
                "projects": [],
            }
        ]

    async def get_group_by_id(self, group_id: int):
        if group_id == 404:
            raise GroupNotFoundError(group_id=group_id)

        return {
            "id": group_id,
            "name": "Backend",
            "description": "Backend team",
            "created_at": "2026-01-01T12:00:00",
            "users": [],
            "projects": [],
        }

    async def create_group(self, group_data, current_user):
        if group_data.name == "duplicate":
            raise GroupAlreadyExistsError(group_data.name)
        if group_data.name == "broken":
            raise GroupCreationError("Ошибка создания группы")

        return {
            "id": 2,
            "name": group_data.name,
            "description": group_data.description,
            "created_at": "2026-01-02T12:00:00",
            "users": [],
            "projects": [],
        }

    async def update_group(self, db_group, group_data, current_user):
        if db_group["id"] == 400:
            raise GroupUpdateError("Ошибка обновления группы")
        if group_data.name == "duplicate":
            raise GroupAlreadyExistsError(group_data.name)

        return {
            "id": db_group["id"],
            "name": group_data.name or db_group["name"],
            "description": group_data.description or db_group["description"],
            "created_at": "2026-01-01T12:00:00",
            "users": [],
            "projects": [],
        }

    async def remove_users_from_group(self, group_id: int, data, current_user):
        if group_id == 404:
            raise GroupNotFoundError(group_id=group_id)
        if group_id == 405:
            raise UserNotFoundInGroupError(user_id=data.user_ids[0])

        return {
            "id": group_id,
            "name": "Backend",
            "description": "Backend team",
            "created_at": "2026-01-01T12:00:00",
            "users": [],
            "projects": [],
        }

    async def delete_group(self, group_id: int, current_user):
        if group_id == 404:
            raise GroupNotFoundError(group_id=group_id)
        if group_id == 400:
            raise GroupDeleteError("Ошибка удаления группы")
        return True


class DummyServiceFactory:
    def __init__(self):
        self.group_service = DummyGroupService()

    def get(self, name: str):
        assert name == "group"
        return self.group_service


@pytest.fixture
def groups_client(monkeypatch):
    app = FastAPI()
    app.include_router(groups_router, prefix="/groups", tags=["Groups"])

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    async def override_optional_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    async def override_service_factory():
        return DummyServiceFactory()

    async def mock_check_user_in_group(session, user_id, group_id):
        return group_id != 403

    monkeypatch.setattr(
        "modules.groups.router.check_user_in_group",
        mock_check_user_in_group,
    )

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_optional_current_user] = override_optional_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        yield client


def test_get_all_groups_returns_list(groups_client):
    response = groups_client.get("/groups/")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Backend"


def test_get_my_groups_returns_list(groups_client):
    response = groups_client.get("/groups/my")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Backend"


def test_get_group_returns_group(groups_client):
    response = groups_client.get("/groups/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Backend"


def test_get_group_returns_403_when_user_not_in_group(groups_client):
    response = groups_client.get("/groups/403")

    assert response.status_code == 403
    assert "не состоит в группе" in response.json()["detail"]


def test_get_group_returns_404_for_missing_group(groups_client):
    response = groups_client.get("/groups/404")

    assert response.status_code == 404
    assert "не найдена" in response.json()["detail"] or "не найден" in response.json()["detail"]


def test_create_group_returns_201(groups_client):
    response = groups_client.post(
        "/groups/",
        json={"name": "QA", "description": "QA team"},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "QA"


def test_create_group_returns_400_for_duplicate_name(groups_client):
    response = groups_client.post(
        "/groups/",
        json={"name": "duplicate", "description": "Duplicate"},
    )

    assert response.status_code == 400
    assert "уже существует" in response.json()["detail"]


def test_create_group_returns_400_for_creation_error(groups_client):
    response = groups_client.post(
        "/groups/",
        json={"name": "broken", "description": "Broken"},
    )

    assert response.status_code == 400
    assert "Ошибка создания" in response.json()["detail"]


def test_update_group_returns_updated_group(groups_client):
    response = groups_client.put(
        "/groups/1",
        json={"name": "Backend Core", "description": "Updated backend"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Backend Core"


def test_update_group_returns_404_for_missing_group(groups_client):
    response = groups_client.put(
        "/groups/404",
        json={"name": "Any"},
    )

    assert response.status_code == 404


def test_update_group_returns_400_for_duplicate_name(groups_client):
    response = groups_client.put(
        "/groups/1",
        json={"name": "duplicate"},
    )

    assert response.status_code == 400
    assert "уже существует" in response.json()["detail"]


def test_remove_users_from_group_returns_updated_group(groups_client):
    response = groups_client.request(
        "DELETE",
        "/groups/1/remove_users",
        json={"user_ids": [10]},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_remove_users_from_group_returns_404_for_missing_group(groups_client):
    response = groups_client.request(
        "DELETE",
        "/groups/404/remove_users",
        json={"user_ids": [10]},
    )

    assert response.status_code == 404


def test_remove_users_from_group_returns_404_for_missing_user(groups_client):
    response = groups_client.request(
        "DELETE",
        "/groups/405/remove_users",
        json={"user_ids": [10]},
    )

    assert response.status_code == 404


def test_delete_group_returns_success_message(groups_client):
    response = groups_client.delete("/groups/1")

    assert response.status_code == 200
    assert response.json() == {"detail": "Группа успешно удалена"}


def test_delete_group_returns_404_for_missing_group(groups_client):
    response = groups_client.delete("/groups/404")

    assert response.status_code == 404