from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.database.models import NotificationPriority, NotificationType
from modules.auth.dependencies import get_current_user
from modules.notifications.http_router import router as notifications_router
from shared.dependencies import get_service_factory


def first_enum_member(enum_cls):
    return list(enum_cls)[0]


def build_notification(notification_id: int = 1, is_read: bool = False):
    return SimpleNamespace(
        id=notification_id,
        user_id=1,
        type=first_enum_member(NotificationType),
        priority=NotificationPriority.HIGH,
        title="Новая задача",
        content="Вам назначена новая задача",
        data=None,
        is_read=is_read,
        read_at=None if not is_read else datetime(2026, 1, 2, 12, 0, 0),
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )


class DummyNotificationService:
    async def get_user_notifications(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
        notification_type=None,
    ):
        items = [
            build_notification(1, False),
            build_notification(2, True),
        ]
        if unread_only:
            items = [build_notification(1, False)]
        return items

    async def get_unread_count(self, user_id: int):
        return 1

    async def mark_as_read(self, notification_id: int, user_id: int):
        return notification_id != 404

    async def mark_all_as_read(self, user_id: int):
        return 3


class DummyServiceFactory:
    def __init__(self):
        self.notification_service = DummyNotificationService()

    def get(self, name: str):
        assert name == "notification"
        return self.notification_service


@pytest.fixture
def notifications_client():
    app = FastAPI()
    app.include_router(
        notifications_router,
        prefix="/notifications",
        tags=["Notifications"],
    )

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    async def override_service_factory():
        return DummyServiceFactory()

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_service_factory] = override_service_factory

    with TestClient(app) as client:
        yield client


def test_get_notifications_returns_list_response(notifications_client):
    response = notifications_client.get("/notifications/")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "unread_count" in data
    assert data["total"] == 2
    assert data["unread_count"] == 1
    assert len(data["items"]) == 2
    assert data["items"][0]["id"] == 1
    assert data["items"][1]["id"] == 2


def test_get_notifications_with_unread_only_returns_filtered_items(notifications_client):
    response = notifications_client.get("/notifications/?unread_only=true")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["is_read"] is False


def test_get_unread_count_returns_count(notifications_client):
    response = notifications_client.get("/notifications/unread/count")

    assert response.status_code == 200
    assert response.json() == {"count": 1}


def test_mark_notification_as_read_returns_success_response(notifications_client):
    response = notifications_client.post("/notifications/1/read")

    assert response.status_code == 200
    assert response.json() == {"success": True, "notification_id": 1, "count": None}


def test_mark_notification_as_read_returns_404_when_missing(notifications_client):
    response = notifications_client.post("/notifications/404/read")

    assert response.status_code == 404
    assert "не найдено" in response.json()["detail"] or "не найдена" in response.json()["detail"]


def test_mark_all_notifications_as_read_returns_count(notifications_client):
    response = notifications_client.post("/notifications/read-all")

    assert response.status_code == 200
    assert response.json() == {"success": True, "notification_id": None, "count": 3}