import pytest

from modules.auth.service import AuthService
from modules.auth.exceptions import InvalidCredentialsError


@pytest.mark.asyncio
async def test_authenticate_user_returns_user_for_valid_credentials(
    fake_session,
    test_user,
    monkeypatch,
):
    service = AuthService(fake_session)

    async def mock_get_user_by_login(login: str):
        assert login == "test_user"
        return test_user

    def mock_verify_password(password: str, password_hash: str):
        assert password == "correct_password"
        assert password_hash == test_user.password_hash
        return True

    monkeypatch.setattr(
        service.user_service,
        "get_user_by_login",
        mock_get_user_by_login,
    )
    monkeypatch.setattr(
        "modules.auth.service.verify_password",
        mock_verify_password,
    )

    result = await service.authenticate_user("test_user", "correct_password")

    assert result == test_user


@pytest.mark.asyncio
async def test_authenticate_user_returns_false_when_user_not_found(
    fake_session,
    monkeypatch,
):
    service = AuthService(fake_session)

    async def mock_get_user_by_login(login: str):
        return None

    monkeypatch.setattr(
        service.user_service,
        "get_user_by_login",
        mock_get_user_by_login,
    )

    result = await service.authenticate_user("missing_user", "any_password")

    assert result is False


@pytest.mark.asyncio
async def test_authenticate_user_returns_false_for_invalid_password(
    fake_session,
    test_user,
    monkeypatch,
):
    service = AuthService(fake_session)

    async def mock_get_user_by_login(login: str):
        return test_user

    def mock_verify_password(password: str, password_hash: str):
        return False

    monkeypatch.setattr(
        service.user_service,
        "get_user_by_login",
        mock_get_user_by_login,
    )
    monkeypatch.setattr(
        "modules.auth.service.verify_password",
        mock_verify_password,
    )

    result = await service.authenticate_user("test_user", "wrong_password")

    assert result is False


@pytest.mark.asyncio
async def test_login_user_returns_tokens_for_valid_credentials(
    fake_session,
    test_user,
    monkeypatch,
):
    service = AuthService(fake_session)

    async def mock_authenticate_user(login: str, password: str):
        assert login == "test_user"
        assert password == "correct_password"
        return test_user

    def mock_create_access_token(payload):
        assert payload.sub == test_user.id
        assert payload.login == test_user.login
        assert payload.type == "access"
        return "generated-access-token"

    async def mock_create_refresh_token(session, user_id: int, login: str):
        assert session == fake_session
        assert user_id == test_user.id
        assert login == test_user.login
        return "generated-refresh-token"

    monkeypatch.setattr(service, "authenticate_user", mock_authenticate_user)
    monkeypatch.setattr(
        "modules.auth.service.create_access_token",
        mock_create_access_token,
    )
    monkeypatch.setattr(
        "modules.auth.service.create_refresh_token",
        mock_create_refresh_token,
    )

    result = await service.login_user("test_user", "correct_password")

    assert result == {
        "access_token": "generated-access-token",
        "refresh_token": "generated-refresh-token",
    }


@pytest.mark.asyncio
async def test_login_user_raises_invalid_credentials_for_invalid_user(
    fake_session,
    monkeypatch,
):
    service = AuthService(fake_session)

    async def mock_authenticate_user(login: str, password: str):
        return False

    monkeypatch.setattr(service, "authenticate_user", mock_authenticate_user)

    with pytest.raises(InvalidCredentialsError):
        await service.login_user("test_user", "wrong_password")