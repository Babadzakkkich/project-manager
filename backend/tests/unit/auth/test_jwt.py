import pytest

from modules.auth.schemas import TokenPayload
from modules.auth.jwt import create_access_token, verify_refresh_token


def test_create_access_token_returns_jwt_string():
    payload = TokenPayload(
        sub=1,
        login="test_user",
        type="access",
    )

    token = create_access_token(payload)

    assert isinstance(token, str)
    assert token
    assert token.count(".") == 2


@pytest.mark.asyncio
async def test_verify_refresh_token_returns_token_payload(
    fake_session,
    test_user,
    monkeypatch,
):
    async def mock_verify_and_mark_used_refresh_token(session, refresh_token):
        assert session == fake_session
        assert refresh_token == "valid-refresh-token"
        return test_user.id

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == test_user.id
        return test_user

    monkeypatch.setattr(
        "modules.auth.jwt.verify_and_mark_used_refresh_token",
        mock_verify_and_mark_used_refresh_token,
    )
    monkeypatch.setattr(
        "modules.auth.jwt.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    result = await verify_refresh_token(fake_session, "valid-refresh-token")

    assert result.sub == test_user.id
    assert result.login == test_user.login
    assert result.type == "refresh"


@pytest.mark.asyncio
async def test_verify_refresh_token_raises_value_error_for_missing_user(
    fake_session,
    monkeypatch,
):
    async def mock_verify_and_mark_used_refresh_token(session, refresh_token):
        return 999

    async def mock_get_user_by_id(self, user_id: int):
        return None

    monkeypatch.setattr(
        "modules.auth.jwt.verify_and_mark_used_refresh_token",
        mock_verify_and_mark_used_refresh_token,
    )
    monkeypatch.setattr(
        "modules.auth.jwt.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    with pytest.raises(ValueError):
        await verify_refresh_token(fake_session, "valid-refresh-token")


@pytest.mark.asyncio
async def test_verify_refresh_token_propagates_refresh_token_validation_error(
    fake_session,
    monkeypatch,
):
    async def mock_verify_and_mark_used_refresh_token(session, refresh_token):
        raise ValueError("Невалидный или просроченный refresh токен")

    monkeypatch.setattr(
        "modules.auth.jwt.verify_and_mark_used_refresh_token",
        mock_verify_and_mark_used_refresh_token,
    )

    with pytest.raises(ValueError, match="Невалидный или просроченный refresh токен"):
        await verify_refresh_token(fake_session, "bad-refresh-token")