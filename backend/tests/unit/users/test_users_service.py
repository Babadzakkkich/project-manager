from datetime import datetime
from types import SimpleNamespace

import pytest

from modules.users.exceptions import (
    UserAlreadyExistsError,
    UserCreationError,
    UserNotFoundError,
)
from modules.users.schemas import UserCreate, UserUpdate, UserWithRelations
from modules.users.service import UserService


class DummyScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items


class DummyExecuteResult:
    def __init__(self, scalar_one=None, scalars_all=None):
        self._scalar_one = scalar_one
        self._scalars_all = scalars_all or []

    def scalar_one_or_none(self):
        return self._scalar_one

    def scalars(self):
        return DummyScalarResult(self._scalars_all)


class DummySession:
    def __init__(self, execute_results=None):
        self.execute_results = execute_results or []
        self.execute_calls = 0
        self.added = []
        self.commits = 0
        self.refresh_calls = []
        self.rollbacks = 0
        self.deleted = []

    async def execute(self, stmt):
        result = self.execute_results[self.execute_calls]
        self.execute_calls += 1
        return result

    async def scalars(self, stmt):
        result = self.execute_results[self.execute_calls]
        self.execute_calls += 1
        return result

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refresh_calls.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 1, 1, 12, 0, 0)

    async def rollback(self):
        self.rollbacks += 1

    async def delete(self, obj):
        self.deleted.append(obj)


@pytest.mark.asyncio
async def test_check_user_exists_returns_flags_for_existing_login_and_email():
    existing_users = [
        SimpleNamespace(login="test_user", email="other@example.com"),
        SimpleNamespace(login="other_user", email="test@example.com"),
    ]
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=existing_users),
        ]
    )
    service = UserService(session)

    login_exists, email_exists = await service.check_user_exists(
        login="test_user",
        email="test@example.com",
    )

    assert login_exists is True
    assert email_exists is True


@pytest.mark.asyncio
async def test_get_user_with_relations_returns_mapped_schema():
    user = SimpleNamespace(
        id=1,
        login="test_user",
        email="test@example.com",
        name="Test User",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        group_memberships=[
            SimpleNamespace(
                group=SimpleNamespace(
                    id=10,
                    name="Backend Team",
                    description="Core backend team",
                    created_at=datetime(2026, 1, 1, 9, 0, 0),
                )
            )
        ],
        assigned_tasks=[
            SimpleNamespace(
                id=100,
                title="Fix auth",
                status="todo",
                priority="high",
                deadline=None,
            )
        ],
    )

    service = UserService(DummySession())

    async def mock_get_user_by_id(user_id: int):
        assert user_id == 1
        return user

    service.get_user_by_id = mock_get_user_by_id

    result = await service.get_user_with_relations(1)

    assert isinstance(result, UserWithRelations)
    assert result.id == 1
    assert result.login == "test_user"
    assert len(result.groups) == 1
    assert result.groups[0].name == "Backend Team"
    assert len(result.assigned_tasks) == 1
    assert result.assigned_tasks[0].title == "Fix auth"


@pytest.mark.asyncio
async def test_get_user_with_relations_returns_none_for_missing_user():
    service = UserService(DummySession())

    async def mock_get_user_by_id(user_id: int):
        return None

    service.get_user_by_id = mock_get_user_by_id

    result = await service.get_user_with_relations(999)

    assert result is None


@pytest.mark.asyncio
async def test_create_user_creates_user_and_returns_entity(monkeypatch):
    session = DummySession()
    service = UserService(session)

    async def mock_check_user_exists(login: str, email: str):
        assert login == "test_user"
        assert email == "test@example.com"
        return False, False

    monkeypatch.setattr(service, "check_user_exists", mock_check_user_exists)
    monkeypatch.setattr(
        "modules.users.service.hash_password",
        lambda password: "hashed-secret123",
    )

    user_create = UserCreate(
        login="test_user",
        email="test@example.com",
        password="secret123",
        name="Test User",
    )

    result = await service.create_user(user_create)

    assert result.login == "test_user"
    assert result.email == "test@example.com"
    assert result.name == "Test User"
    assert result.password_hash == "hashed-secret123"
    assert len(session.added) == 1
    assert session.commits == 1
    assert len(session.refresh_calls) == 1


@pytest.mark.asyncio
async def test_create_user_raises_when_login_already_exists(monkeypatch):
    session = DummySession()
    service = UserService(session)

    async def mock_check_user_exists(login: str, email: str):
        return True, False

    monkeypatch.setattr(service, "check_user_exists", mock_check_user_exists)

    user_create = UserCreate(
        login="test_user",
        email="test@example.com",
        password="secret123",
        name="Test User",
    )

    with pytest.raises(UserAlreadyExistsError, match="логином"):
        await service.create_user(user_create)


@pytest.mark.asyncio
async def test_create_user_raises_when_email_already_exists(monkeypatch):
    session = DummySession()
    service = UserService(session)

    async def mock_check_user_exists(login: str, email: str):
        return False, True

    monkeypatch.setattr(service, "check_user_exists", mock_check_user_exists)

    user_create = UserCreate(
        login="test_user",
        email="test@example.com",
        password="secret123",
        name="Test User",
    )

    with pytest.raises(UserAlreadyExistsError, match="email"):
        await service.create_user(user_create)


@pytest.mark.asyncio
async def test_create_user_rolls_back_and_raises_creation_error(monkeypatch):
    session = DummySession()
    service = UserService(session)

    async def mock_check_user_exists(login: str, email: str):
        return False, False

    monkeypatch.setattr(service, "check_user_exists", mock_check_user_exists)

    def mock_hash_password(password: str):
        raise RuntimeError("hash failed")

    monkeypatch.setattr("modules.users.service.hash_password", mock_hash_password)

    user_create = UserCreate(
        login="test_user",
        email="test@example.com",
        password="secret123",
        name="Test User",
    )

    with pytest.raises(UserCreationError, match="Не удалось создать пользователя"):
        await service.create_user(user_create)

    assert session.rollbacks == 1


@pytest.mark.asyncio
async def test_update_user_updates_basic_fields(monkeypatch):
    existing_user = SimpleNamespace(
        id=1,
        login="old_login",
        email="old@example.com",
        name="Old Name",
        password_hash="old_hash",
    )
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=[]),
        ]
    )
    service = UserService(session)

    async def mock_get_user_by_id(user_id: int):
        assert user_id == 1
        return existing_user

    monkeypatch.setattr(service, "get_user_by_id", mock_get_user_by_id)

    user_update = UserUpdate(
        login="new_login",
        email="new@example.com",
        name="New Name",
    )

    result = await service.update_user(
        user_id=1,
        user_update=user_update,
        current_user_id=1,
    )

    assert result.login == "new_login"
    assert result.email == "new@example.com"
    assert result.name == "New Name"
    assert session.commits == 1
    assert len(session.refresh_calls) == 1


@pytest.mark.asyncio
async def test_update_user_hashes_new_password(monkeypatch):
    existing_user = SimpleNamespace(
        id=1,
        login="test_user",
        email="test@example.com",
        name="Test User",
        password_hash="old_hash",
    )
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=[]),
        ]
    )
    service = UserService(session)

    async def mock_get_user_by_id(user_id: int):
        return existing_user

    monkeypatch.setattr(service, "get_user_by_id", mock_get_user_by_id)
    monkeypatch.setattr(
        "modules.users.service.hash_password",
        lambda password: "hashed-new-password",
    )

    user_update = UserUpdate(password="newpassword123")

    result = await service.update_user(
        user_id=1,
        user_update=user_update,
        current_user_id=1,
    )

    assert result.password_hash == "hashed-new-password"
    assert session.commits == 1


@pytest.mark.asyncio
async def test_update_user_raises_for_missing_user(monkeypatch):
    service = UserService(DummySession())

    async def mock_get_user_by_id(user_id: int):
        return None

    monkeypatch.setattr(service, "get_user_by_id", mock_get_user_by_id)

    with pytest.raises(UserNotFoundError):
        await service.update_user(
            user_id=999,
            user_update=UserUpdate(name="New Name"),
            current_user_id=999,
        )


@pytest.mark.asyncio
async def test_update_user_raises_for_conflicting_login(monkeypatch):
    existing_user = SimpleNamespace(
        id=1,
        login="old_login",
        email="old@example.com",
        name="Old Name",
        password_hash="old_hash",
    )
    conflicting_user = SimpleNamespace(
        id=2,
        login="new_login",
        email="another@example.com",
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=[conflicting_user]),
        ]
    )
    service = UserService(session)

    async def mock_get_user_by_id(user_id: int):
        return existing_user

    monkeypatch.setattr(service, "get_user_by_id", mock_get_user_by_id)

    with pytest.raises(UserAlreadyExistsError, match="логином"):
        await service.update_user(
            user_id=1,
            user_update=UserUpdate(login="new_login"),
            current_user_id=1,
        )


@pytest.mark.asyncio
async def test_delete_user_raises_for_missing_user(monkeypatch):
    service = UserService(DummySession())

    async def mock_get_user_by_id(user_id: int):
        return None

    monkeypatch.setattr(service, "get_user_by_id", mock_get_user_by_id)

    with pytest.raises(UserNotFoundError):
        await service.delete_user(user_id=999, current_user_id=999)