from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from modules.auth.refresh_token import (
    hash_token,
    generate_refresh_token,
    create_refresh_token_record,
    verify_and_mark_used_refresh_token,
    revoke_all_user_tokens,
    cleanup_expired_tokens,
)


class DummyScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class DummySession:
    def __init__(self, execute_result=None):
        self.added = []
        self.commits = 0
        self.executed = []
        self.execute_result = execute_result

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def execute(self, stmt):
        self.executed.append(stmt)
        return self.execute_result


def test_hash_token_returns_stable_sha256_hash():
    token = "my-refresh-token"

    result = hash_token(token)

    assert isinstance(result, str)
    assert len(result) == 64
    assert result == hash_token(token)


def test_generate_refresh_token_returns_non_empty_random_string():
    token_1 = generate_refresh_token()
    token_2 = generate_refresh_token()

    assert isinstance(token_1, str)
    assert isinstance(token_2, str)
    assert token_1
    assert token_2
    assert token_1 != token_2


@pytest.mark.asyncio
async def test_create_refresh_token_record_creates_db_record_and_commits(monkeypatch):
    session = DummySession()

    monkeypatch.setattr(
        "modules.auth.refresh_token.generate_refresh_token",
        lambda: "plain-refresh-token",
    )

    token = await create_refresh_token_record(
        session=session,
        user_id=10,
        expires_delta_days=7,
    )

    assert token == "plain-refresh-token"
    assert len(session.added) == 1
    assert session.commits == 1

    db_obj = session.added[0]
    assert db_obj.user_id == 10
    assert db_obj.token_hash == hash_token("plain-refresh-token")
    assert db_obj.used is False
    assert db_obj.expires_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_verify_and_mark_used_refresh_token_returns_user_id_and_marks_token_used():
    db_token = SimpleNamespace(
        user_id=7,
        used=False,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    session = DummySession(execute_result=DummyScalarResult(db_token))

    user_id = await verify_and_mark_used_refresh_token(
        session=session,
        refresh_token="valid-token",
    )

    assert user_id == 7
    assert db_token.used is True
    assert session.commits == 1
    assert len(session.executed) == 1


@pytest.mark.asyncio
async def test_verify_and_mark_used_refresh_token_raises_for_invalid_token():
    session = DummySession(execute_result=DummyScalarResult(None))

    with pytest.raises(ValueError, match="Невалидный или просроченный refresh токен"):
        await verify_and_mark_used_refresh_token(
            session=session,
            refresh_token="invalid-token",
        )


@pytest.mark.asyncio
async def test_verify_and_mark_used_refresh_token_raises_for_already_used_token():
    db_token = SimpleNamespace(
        user_id=7,
        used=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    session = DummySession(execute_result=DummyScalarResult(db_token))

    with pytest.raises(ValueError, match="Невалидный или просроченный refresh токен"):
        await verify_and_mark_used_refresh_token(
            session=session,
            refresh_token="used-token",
        )


@pytest.mark.asyncio
async def test_verify_and_mark_used_refresh_token_raises_for_expired_token():
    db_token = SimpleNamespace(
        user_id=7,
        used=False,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    session = DummySession(execute_result=DummyScalarResult(db_token))

    with pytest.raises(ValueError, match="Невалидный или просроченный refresh токен"):
        await verify_and_mark_used_refresh_token(
            session=session,
            refresh_token="expired-token",
        )


@pytest.mark.asyncio
async def test_revoke_all_user_tokens_executes_delete_and_commits():
    session = DummySession()

    await revoke_all_user_tokens(session=session, user_id=5)

    assert len(session.executed) == 1
    assert session.commits == 1


@pytest.mark.asyncio
async def test_cleanup_expired_tokens_executes_delete_and_commits():
    session = DummySession()

    await cleanup_expired_tokens(session=session)

    assert len(session.executed) == 1
    assert session.commits == 1