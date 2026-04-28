import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ---------------------------------------------------------
# Настройка окружения ДО импорта backend/src модулей
# ---------------------------------------------------------
os.environ.setdefault("APP_CONFIG__DB__USER", "test_user")
os.environ.setdefault("APP_CONFIG__DB__PASSWORD", "test_password")
os.environ.setdefault("APP_CONFIG__DB__HOST", "localhost")
os.environ.setdefault("APP_CONFIG__DB__PORT", "5432")
os.environ.setdefault("APP_CONFIG__DB__NAME", "test_db")

os.environ.setdefault("APP_CONFIG__SECURITY__SECRET_KEY", "test_secret_key")
os.environ.setdefault("APP_CONFIG__SECURITY__ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("APP_CONFIG__SECURITY__REFRESH_TOKEN_EXPIRE_DAYS", "7")
os.environ.setdefault("APP_CONFIG__SECURITY__ALGORITHM", "HS256")

os.environ.setdefault("APP_CONFIG__RUN__COOKIE_SECURE", "false")
os.environ.setdefault("APP_CONFIG__RUN__COOKIE_SAMESITE", "lax")

BASE_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = BASE_DIR / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from core.database.session import db_session  # noqa: E402
from modules.auth.router import router as auth_router  # noqa: E402
from modules.users.router import router as users_router  # noqa: E402
from modules.groups.router import router as groups_router  # noqa: E402
from modules.projects.router import router as projects_router  # noqa: E402
from modules.tasks.router import router as tasks_router  # noqa: E402
from modules.notifications.http_router import router as notifications_http_router  # noqa: E402


class DummySession:
    def add(self, obj):
        return None

    async def commit(self):
        return None

    async def refresh(self, obj):
        return None

    async def rollback(self):
        return None

    async def execute(self, *args, **kwargs):
        return None


@pytest.fixture
def fake_session():
    return DummySession()


@pytest.fixture
def test_user():
    return SimpleNamespace(
        id=1,
        login="test_user",
        email="test@example.com",
        name="Test User",
        password_hash="hashed_password",
    )


@pytest.fixture
def auth_app(fake_session):
    app = FastAPI()
    app.include_router(auth_router, prefix="/auth", tags=["Auth"])

    async def override_session():
        return fake_session

    app.dependency_overrides[db_session.session_getter] = override_session
    return app


@pytest.fixture
def client(auth_app):
    with TestClient(auth_app) as test_client:
        yield test_client


@pytest.fixture
def integration_app(fake_session):
    """
    Общее приложение для интеграционных тестов.
    Без main.py и lifespan, чтобы не поднимать Redis/RabbitMQ/реальную БД.
    """
    app = FastAPI()

    app.include_router(auth_router, prefix="/auth", tags=["Auth"])
    app.include_router(users_router, prefix="/users", tags=["Users"])
    app.include_router(groups_router, prefix="/groups", tags=["Groups"])
    app.include_router(projects_router, prefix="/projects", tags=["Projects"])
    app.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
    app.include_router(
        notifications_http_router,
        prefix="/notifications",
        tags=["Notifications HTTP"],
    )

    async def override_session():
        return fake_session

    app.dependency_overrides[db_session.session_getter] = override_session
    return app


@pytest.fixture
def integration_client(integration_app):
    with TestClient(integration_app) as test_client:
        yield test_client