from datetime import datetime
from types import SimpleNamespace

import pytest

from modules.groups.exceptions import InsufficientPermissionsError
from modules.tasks.exceptions import (
    GroupNotInProjectError,
    ProjectNotFoundError,
    TaskAccessDeniedError,
    TaskNotFoundError,
    TaskUpdateError,
    UsersNotInGroupError,
)
from modules.tasks.schemas import AddRemoveUsersToTask, TaskBulkUpdate, TaskCreate, TaskUpdate
from modules.tasks.service import TaskService
from core.database.models import TaskPriority, TaskStatus


class DummyScalarList:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items

    def unique(self):
        return self


class DummyExecuteResult:
    def __init__(self, scalar_one=None, scalars_all=None, iter_rows=None):
        self._scalar_one = scalar_one
        self._scalars_all = scalars_all or []
        self._iter_rows = iter_rows if iter_rows is not None else []

    def scalar_one_or_none(self):
        return self._scalar_one

    def scalars(self):
        return DummyScalarList(self._scalars_all)

    def __iter__(self):
        return iter(self._iter_rows)


class DummySession:
    def __init__(self, execute_results=None, scalars_results=None):
        self.execute_results = execute_results or []
        self.scalars_results = scalars_results or []
        self.execute_calls = 0
        self.scalars_calls = 0
        self.added = []
        self.deleted = []
        self.commits = 0
        self.rollbacks = 0
        self.refresh_calls = []

    async def execute(self, stmt):
        result = self.execute_results[self.execute_calls]
        self.execute_calls += 1
        return result

    async def scalars(self, stmt):
        result = self.scalars_results[self.scalars_calls]
        self.scalars_calls += 1
        return result

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1
        for i, obj in enumerate(self.added, start=1):
            if getattr(obj, "id", None) is None:
                obj.id = i

    async def rollback(self):
        self.rollbacks += 1

    async def refresh(self, obj):
        self.refresh_calls.append(obj)


@pytest.mark.asyncio
async def test_get_all_tasks_returns_list_for_super_admin(monkeypatch):
    tasks = [
        SimpleNamespace(id=1, title="Task A"),
        SimpleNamespace(id=2, title="Task B"),
    ]
    session = DummySession(
        scalars_results=[DummyScalarList(tasks)]
    )
    service = TaskService(session)

    async def mock_ensure_super_admin(session_arg, current_user_id):
        assert session_arg == session
        assert current_user_id == 1

    monkeypatch.setattr(
        "modules.tasks.service.ensure_user_is_super_admin_global",
        mock_ensure_super_admin,
    )

    result = await service.get_all_tasks(current_user_id=1)

    assert len(result) == 2
    assert result[0].title == "Task A"
    assert result[1].title == "Task B"


@pytest.mark.asyncio
async def test_get_user_tasks_returns_tasks_with_group_roles():
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
        id=1,
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        position=0,
        start_date=None,
        deadline=None,
        project_id=1,
        tags=["backend"],
        group=group,
        project=SimpleNamespace(id=1, title="Project Alpha"),
        assignees=[user],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult(scalars_all=[task])]
    )
    service = TaskService(session)

    result = await service.get_user_tasks(user_id=10)

    assert len(result) == 1
    assert result[0].title == "Fix auth"
    assert result[0].group.users[0].role == "admin"


@pytest.mark.asyncio
async def test_get_task_by_id_raises_for_missing_task():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = TaskService(session)

    with pytest.raises(TaskNotFoundError):
        await service.get_task_by_id(999)


@pytest.mark.asyncio
async def test_create_task_creates_task_and_assigns_current_user(monkeypatch):
    class FakeTask:
        def __init__(self, title, description, status, priority, start_date, deadline, project_id, group_id, tags):
            self.id = None
            self.title = title
            self.description = description
            self.status = status
            self.priority = priority
            self.start_date = start_date
            self.deadline = deadline
            self.project_id = project_id
            self.group_id = group_id
            self.tags = tags
            self.assignees = []

    group = SimpleNamespace(id=1, name="Backend")
    project = SimpleNamespace(id=1, title="Project Alpha", groups=[group])
    created_task = SimpleNamespace(
        id=1,
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        position=0,
        start_date=None,
        deadline=None,
        project_id=1,
        tags=["backend"],
        group=group,
        project=project,
        assignees=[],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
            DummyExecuteResult(scalar_one=group),
        ]
    )
    service = TaskService(session)
    current_user = SimpleNamespace(id=5, login="author")

    async def mock_check_user_in_group(session_arg, user_id, group_id):
        assert session_arg == session
        assert user_id == 5
        assert group_id == 1
        return True

    async def mock_get_task_by_id(task_id: int):
        assert task_id == 1
        return created_task

    monkeypatch.setattr(
        "modules.tasks.service.check_user_in_group",
        mock_check_user_in_group,
    )
    monkeypatch.setattr(
        "modules.tasks.service.Task",
        FakeTask,
    )
    monkeypatch.setattr(service, "get_task_by_id", mock_get_task_by_id)

    task_data = TaskCreate(
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        start_date=None,
        deadline=None,
        project_id=1,
        group_id=1,
        tags=["backend"],
    )

    result = await service.create_task(task_data, current_user)

    assert result.title == "Fix auth"
    assert len(session.added) == 1
    assert session.commits == 1

    added_task = session.added[0]
    assert added_task.title == "Fix auth"
    assert added_task.project_id == 1
    assert added_task.group_id == 1
    assert len(added_task.assignees) == 1
    assert added_task.assignees[0].id == 5


@pytest.mark.asyncio
async def test_create_task_raises_when_project_not_found():
    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=None),
        ]
    )
    service = TaskService(session)
    current_user = SimpleNamespace(id=5)

    task_data = TaskCreate(
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        start_date=None,
        deadline=None,
        project_id=999,
        group_id=1,
        tags=[],
    )

    with pytest.raises(ProjectNotFoundError):
        await service.create_task(task_data, current_user)


@pytest.mark.asyncio
async def test_create_task_raises_when_group_not_in_project():
    group = SimpleNamespace(id=2, name="Frontend")
    other_group = SimpleNamespace(id=1, name="Backend")
    project = SimpleNamespace(id=1, title="Project Alpha", groups=[other_group])

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
            DummyExecuteResult(scalar_one=group),
        ]
    )
    service = TaskService(session)
    current_user = SimpleNamespace(id=5)

    task_data = TaskCreate(
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        start_date=None,
        deadline=None,
        project_id=1,
        group_id=2,
        tags=[],
    )

    with pytest.raises(GroupNotInProjectError):
        await service.create_task(task_data, current_user)


@pytest.mark.asyncio
async def test_create_task_for_users_raises_when_non_admin_assigns_other_users(monkeypatch):
    group = SimpleNamespace(id=1, name="Backend")
    project = SimpleNamespace(id=1, title="Project Alpha", groups=[group])

    session = DummySession(
        execute_results=[
            DummyExecuteResult(scalar_one=project),
            DummyExecuteResult(scalar_one=group),
        ]
    )
    service = TaskService(session)
    current_user = SimpleNamespace(id=5)

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        raise InsufficientPermissionsError()

    monkeypatch.setattr(
        "modules.tasks.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )

    task_data = TaskCreate(
        title="Fix auth",
        description="Important task",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.HIGH,
        start_date=None,
        deadline=None,
        project_id=1,
        group_id=1,
        tags=[],
    )

    with pytest.raises(TaskAccessDeniedError, match="Только администраторы"):
        await service.create_task_for_users(task_data, [10, 11], current_user)


@pytest.mark.asyncio
async def test_add_users_to_task_raises_for_users_not_in_group(monkeypatch):
    current_user = SimpleNamespace(id=5)
    task = SimpleNamespace(
        id=1,
        title="Fix auth",
        group_id=1,
        assignees=[current_user],
    )

    session = DummySession(
        execute_results=[
            DummyExecuteResult(iter_rows=[(10,)]),
        ]
    )
    service = TaskService(session)

    async def mock_get_task_by_id(task_id: int):
        return task

    monkeypatch.setattr(service, "get_task_by_id", mock_get_task_by_id)

    data = AddRemoveUsersToTask(user_ids=[10, 11])

    with pytest.raises(UsersNotInGroupError):
        await service.add_users_to_task(1, data, current_user)


@pytest.mark.asyncio
async def test_update_task_updates_fields_for_assignee():
    current_user = SimpleNamespace(id=5)
    task = SimpleNamespace(
        id=1,
        title="Old title",
        description="Old desc",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.MEDIUM,
        position=0,
        start_date=None,
        deadline=None,
        tags=["old"],
        group_id=1,
        assignees=[current_user],
    )

    session = DummySession()
    service = TaskService(session)

    update_data = TaskUpdate(
        title="New title",
        description="New desc",
        priority=TaskPriority.HIGH,
        tags=["new"],
    )

    result = await service.update_task(task, update_data, current_user)

    assert result.title == "New title"
    assert result.description == "New desc"
    assert result.priority == TaskPriority.HIGH
    assert result.tags == ["new"]
    assert session.commits == 1
    assert len(session.refresh_calls) == 1


@pytest.mark.asyncio
async def test_remove_users_from_task_deletes_task_when_last_assignee_removed(monkeypatch):
    removed_user = SimpleNamespace(id=10)
    group = SimpleNamespace(id=1)
    task = SimpleNamespace(
        id=1,
        title="Fix auth",
        group=group,
        group_id=1,
        assignees=[removed_user],
    )

    session = DummySession(
        execute_results=[DummyExecuteResult()]
    )
    service = TaskService(session)
    current_user = SimpleNamespace(id=5)

    async def mock_get_task_by_id(task_id: int):
        return task

    async def mock_ensure_user_is_admin(session_arg, user_id, group_id):
        assert group_id == 1

    monkeypatch.setattr(service, "get_task_by_id", mock_get_task_by_id)
    monkeypatch.setattr(
        "modules.tasks.service.ensure_user_is_admin",
        mock_ensure_user_is_admin,
    )

    data = AddRemoveUsersToTask(user_ids=[10])

    result = await service.remove_users_from_task(1, data, current_user)

    assert result["detail"] == "Задача удалена, так как не осталось исполнителей"
    assert session.commits == 1
    assert len(session.deleted) == 1
    assert session.deleted[0] == task


@pytest.mark.asyncio
async def test_bulk_update_tasks_updates_status_priority_and_position(monkeypatch):
    current_user = SimpleNamespace(id=5)
    task = SimpleNamespace(
        id=1,
        title="Fix auth",
        status=TaskStatus.BACKLOG,
        priority=TaskPriority.MEDIUM,
        position=0,
        group_id=1,
        assignees=[current_user],
    )

    session = DummySession()
    service = TaskService(session)

    async def mock_get_task_by_id(task_id: int):
        assert task_id == 1
        return task

    monkeypatch.setattr(service, "get_task_by_id", mock_get_task_by_id)

    updates = [
        TaskBulkUpdate(
            task_id=1,
            status=TaskStatus.IN_PROGRESS,
            position=3,
            priority=TaskPriority.HIGH,
        )
    ]

    result = await service.bulk_update_tasks(updates, current_user)

    assert len(result) == 1
    assert task.status == TaskStatus.IN_PROGRESS
    assert task.position == 3
    assert task.priority == TaskPriority.HIGH
    assert len(session.added) == 2
    assert session.commits == 1
    assert len(session.refresh_calls) == 1