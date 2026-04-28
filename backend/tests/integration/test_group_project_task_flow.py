from types import SimpleNamespace

import pytest

from core.database.models import TaskPriority, TaskStatus
from modules.auth.dependencies import get_current_user
from shared.dependencies import get_service_factory


@pytest.mark.integration
def test_group_project_task_flow(integration_app, integration_client):
    """
    Сквозной интеграционный сценарий:
    1. создаётся группа
    2. создаётся проект для этой группы
    3. создаётся задача внутри проекта для этой группы
    4. задача отображается на доске проекта
    """

    created_state = {
        "group": None,
        "project": None,
        "task": None,
    }

    async def override_current_user():
        return SimpleNamespace(
            id=1,
            login="test_user",
            email="test@example.com",
            name="Test User",
        )

    class FakeGroupService:
        async def create_group(self, group_data, current_user):
            created_state["group"] = {
                "id": 1,
                "name": group_data.name,
                "description": group_data.description,
                "created_at": "2026-01-01T12:00:00",
                "users": [],
                "projects": [],
            }
            return created_state["group"]

        async def get_group_by_id(self, group_id: int):
            if created_state["group"] and group_id == created_state["group"]["id"]:
                return created_state["group"]
            raise Exception("Group not found")

    class FakeProjectService:
        async def create_project(self, project_data, current_user):
            assert project_data.group_ids == [1]

            created_state["project"] = {
                "id": 10,
                "title": project_data.title,
                "description": project_data.description,
                "start_date": project_data.start_date.isoformat(),
                "end_date": project_data.end_date.isoformat(),
                "status": project_data.status,
                "groups": [
                    {
                        "id": 1,
                        "name": created_state["group"]["name"],
                        "description": created_state["group"]["description"],
                        "created_at": created_state["group"]["created_at"],
                        "users": [],
                    }
                ],
                "tasks": [],
            }
            return created_state["project"]

        async def get_project_by_id(self, project_id: int):
            if created_state["project"] and project_id == created_state["project"]["id"]:
                return created_state["project"]
            raise Exception("Project not found")

        async def get_user_projects(self, user_id: int):
            if created_state["project"]:
                return [created_state["project"]]
            return []

    class FakeTaskService:
        async def create_task(self, task_data, current_user):
            assert task_data.project_id == 10
            assert task_data.group_id == 1

            created_state["task"] = {
                "id": 100,
                "title": task_data.title,
                "description": task_data.description,
                "status": task_data.status.value if hasattr(task_data.status, "value") else str(task_data.status),
                "priority": task_data.priority.value if hasattr(task_data.priority, "value") else str(task_data.priority),
                "position": 0,
                "start_date": None,
                "deadline": None,
                "project_id": 10,
                "group_id": 1,
                "tags": task_data.tags,
                "project": {
                    "id": 10,
                    "title": created_state["project"]["title"],
                    "description": created_state["project"]["description"],
                    "status": created_state["project"]["status"],
                    "start_date": created_state["project"]["start_date"],
                    "end_date": created_state["project"]["end_date"],
                },
                "group": {
                    "id": 1,
                    "name": created_state["group"]["name"],
                    "description": created_state["group"]["description"],
                    "created_at": created_state["group"]["created_at"],
                    "users": [],
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
            return created_state["task"]

        async def get_project_board_tasks(self, project_id: int, group_id: int, view_mode: str, current_user):
            assert project_id == 10
            assert group_id == 1
            if created_state["task"]:
                return [created_state["task"]]
            return []

    class FakeServiceFactory:
        def __init__(self):
            self.group_service = FakeGroupService()
            self.project_service = FakeProjectService()
            self.task_service = FakeTaskService()

        def get(self, name: str):
            mapping = {
                "group": self.group_service,
                "project": self.project_service,
                "task": self.task_service,
            }
            return mapping[name]

    async def override_service_factory():
        return FakeServiceFactory()

    integration_app.dependency_overrides[get_current_user] = override_current_user
    integration_app.dependency_overrides[get_service_factory] = override_service_factory

    group_response = integration_client.post(
        "/groups/",
        json={
            "name": "Backend Team",
            "description": "Core backend group",
        },
    )

    assert group_response.status_code == 201
    assert group_response.json()["id"] == 1
    assert group_response.json()["name"] == "Backend Team"

    project_response = integration_client.post(
        "/projects/",
        json={
            "title": "Project Alpha",
            "description": "Alpha integration project",
            "start_date": "2026-01-10T09:00:00",
            "end_date": "2026-02-10T18:00:00",
            "status": "active",
            "group_ids": [1],
        },
    )

    assert project_response.status_code == 201
    project_data = project_response.json()
    assert project_data["id"] == 10
    assert project_data["title"] == "Project Alpha"
    assert len(project_data["groups"]) == 1
    assert project_data["groups"][0]["id"] == 1

    task_response = integration_client.post(
        "/tasks/",
        json={
            "title": "Fix integration flow",
            "description": "Check group-project-task chain",
            "status": TaskStatus.BACKLOG.value,
            "priority": TaskPriority.HIGH.value,
            "start_date": None,
            "deadline": None,
            "project_id": 10,
            "group_id": 1,
            "tags": ["integration", "backend"],
        },
    )

    assert task_response.status_code == 201
    task_data = task_response.json()
    assert task_data["id"] == 100
    assert task_data["title"] == "Fix integration flow"
    assert task_data["project_id"] == 10
    assert task_data["group"]["id"] == 1

    board_response = integration_client.get("/tasks/board/project/10?group_id=1&view_mode=team")

    assert board_response.status_code == 200
    board_data = board_response.json()
    assert len(board_data) == 1
    assert board_data[0]["id"] == 100
    assert board_data[0]["title"] == "Fix integration flow"
    assert board_data[0]["project"]["id"] == 10
    assert board_data[0]["group"]["id"] == 1