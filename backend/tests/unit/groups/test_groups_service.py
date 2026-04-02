from datetime import datetime
from types import SimpleNamespace

import pytest

from modules.groups.exceptions import (
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupNotFoundError,
    UserNotFoundInGroupError,
)
from modules.groups.schemas import GroupCreate, GroupUpdate, RemoveUsersFromGroup
from modules.groups.service import GroupService


class DummyScalarList:
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
        return DummyScalarList(self._scalars_all)


class DummySession:
    def __init__(self, execute_results=None):
        self.execute_results = execute_results or []
        self.execute_calls = 0
        self.added = []
        self.deleted = []
        self.commits = 0
        self.refresh_calls = []
        self.rollbacks = 0
        self.flushes = 0

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

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        self.flushes += 1
        if self.added:
            for i, obj in enumerate(self.added, start=1):
                if getattr(obj, "id", None) is None:
                    obj.id = i

    async def refresh(self, obj):
        self.refresh_calls.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 1, 1, 12, 0, 0)

    async def rollback(self):
        self.rollbacks += 1


@pytest.mark.asyncio
async def test_get_all_groups_returns_list(monkeypatch):
    groups = [
        SimpleNamespace(id=1, name="Backend", description="Backend team"),
        SimpleNamespace(id=2, name="Frontend", description="Frontend team"),
    ]
    session = DummySession(
        execute_results=[DummyScalarList(groups)]
    )
    service = GroupService(session)

    async def mock_ensure_super_admin(session_arg, current_user_id):
        assert current_user_id == 1

    monkeypatch.setattr(
        "modules.groups.service.ensure_user_is_super_admin_global",
        mock_ensure_super_admin,
    )

    result = await service.get_all_groups(current_user_id=1)

    assert len(result) == 2
    assert result[0].name == "Backend"
    assert result[1].name == "Frontend"


@pytest.mark.asyncio
async def test_get_group_by_id_returns_group_with_users():
    member_user = SimpleNamespace(id=10, email="user@example.com", name="User")
    group_member = SimpleNamespace(
        user=member_user,
        role=SimpleNamespace(value="admin"),
    )
    group = SimpleNamespace(
        id=1,
        name="Backend",
        description="Backend team",
        group_members=[group_member],
        projects=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=group)]
    )
    service = GroupService(session)

    result = await service.get_group_by_id(1)

    assert result.id == 1
    assert result.name == "Backend"
    assert len(result.users) == 1
    assert result.users[0].role == "admin"


@pytest.mark.asyncio
async def test_get_group_by_id_raises_for_missing_group():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = GroupService(session)

    with pytest.raises(GroupNotFoundError):
        await service.get_group_by_id(999)


@pytest.mark.asyncio
async def test_get_user_groups_returns_list_with_users():
    member_user = SimpleNamespace(id=10, email="user@example.com", name="User")
    group_member = SimpleNamespace(
        user=member_user,
        role=SimpleNamespace(value="member"),
    )
    group = SimpleNamespace(
        id=1,
        name="Backend",
        description="Backend team",
        group_members=[group_member],
        projects=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult(scalars_all=[group])]
    )
    service = GroupService(session)

    result = await service.get_user_groups(user_id=10)

    assert len(result) == 1
    assert result[0].name == "Backend"
    assert result[0].users[0].role == "member"


@pytest.mark.asyncio
async def test_create_group_creates_group_and_admin_membership():
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=None),  # existing group check
            DummyExecuteResult(scalar_one=SimpleNamespace(  # get_group_by_id after create
                id=1,
                name="Backend",
                description="Backend team",
                group_members=[],
                projects=[],
                tasks=[],
            )),
        ]
    )
    service = GroupService(session)

    current_user = SimpleNamespace(id=5)
    group_data = GroupCreate(
        name="Backend",
        description="Backend team",
    )

    result = await service.create_group(group_data, current_user)

    assert result.name == "Backend"
    assert len(session.added) == 2
    assert session.flushes == 1
    assert session.commits == 1


@pytest.mark.asyncio
async def test_create_group_raises_when_group_name_exists():
    existing_group = SimpleNamespace(id=2, name="Backend")
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=existing_group)]
    )
    service = GroupService(session)

    current_user = SimpleNamespace(id=5)
    group_data = GroupCreate(
        name="Backend",
        description="Backend team",
    )

    with pytest.raises(GroupAlreadyExistsError):
        await service.create_group(group_data, current_user)


@pytest.mark.asyncio
async def test_create_group_rolls_back_and_raises_creation_error():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = GroupService(session)

    async def broken_flush():
        raise RuntimeError("db failure")

    session.flush = broken_flush

    current_user = SimpleNamespace(id=5)
    group_data = GroupCreate(
        name="Backend",
        description="Backend team",
    )

    with pytest.raises(GroupCreationError):
        await service.create_group(group_data, current_user)

    assert session.rollbacks == 1


@pytest.mark.asyncio
async def test_update_group_updates_fields(monkeypatch):
    group = SimpleNamespace(
        id=1,
        name="Old name",
        description="Old description",
    )
    updated_group = SimpleNamespace(
        id=1,
        name="New name",
        description="New description",
        group_members=[],
        projects=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=None),  # duplicate name check
            DummyExecuteResult(scalar_one=updated_group),  # get_group_by_id after update
        ]
    )
    service = GroupService(session)

    async def mock_ensure_admin(session_arg, current_user_id, group_id):
        assert current_user_id == 1
        assert group_id == 1

    monkeypatch.setattr(
        "modules.groups.service.ensure_user_is_admin",
        mock_ensure_admin,
    )

    current_user = SimpleNamespace(id=1)
    group_update = GroupUpdate(
        name="New name",
        description="New description",
    )

    result = await service.update_group(group, group_update, current_user)

    assert result.name == "New name"
    assert result.description == "New description"
    assert session.commits == 1


@pytest.mark.asyncio
async def test_update_group_raises_for_duplicate_name(monkeypatch):
    group = SimpleNamespace(
        id=1,
        name="Old name",
        description="Old description",
    )
    conflicting_group = SimpleNamespace(
        id=2,
        name="New name",
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=conflicting_group),
        ]
    )
    service = GroupService(session)

    async def mock_ensure_admin(session_arg, current_user_id, group_id):
        return None

    monkeypatch.setattr(
        "modules.groups.service.ensure_user_is_admin",
        mock_ensure_admin,
    )

    current_user = SimpleNamespace(id=1)

    with pytest.raises(GroupAlreadyExistsError):
        await service.update_group(
            group,
            GroupUpdate(name="New name"),
            current_user,
        )


@pytest.mark.asyncio
async def test_remove_users_from_group_raises_when_user_not_found_in_group(monkeypatch):
    group = SimpleNamespace(id=1, name="Backend")

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=group),  # get_group_by_id
            DummyExecuteResult(scalars_all=[]),    # memberships not found
        ]
    )
    service = GroupService(session)

    async def mock_ensure_admin(session_arg, current_user_id, group_id):
        return None

    monkeypatch.setattr(
        "modules.groups.service.ensure_user_is_admin",
        mock_ensure_admin,
    )

    current_user = SimpleNamespace(id=1)
    data = RemoveUsersFromGroup(user_ids=[10])

    with pytest.raises(UserNotFoundInGroupError):
        await service.remove_users_from_group(1, data, current_user)