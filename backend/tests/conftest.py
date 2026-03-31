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

from modules.auth.router import router as auth_router  # noqa: E402
from core.database.session import db_session  # noqa: E402


class DummySession:
    """
    Заглушка AsyncSession для модульных тестов.
    Методы добавлены на случай, если какой-то тест
    или код сервиса к ним обратится.
    """

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
    """
    Изолированное приложение только с auth router,
    без подключения main.py и без lifespan.
    """
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