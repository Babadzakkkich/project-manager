from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from modules.auth.dependencies import get_current_user
from modules.users.exceptions import (
    UserAlreadyExistsError,
    UserCreationError,
    UserDeleteError,
    UserNotFoundError,
    UserUpdateError,
)
from modules.users.router import router as users_router
from shared.dependencies import get_service_factory


class DummyUserService:
    def __init__(self):
        self.current_user = SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
            created_at=datetime(2026, 1, 1, 12, 0, 0),
        )

    async def get_all_users(self):
        return [
            self.current_user,
            SimpleNamespace(
                id=2,
                login="other_user",
                email="other@example.com",
                name="Other User",
                created_at=datetime(2026, 1, 2, 12, 0, 0),
            ),
        ]

    async def get_user_with_relations(self, user_id: int):
        if user_id == 1:
            return {
                "id": 1,
                "login": "test_user",
                "email": "test@example.com",
                "name": "Test User",
                "created_at": datetime(2026, 1, 1, 12, 0, 0),
                "groups": [],
                "assigned_tasks": [],
            }
        return None

    async def create_user(self, user_data):
        return SimpleNamespace(
            id=3,
            login=user_data.login,
            email=user_data.email,
            name=user_data.name,
            created_at=datetime(2026, 1, 3, 12, 0, 0),
        )

    async def update_user(self, user_id: int, user_data, current_user_id: int):
        if user_id == 404:
            raise UserNotFoundError(user_id=user_id)
        if user_id == 400:
            raise UserUpdateError("Ошибка обновления пользователя")

        return SimpleNamespace(
            id=user_id,
            login=user_data.login or "test_user",
            email=user_data.email or "test@example.com",
            name=user_data.name or "Test User",
            created_at=datetime(2026, 1, 1, 12, 0, 0),
        )

    async def delete_user(self, user_id: int, current_user_id: int):
        if user_id == 404:
            raise UserNotFoundError(user_id=user_id)
        if user_id == 400:
            raise UserDeleteError("Ошибка удаления пользователя")
        return True


class DummyServiceFactory:
    def __init__(self, user_service):
        self.user_service = user_service

    def get(self, name: str):
        assert name == "user"
        return self.user_service


@pytest.fixture
def users_client():
    app = FastAPI()
    app.include_router(users_router, prefix="/users", tags=["Users"])

    user_service = DummyUserService()
    service_factory = DummyServiceFactory(user_service)

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    async def override_service_factory():
        return service_factory

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        yield client


def test_get_users_returns_list(users_client):
    response = users_client.get("/users/")

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.json()[0]["login"] == "test_user"
    assert response.json()[1]["login"] == "other_user"


def test_get_current_user_info_returns_me(users_client):
    response = users_client.get("/users/me")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["login"] == "test_user"
    assert response.json()["groups"] == []
    assert response.json()["assigned_tasks"] == []


def test_get_current_user_info_returns_404_when_user_missing():
    app = FastAPI()
    app.include_router(users_router, prefix="/users", tags=["Users"])

    class MissingUserService(DummyUserService):
        async def get_user_with_relations(self, user_id: int):
            return None

    service_factory = DummyServiceFactory(MissingUserService())

    async def override_current_user():
        return SimpleNamespace(id=1, login="test_user", email="test@example.com", name="Test User")

    async def override_service_factory():
        return service_factory

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        response = client.get("/users/me")

    assert response.status_code == 404
    assert "не найден" in response.json()["detail"]


def test_get_user_returns_own_profile(users_client):
    response = users_client.get("/users/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["login"] == "test_user"


def test_get_user_returns_403_for_other_user(users_client):
    response = users_client.get("/users/2")

    assert response.status_code == 403
    assert "Недостаточно прав" in response.json()["detail"]


def test_create_user_returns_201(users_client):
    payload = {
        "login": "new_user",
        "email": "new@example.com",
        "password": "secret123",
        "name": "New User",
    }

    response = users_client.post("/users/", json=payload)

    assert response.status_code == 201
    assert response.json()["login"] == "new_user"
    assert response.json()["email"] == "new@example.com"
    assert response.json()["name"] == "New User"


def test_create_user_returns_400_for_duplicate_user():
    app = FastAPI()
    app.include_router(users_router, prefix="/users", tags=["Users"])

    class DuplicateUserService(DummyUserService):
        async def create_user(self, user_data):
            raise UserAlreadyExistsError(login=user_data.login)

    service_factory = DummyServiceFactory(DuplicateUserService())

    async def override_service_factory():
        return service_factory

    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        response = client.post(
            "/users/",
            json={
                "login": "new_user",
                "email": "new@example.com",
                "password": "secret123",
                "name": "New User",
            },
        )

    assert response.status_code == 400
    assert "уже существует" in response.json()["detail"]


def test_create_user_returns_400_for_creation_error():
    app = FastAPI()
    app.include_router(users_router, prefix="/users", tags=["Users"])

    class BrokenUserService(DummyUserService):
        async def create_user(self, user_data):
            raise UserCreationError("Ошибка создания пользователя")

    service_factory = DummyServiceFactory(BrokenUserService())

    async def override_service_factory():
        return service_factory

    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        response = client.post(
            "/users/",
            json={
                "login": "new_user",
                "email": "new@example.com",
                "password": "secret123",
                "name": "New User",
            },
        )

    assert response.status_code == 400
    assert "Ошибка создания" in response.json()["detail"]


def test_update_user_returns_updated_user(users_client):
    response = users_client.put(
        "/users/1",
        json={"name": "Updated User"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Updated User"


def test_update_user_returns_404_for_missing_user(users_client):
    response = users_client.put(
        "/users/404",
        json={"name": "Updated User"},
    )

    assert response.status_code == 404
    assert "не найден" in response.json()["detail"]


def test_update_user_returns_400_for_update_error(users_client):
    response = users_client.put(
        "/users/400",
        json={"name": "Updated User"},
    )

    assert response.status_code == 400
    assert "Ошибка обновления" in response.json()["detail"]


def test_delete_user_returns_success_message(users_client):
    response = users_client.delete("/users/1")

    assert response.status_code == 200
    assert response.json() == {"detail": "Пользователь успешно удален"}


def test_delete_user_returns_404_for_missing_user(users_client):
    response = users_client.delete("/users/404")

    assert response.status_code == 404
    assert "не найден" in response.json()["detail"]


def test_delete_user_returns_400_for_delete_error(users_client):
    response = users_client.delete("/users/400")

    assert response.status_code == 400
    assert "Ошибка удаления" in response.json()["detail"]