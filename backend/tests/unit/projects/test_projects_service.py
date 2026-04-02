from datetime import datetime
from types import SimpleNamespace

import pytest

from modules.projects.exceptions import (
    GroupsNotFoundError,
    GroupsNotInProjectError,
    ProjectCreationError,
    ProjectNotFoundError,
    ProjectUpdateError,
)
from modules.projects.schemas import (
    AddGroupsToProject,
    ProjectCreate,
    ProjectUpdate,
    RemoveGroupsFromProject,
)
from modules.projects.service import ProjectService


class DummyScalarList:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items

    def unique(self):
        return self


class DummyExecuteResult:
    def __init__(self, scalar_one=None, scalars_all=None):
        self._scalar_one = scalar_one
        self._scalars_all = scalars_all or []

    def scalar_one_or_none(self):
        return self._scalar_one

    def scalars(self):
        return DummyScalarList(self._scalars_all)

    def __iter__(self):
        return iter(self._scalars_all)


class DummySession:
    def __init__(self, execute_results=None, scalars_results=None):
        self.execute_results = execute_results or []
        self.scalars_results = scalars_results or []
        self.execute_calls = 0
        self.scalars_calls = 0
        self.added = []
        self.commits = 0
        self.rollbacks = 0
        self.refresh_calls = []
        self.deleted = []
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        result = self.execute_results[self.execute_calls]
        self.execute_calls += 1
        return result

    async def scalars(self, stmt):
        self.executed.append(stmt)
        result = self.scalars_results[self.scalars_calls]
        self.scalars_calls += 1
        return result

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1
        for i, obj in enumerate(self.added, start=1):
            if getattr(obj, "id", None) is None:
                obj.id = i

    async def rollback(self):
        self.rollbacks += 1

    async def refresh(self, obj):
        self.refresh_calls.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1


@pytest.mark.asyncio
async def test_get_all_projects_returns_list_for_super_admin(monkeypatch):
    projects = [
        SimpleNamespace(id=1, title="Project A"),
        SimpleNamespace(id=2, title="Project B"),
    ]
    session = DummySession(
        scalars_results=[DummyScalarList(projects)]
    )
    service = ProjectService(session)

    async def mock_ensure_super_admin(session_arg, current_user_id):
        assert session_arg == session
        assert current_user_id == 1

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_super_admin_global",
        mock_ensure_super_admin,
    )

    result = await service.get_all_projects(current_user_id=1)

    assert len(result) == 2
    assert result[0].title == "Project A"
    assert result[1].title == "Project B"


@pytest.mark.asyncio
async def test_get_user_projects_returns_projects_with_relations():
    user = SimpleNamespace(
        id=10,
        login="test_user",
        email="test@example.com",
        name="Test User",
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )
    group_member = SimpleNamespace(
        user=user,
        role=SimpleNamespace(value="admin"),
    )
    group = SimpleNamespace(
        id=1,
        name="Backend",
        description="Backend team",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        group_members=[group_member],
    )
    task = SimpleNamespace(
        id=100,
        title="Fix auth",
        description="Important task",
        status="todo",
        priority="high",
        position=1,
        start_date=None,
        deadline=None,
        project_id=1,
        tags=["backend"],
    )
    project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        groups=[group],
        tasks=[task],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult(scalars_all=[project])]
    )
    service = ProjectService(session)

    result = await service.get_user_projects(user_id=10)

    assert len(result) == 1
    assert result[0].title == "Project Alpha"
    assert len(result[0].groups) == 1
    assert result[0].groups[0].name == "Backend"
    assert result[0].groups[0].users[0].role == "admin"
    assert len(result[0].tasks) == 1
    assert result[0].tasks[0].title == "Fix auth"


@pytest.mark.asyncio
async def test_get_project_by_id_returns_project_with_relations():
    user = SimpleNamespace(
        id=10,
        login="test_user",
        email="test@example.com",
        name="Test User",
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )
    group_member = SimpleNamespace(
        user=user,
        role=SimpleNamespace(value="member"),
    )
    group = SimpleNamespace(
        id=1,
        name="Backend",
        description="Backend team",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        group_members=[group_member],
    )
    task = SimpleNamespace(
        id=100,
        title="Task A",
        description="Task desc",
        status="todo",
        priority="medium",
        position=2,
        start_date=None,
        deadline=None,
        project_id=1,
        tags=[],
    )
    project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        groups=[group],
        tasks=[task],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=project)]
    )
    service = ProjectService(session)

    result = await service.get_project_by_id(1)

    assert result.id == 1
    assert result.title == "Project Alpha"
    assert result.groups[0].users[0].role == "member"
    assert result.tasks[0].title == "Task A"


@pytest.mark.asyncio
async def test_get_project_by_id_raises_for_missing_project():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = ProjectService(session)

    with pytest.raises(ProjectNotFoundError):
        await service.get_project_by_id(999)


@pytest.mark.asyncio
async def test_create_project_creates_project_with_groups(monkeypatch):
    class FakeGroup:
        def __init__(self, group_id: int, name: str):
            self.id = group_id
            self.name = name

    class FakeProject:
        def __init__(self, title, description, start_date, end_date, status):
            self.id = None
            self.title = title
            self.description = description
            self.start_date = start_date
            self.end_date = end_date
            self.status = status
            self.groups = []

    group_1 = FakeGroup(1, "Backend")
    group_2 = FakeGroup(2, "Frontend")

    created_project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        groups=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=[group_1, group_2]),
        ]
    )
    service = ProjectService(session)

    current_user = SimpleNamespace(id=5)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert session_arg == session
        assert user_id == 5
        assert group_id in (1, 2)

    async def mock_get_project_by_id(project_id: int):
        assert project_id == 1
        return created_project

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )
    monkeypatch.setattr(service, "get_project_by_id", mock_get_project_by_id)
    monkeypatch.setattr(
        "modules.projects.service.Project",
        FakeProject,
    )

    project_data = ProjectCreate(
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        group_ids=[1, 2],
    )

    result = await service.create_project(project_data, current_user)

    assert result.title == "Project Alpha"
    assert len(session.added) == 1
    assert session.commits == 1

    added_project = session.added[0]
    assert added_project.title == "Project Alpha"
    assert len(added_project.groups) == 2
    assert added_project.groups[0].id == 1
    assert added_project.groups[1].id == 2


@pytest.mark.asyncio
async def test_create_project_raises_for_missing_groups():
    group_1 = SimpleNamespace(id=1, name="Backend")
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalars_all=[group_1]),
        ]
    )
    service = ProjectService(session)

    current_user = SimpleNamespace(id=5)

    project_data = ProjectCreate(
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        group_ids=[1, 2],
    )

    with pytest.raises(ProjectCreationError, match="Группы с ID 2 не найдены"):
        await service.create_project(project_data, current_user)


@pytest.mark.asyncio
async def test_update_project_updates_fields_and_commits(monkeypatch):
    group = SimpleNamespace(id=1, name="Backend")
    db_project = SimpleNamespace(
        id=1,
        title="Old title",
        description="Old desc",
        status="draft",
        start_date=datetime(2026, 1, 1, 9, 0, 0),
        end_date=datetime(2026, 1, 31, 9, 0, 0),
        groups=[group],
    )
    updated_project = SimpleNamespace(
        id=1,
        title="New title",
        description="New desc",
        status="active",
        start_date=datetime(2026, 1, 5, 9, 0, 0),
        end_date=datetime(2026, 2, 5, 9, 0, 0),
        groups=[],
        tasks=[],
    )

    session = DummySession()
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert group_id == 1

    async def mock_get_project_by_id(project_id: int):
        return updated_project

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )
    monkeypatch.setattr(service, "get_project_by_id", mock_get_project_by_id)

    update_data = ProjectUpdate(
        title="New title",
        description="New desc",
        status="active",
        start_date=datetime(2026, 1, 5, 9, 0, 0),
        end_date=datetime(2026, 2, 5, 9, 0, 0),
    )

    result = await service.update_project(db_project, update_data, current_user)

    assert result.title == "New title"
    assert db_project.title == "New title"
    assert db_project.description == "New desc"
    assert db_project.status == "active"
    assert session.commits == 1
    assert len(session.refresh_calls) == 1


@pytest.mark.asyncio
async def test_add_groups_to_project_adds_new_groups(monkeypatch):
    existing_group = SimpleNamespace(id=1, name="Backend")
    new_group = SimpleNamespace(id=2, name="Frontend")
    project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        groups=[existing_group],
    )
    updated_project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        groups=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
            DummyExecuteResult(scalars_all=[new_group]),
        ]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert group_id == 2

    async def mock_get_project_by_id(project_id: int):
        return updated_project

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )
    monkeypatch.setattr(service, "get_project_by_id", mock_get_project_by_id)

    data = AddGroupsToProject(group_ids=[2])

    result = await service.add_groups_to_project(1, data, current_user)

    assert result.title == "Project Alpha"
    assert len(project.groups) == 2
    assert session.commits == 1


@pytest.mark.asyncio
async def test_add_groups_to_project_raises_for_missing_project():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    data = AddGroupsToProject(group_ids=[2])

    with pytest.raises(ProjectUpdateError, match="Проект с ID 1 не найден"):
        await service.add_groups_to_project(1, data, current_user)


@pytest.mark.asyncio
async def test_remove_groups_from_project_removes_groups(monkeypatch):
    group_1 = SimpleNamespace(id=1, name="Backend")
    group_2 = SimpleNamespace(id=2, name="Frontend")
    project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        groups=[group_1, group_2],
        tasks=[],
    )
    updated_project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        description="Alpha desc",
        start_date=datetime(2026, 1, 10, 9, 0, 0),
        end_date=datetime(2026, 2, 10, 9, 0, 0),
        status="active",
        groups=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
        ]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert group_id in (1, 2)

    async def mock_get_project_by_id(project_id: int):
        return updated_project

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )
    monkeypatch.setattr(service, "get_project_by_id", mock_get_project_by_id)

    data = RemoveGroupsFromProject(group_ids=[1, 2])

    result = await service.remove_groups_from_project(1, data, current_user)

    assert result.title == "Project Alpha"
    assert project.groups == []
    assert session.commits == 1


@pytest.mark.asyncio
async def test_remove_groups_from_project_raises_when_groups_not_in_project():
    project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        groups=[],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
        ]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    data = RemoveGroupsFromProject(group_ids=[10])

    with pytest.raises(ProjectUpdateError, match="Группы с ID 10 не найдены в проекте"):
        await service.remove_groups_from_project(1, data, current_user)


@pytest.mark.asyncio
async def test_delete_project_calls_auto_delete_and_returns_true(monkeypatch):
    group_1 = SimpleNamespace(id=1, name="Backend")
    group_2 = SimpleNamespace(id=2, name="Frontend")
    db_project = SimpleNamespace(
        id=1,
        title="Project Alpha",
        groups=[group_1, group_2],
        tasks=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=db_project),
        ]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert group_id in (1, 2)

    auto_delete_called = {"called": False}

    async def mock_delete_project_auto(project_id: int):
        auto_delete_called["called"] = True
        assert project_id == 1
        return True

    monkeypatch.setattr(
        "modules.projects.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )
    monkeypatch.setattr(service, "delete_project_auto", mock_delete_project_auto)

    result = await service.delete_project(1, current_user)

    assert result is True
    assert auto_delete_called["called"] is True


@pytest.mark.asyncio
async def test_delete_project_raises_for_missing_project():
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=None),
        ]
    )
    service = ProjectService(session)
    current_user = SimpleNamespace(id=1)

    with pytest.raises(ProjectNotFoundError):
        await service.delete_project(1, current_user)