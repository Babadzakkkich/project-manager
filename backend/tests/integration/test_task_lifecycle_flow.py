from types import SimpleNamespace

import pytest

from core.database.models import TaskPriority, TaskStatus
from core.database.session import db_session
from modules.auth.dependencies import get_current_user
from shared.dependencies import get_service_factory


@pytest.mark.integration
def test_task_lifecycle_flow(integration_app, integration_client):
    """
    Сквозной интеграционный сценарий жизненного цикла задачи:
    1. создаётся задача
    2. меняется статус
    3. меняется приоритет
    4. меняется позиция
    5. выполняется bulk update
    6. проверяется история изменений
    """

    created_state = {
        "task": None,
        "history": [],
    }

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    class FakeTaskService:
        async def create_task(self, task_data, current_user):
            created_state["task"] = {
                "id": 200,
                "title": task_data.title,
                "description": task_data.description,
                "status": task_data.status.value if hasattr(task_data.status, "value") else str(task_data.status),
                "priority": task_data.priority.value if hasattr(task_data.priority, "value") else str(task_data.priority),
                "position": 0,
                "start_date": None,
                "deadline": None,
                "project_id": task_data.project_id,
                "group_id": task_data.group_id,
                "tags": task_data.tags,
                "project": {
                    "id": task_data.project_id,
                    "title": "Project Alpha",
                    "description": "Alpha integration project",
                    "status": "active",
                    "start_date": "2026-01-10T09:00:00",
                    "end_date": "2026-02-10T18:00:00",
                },
                "group": {
                    "id": task_data.group_id,
                    "name": "Backend Team",
                    "description": "Core backend group",
                    "created_at": "2026-01-01T12:00:00",
                    "users": [
                        {
                            "id": 1,
                            "login": "test_user",
                            "email": "test@example.com",
                            "name": "Test User",
                            "role": "admin",
                        }
                    ],
                },
                "assignees": [
                    {
                        "id": 1,
                        "login": "test_user",
                        "email": "test@example.com",
                        "name": "Test User",
                    }
                ],
            }

            created_state["history"].append(
                {
                    "id": 1,
                    "action": "create",
                    "old_value": None,
                    "new_value": task_data.title,
                    "details": "Task created",
                    "created_at": "2026-01-01T12:00:00",
                    "user": {
                        "id": 1,
                        "login": "test_user",
                        "email": "test@example.com",
                        "name": "Test User",
                    },
                }
            )

            return created_state["task"]

        async def update_task_status(self, task_id: int, status_update, current_user):
            created_state["task"]["status"] = (
                status_update.value if hasattr(status_update, "value") else str(status_update)
            )

            created_state["history"].append(
                {
                    "id": 2,
                    "action": "status_change",
                    "old_value": "backlog",
                    "new_value": created_state["task"]["status"],
                    "details": "Task status changed",
                    "created_at": "2026-01-01T12:05:00",
                    "user": {
                        "id": 1,
                        "login": "test_user",
                        "email": "test@example.com",
                        "name": "Test User",
                    },
                }
            )

            return SimpleNamespace(
                id=created_state["task"]["id"],
                title=created_state["task"]["title"],
                description=created_state["task"]["description"],
                status=created_state["task"]["status"],
                priority=created_state["task"]["priority"],
                position=created_state["task"]["position"],
                start_date=None,
                deadline=None,
                project_id=created_state["task"]["project_id"],
                group_id=created_state["task"]["group_id"],
                tags=created_state["task"]["tags"],
            )

        async def update_task_priority(self, task_id: int, priority_update, current_user):
            created_state["task"]["priority"] = (
                priority_update.value if hasattr(priority_update, "value") else str(priority_update)
            )

            created_state["history"].append(
                {
                    "id": 3,
                    "action": "priority_change",
                    "old_value": "high",
                    "new_value": created_state["task"]["priority"],
                    "details": "Task priority changed",
                    "created_at": "2026-01-01T12:10:00",
                    "user": {
                        "id": 1,
                        "login": "test_user",
                        "email": "test@example.com",
                        "name": "Test User",
                    },
                }
            )

            return SimpleNamespace(
                id=created_state["task"]["id"],
                title=created_state["task"]["title"],
                description=created_state["task"]["description"],
                status=created_state["task"]["status"],
                priority=created_state["task"]["priority"],
                position=created_state["task"]["position"],
                start_date=None,
                deadline=None,
                project_id=created_state["task"]["project_id"],
                group_id=created_state["task"]["group_id"],
                tags=created_state["task"]["tags"],
            )

        async def update_task_position(self, task_id: int, position: int, current_user):
            created_state["task"]["position"] = position

            created_state["history"].append(
                {
                    "id": 4,
                    "action": "position_change",
                    "old_value": "0",
                    "new_value": str(position),
                    "details": "Task position changed",
                    "created_at": "2026-01-01T12:15:00",
                    "user": {
                        "id": 1,
                        "login": "test_user",
                        "email": "test@example.com",
                        "name": "Test User",
                    },
                }
            )

            return SimpleNamespace(
                id=created_state["task"]["id"],
                title=created_state["task"]["title"],
                description=created_state["task"]["description"],
                status=created_state["task"]["status"],
                priority=created_state["task"]["priority"],
                position=created_state["task"]["position"],
                start_date=None,
                deadline=None,
                project_id=created_state["task"]["project_id"],
                group_id=created_state["task"]["group_id"],
                tags=created_state["task"]["tags"],
            )

        async def bulk_update_tasks(self, updates, current_user):
            results = []

            for update in updates:
                if update.task_id == created_state["task"]["id"]:
                    if update.status is not None:
                        created_state["task"]["status"] = (
                            update.status.value if hasattr(update.status, "value") else str(update.status)
                        )
                    if update.priority is not None:
                        created_state["task"]["priority"] = (
                            update.priority.value if hasattr(update.priority, "value") else str(update.priority)
                        )
                    if update.position is not None:
                        created_state["task"]["position"] = update.position

                    created_state["history"].append(
                        {
                            "id": 5,
                            "action": "bulk_update",
                            "old_value": None,
                            "new_value": "bulk updated",
                            "details": "Task bulk updated",
                            "created_at": "2026-01-01T12:20:00",
                            "user": {
                                "id": 1,
                                "login": "test_user",
                                "email": "test@example.com",
                                "name": "Test User",
                            },
                        }
                    )

                    results.append(
                        SimpleNamespace(
                            id=created_state["task"]["id"],
                            title=created_state["task"]["title"],
                            description=created_state["task"]["description"],
                            status=created_state["task"]["status"],
                            priority=created_state["task"]["priority"],
                            position=created_state["task"]["position"],
                            start_date=None,
                            deadline=None,
                            project_id=created_state["task"]["project_id"],
                            group_id=created_state["task"]["group_id"],
                            tags=created_state["task"]["tags"],
                        )
                    )

            return results

        async def get_task_history(self, task_id: int):
            return created_state["history"]
        
        async def get_task_by_id(self, task_id: int):
            if created_state["task"] is None or task_id != created_state["task"]["id"]:
                raise Exception("Task not found")

            return SimpleNamespace(
                id=created_state["task"]["id"],
                title=created_state["task"]["title"],
                description=created_state["task"]["description"],
                status=created_state["task"]["status"],
                priority=created_state["task"]["priority"],
                position=created_state["task"]["position"],
                start_date=created_state["task"]["start_date"],
                deadline=created_state["task"]["deadline"],
                project_id=created_state["task"]["project_id"],
                group_id=created_state["task"]["group_id"],
                tags=created_state["task"]["tags"],
                project=SimpleNamespace(
                    id=created_state["task"]["project"]["id"],
                    title=created_state["task"]["project"]["title"],
                    description=created_state["task"]["project"]["description"],
                    status=created_state["task"]["project"]["status"],
                    start_date=created_state["task"]["project"]["start_date"],
                    end_date=created_state["task"]["project"]["end_date"],
                ),
                group=SimpleNamespace(
                    id=created_state["task"]["group"]["id"],
                    name=created_state["task"]["group"]["name"],
                    description=created_state["task"]["group"]["description"],
                    created_at=created_state["task"]["group"]["created_at"],
                    users=[],
                ),
                assignees=[
                    SimpleNamespace(
                        id=user["id"],
                        login=user["login"],
                        email=user["email"],
                        name=user["name"],
                    )
                    for user in created_state["task"]["assignees"]
                ],
            )        

    class FakeServiceFactory:
        def __init__(self):
            self.task_service = FakeTaskService()

        def get(self, name: str):
            mapping = {
                "task": self.task_service,
            }
            return mapping[name]

    async def override_service_factory():
        return FakeServiceFactory()

    class DummySessionResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    async def override_session():
        class DummySession:
            async def execute(self, stmt):
                if created_state["task"] is None:
                    return DummySessionResult(None)

                task_obj = SimpleNamespace(
                    id=created_state["task"]["id"],
                    title=created_state["task"]["title"],
                    description=created_state["task"]["description"],
                    status=created_state["task"]["status"],
                    priority=created_state["task"]["priority"],
                    position=created_state["task"]["position"],
                    start_date=created_state["task"]["start_date"],
                    deadline=created_state["task"]["deadline"],
                    project_id=created_state["task"]["project_id"],
                    group_id=created_state["task"]["group_id"],
                    tags=created_state["task"]["tags"],
                    project=SimpleNamespace(
                        id=created_state["task"]["project"]["id"],
                        title=created_state["task"]["project"]["title"],
                        description=created_state["task"]["project"]["description"],
                        status=created_state["task"]["project"]["status"],
                        start_date=created_state["task"]["project"]["start_date"],
                        end_date=created_state["task"]["project"]["end_date"],
                    ),
                    group=SimpleNamespace(
                        id=created_state["task"]["group"]["id"],
                        name=created_state["task"]["group"]["name"],
                        description=created_state["task"]["group"]["description"],
                        created_at=created_state["task"]["group"]["created_at"],
                        users=[],
                    ),
                    assignees=[
                        SimpleNamespace(
                            id=user["id"],
                            login=user["login"],
                            email=user["email"],
                            name=user["name"],
                        )
                        for user in created_state["task"]["assignees"]
                    ],
                )
                return DummySessionResult(task_obj)

        return DummySession()

    integration_app.dependency_overrides[get_current_user] = override_current_user
    integration_app.dependency_overrides[get_service_factory] = override_service_factory
    integration_app.dependency_overrides[db_session.session_getter] = override_session
    
    create_response = integration_client.post(
        "/tasks/",
        json={
            "title": "Lifecycle task",
            "description": "Check task lifecycle",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 10,
            "group_id": 1,
            "tags": ["integration", "lifecycle"],
        },
    )

    assert create_response.status_code == 201
    create_data = create_response.json()
    assert create_data["id"] == 200
    assert create_data["title"] == "Lifecycle task"
    assert create_data["status"] == TaskStatus.BACKLOG.value
    assert create_data["priority"] == TaskPriority.HIGH.value

    status_response = integration_client.put(
        f"/tasks/200/status?status_update={TaskStatus.IN_PROGRESS.value}"
    )

    assert status_response.status_code == 200
    status_data = status_response.json()
    assert status_data["id"] == 200
    assert status_data["status"] == TaskStatus.IN_PROGRESS.value

    priority_response = integration_client.put(
        f"/tasks/200/priority?priority_update={TaskPriority.LOW.value}"
    )

    assert priority_response.status_code == 200
    priority_data = priority_response.json()
    assert priority_data["id"] == 200
    assert priority_data["priority"] == TaskPriority.LOW.value

    position_response = integration_client.put("/tasks/200/position?position=5")

    assert position_response.status_code == 200
    position_data = position_response.json()
    assert position_data["id"] == 200
    assert position_data["position"] == 5

    bulk_response = integration_client.post(
        "/tasks/bulk_update",
        json=[
            {
                "task_id": 200,
                "status": TaskStatus.DONE.value,
                "position": 7,
                "priority": TaskPriority.MEDIUM.value,
            }
        ],
    )

    assert bulk_response.status_code == 200
    bulk_data = bulk_response.json()
    assert len(bulk_data) == 1
    assert bulk_data[0]["id"] == 200
    assert bulk_data[0]["status"] == TaskStatus.DONE.value
    assert bulk_data[0]["position"] == 7
    assert bulk_data[0]["priority"] == TaskPriority.MEDIUM.value

    history_response = integration_client.get("/tasks/200/history")

    assert history_response.status_code == 200
    history_data = history_response.json()
    assert len(history_data) == 5
    assert history_data[0]["action"] == "create"
    assert history_data[1]["action"] == "status_change"
    assert history_data[2]["action"] == "priority_change"
    assert history_data[3]["action"] == "position_change"
    assert history_data[4]["action"] == "bulk_update"