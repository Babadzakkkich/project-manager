from datetime import datetime
from types import SimpleNamespace

import pytest

from core.database.models import NotificationPriority, NotificationType
from modules.notifications.service import NotificationService


def first_enum_member(enum_cls):
    return list(enum_cls)[0]


class DummyScalarList:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items


class DummyExecuteResult:
    def __init__(self, scalar_one=None, scalars_all=None, count_value=None):
        self._scalar_one = scalar_one
        self._scalars_all = scalars_all or []
        self._count_value = count_value

    def scalar_one_or_none(self):
        return self._scalar_one

    def scalar_one(self):
        return self._count_value

    def scalars(self):
        return DummyScalarList(self._scalars_all)


class DummySession:
    def __init__(self, execute_results=None):
        self.execute_results = execute_results or []
        self.execute_calls = 0
        self.added = []
        self.commits = 0
        self.refresh_calls = []
        self.flush_calls = 0

    async def execute(self, stmt):
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

    async def flush(self):
        self.flush_calls += 1
        if self.added:
            for i, obj in enumerate(self.added, start=1):
                if getattr(obj, "id", None) is None:
                    obj.id = i


@pytest.mark.asyncio
@pytest.mark.sanity
async def test_create_creates_and_returns_notification(monkeypatch):
    session = DummySession()
    service = NotificationService(session=session)

    class DummyRedisClient:
        async def invalidate_unread_count(self, user_id: int):
            assert user_id == 10

    monkeypatch.setattr(
        "modules.notifications.service.redis_client",
        DummyRedisClient(),
    )

    notif_type = first_enum_member(NotificationType)

    result = await service.create(
        user_id=10,
        notification_type=notif_type,
        title="Новая задача",
        content="Вам назначена новая задача",
        priority=NotificationPriority.HIGH,
        data={"task_id": 1},
    )

    assert result.user_id == 10
    assert result.type == notif_type
    assert result.title == "Новая задача"
    assert result.content == "Вам назначена новая задача"
    assert result.priority == NotificationPriority.HIGH
    assert result.data == {"task_id": 1}
    assert len(session.added) == 1
    assert session.flush_calls == 1
    assert len(session.refresh_calls) == 1


@pytest.mark.asyncio
async def test_send_returns_false_when_publisher_not_available():
    session = DummySession()
    service = NotificationService(session=session, notification_publisher=None)

    result = await service.send(
        user_id=10,
        notification_type=first_enum_member(NotificationType),
        title="Новая задача",
        content="Вам назначена новая задача",
    )

    assert result is False


@pytest.mark.asyncio
async def test_send_to_user_returns_false_when_publisher_not_available():
    session = DummySession()
    service = NotificationService(session=session, notification_publisher=None)

    result = await service.send_to_user(
        user_id=10,
        message={"type": "ping"},
    )

    assert result is False


@pytest.mark.asyncio
@pytest.mark.sanity
async def test_get_user_notifications_returns_list():
    notif_type_1 = list(NotificationType)[0]
    notif_type_2 = list(NotificationType)[1] if len(list(NotificationType)) > 1 else list(NotificationType)[0]

    notifications = [
        SimpleNamespace(
            id=1,
            user_id=10,
            type=notif_type_1,
            priority=NotificationPriority.HIGH,
            title="Новая задача",
            content="Первая",
            data=None,
            is_read=False,
            read_at=None,
            created_at=datetime(2026, 1, 1, 12, 0, 0),
        ),
        SimpleNamespace(
            id=2,
            user_id=10,
            type=notif_type_2,
            priority=NotificationPriority.MEDIUM,
            title="Обновление проекта",
            content="Вторая",
            data=None,
            is_read=True,
            read_at=datetime(2026, 1, 2, 12, 0, 0),
            created_at=datetime(2026, 1, 2, 12, 0, 0),
        ),
    ]

    session = DummySession(
        execute_results=[DummyExecuteResult(scalars_all=notifications)]
    )
    service = NotificationService(session=session)

    result = await service.get_user_notifications(user_id=10)

    assert len(result) == 2
    assert result[0].title == "Новая задача"
    assert result[1].title == "Обновление проекта"


@pytest.mark.asyncio
async def test_get_unread_count_returns_cached_value(monkeypatch):
    session = DummySession()
    service = NotificationService(session=session)

    class DummyRedisClient:
        async def get(self, key: str):
            assert key == "unread:10"
            return "7"

        async def set(self, key: str, value: str, ttl: int):
            raise AssertionError("set should not be called when cache hit")

    monkeypatch.setattr(
        "modules.notifications.service.redis_client",
        DummyRedisClient(),
    )

    result = await service.get_unread_count(user_id=10)

    assert result == 7


@pytest.mark.asyncio
async def test_get_unread_count_reads_db_and_caches_when_cache_miss(monkeypatch):
    session = DummySession(
        execute_results=[DummyExecuteResult(count_value=3)]
    )
    service = NotificationService(session=session)

    cache_set_calls = []

    class DummyRedisClient:
        async def get(self, key: str):
            assert key == "unread:10"
            return None

        async def set(self, key: str, value: str, ttl: int):
            cache_set_calls.append((key, value, ttl))

    monkeypatch.setattr(
        "modules.notifications.service.redis_client",
        DummyRedisClient(),
    )

    result = await service.get_unread_count(user_id=10)

    assert result == 3
    assert cache_set_calls == [("unread:10", "3", 10)]


@pytest.mark.asyncio
async def test_mark_as_read_returns_true_for_unread_notification(monkeypatch):
    notification = SimpleNamespace(
        id=1,
        user_id=10,
        is_read=False,
        read_at=None,
    )
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=notification)]
    )

    class DummyPublisher:
        async def send_to_user(self, user_id: int, message):
            assert user_id == 10
            assert message == {"type": "unread_count", "count": 0}

    class DummyRedisClient:
        async def invalidate_unread_count(self, user_id: int):
            assert user_id == 10

        async def get(self, key: str):
            return None

        async def set(self, key: str, value: str, ttl: int):
            return None

    monkeypatch.setattr(
        "modules.notifications.service.redis_client",
        DummyRedisClient(),
    )

    service = NotificationService(
        session=session,
        notification_publisher=DummyPublisher(),
    )

    async def mock_get_unread_count(user_id: int):
        assert user_id == 10
        return 0

    service.get_unread_count = mock_get_unread_count

    result = await service.mark_as_read(notification_id=1, user_id=10)

    assert result is True
    assert notification.is_read is True
    assert notification.read_at is not None
    assert session.commits == 1


@pytest.mark.asyncio
async def test_mark_as_read_returns_false_when_notification_not_found():
    session = DummySession(
        execute_results=[DummyExecuteResult(scalar_one=None)]
    )
    service = NotificationService(session=session)

    result = await service.mark_as_read(notification_id=999, user_id=10)

    assert result is False


@pytest.mark.asyncio
async def test_mark_all_as_read_marks_all_unread_notifications(monkeypatch):
    notifications = [
        SimpleNamespace(id=1, user_id=10, is_read=False, read_at=None),
        SimpleNamespace(id=2, user_id=10, is_read=False, read_at=None),
    ]
    session = DummySession(
        execute_results=[DummyExecuteResult(scalars_all=notifications)]
    )

    class DummyPublisher:
        async def send_to_user(self, user_id: int, message):
            assert user_id == 10
            assert message == {"type": "unread_count", "count": 0}

    class DummyRedisClient:
        async def invalidate_unread_count(self, user_id: int):
            assert user_id == 10

    monkeypatch.setattr(
        "modules.notifications.service.redis_client",
        DummyRedisClient(),
    )

    service = NotificationService(
        session=session,
        notification_publisher=DummyPublisher(),
    )

    result = await service.mark_all_as_read(user_id=10)

    assert result == 2
    assert notifications[0].is_read is True
    assert notifications[1].is_read is True
    assert session.commits == 1