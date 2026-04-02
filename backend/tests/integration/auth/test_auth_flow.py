from types import SimpleNamespace

import pytest
from jose import jwt as jose_jwt


@pytest.mark.integration
def test_full_auth_flow_login_check_refresh_logout(client, monkeypatch, test_user):
    """
    Интеграционный сценарий:
    1. login -> ставятся cookies
    2. check -> пользователь аутентифицирован
    3. refresh -> токены обновляются
    4. logout -> cookies очищаются
    """

    async def mock_login_user(self, login: str, password: str):
        assert login == "test_user"
        assert password == "test_password"
        return {
            "access_token": "initial-access-token",
            "refresh_token": "initial-refresh-token",
        }

    def mock_decode_valid_access(token, secret, algorithms, options=None, **kwargs):
        assert token == "initial-access-token"
        return {"sub": "1", "type": "access"}

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    async def mock_verify_refresh_token(session, refresh_token: str):
        assert refresh_token == "initial-refresh-token"
        return SimpleNamespace(sub=1, login="test_user", type="refresh")

    def mock_create_access_token(payload):
        assert payload.sub == 1
        assert payload.login == "test_user"
        assert payload.type == "refresh" or payload.type == "access"
        return "refreshed-access-token"

    async def mock_create_refresh_token(session, user_id: int, login: str):
        assert user_id == 1
        assert login == "test_user"
        return "refreshed-refresh-token"

    async def mock_revoke_all_user_tokens(session, user_id: int):
        assert user_id == 1
        return None

    monkeypatch.setattr(
        "modules.auth.router.AuthService.login_user",
        mock_login_user,
    )
    monkeypatch.setattr(
        jose_jwt,
        "decode",
        mock_decode_valid_access,
    )
    monkeypatch.setattr(
        "modules.auth.router.UserService.get_user_by_id",
        mock_get_user_by_id,
    )
    monkeypatch.setattr(
        "modules.auth.router.verify_refresh_token",
        mock_verify_refresh_token,
    )
    monkeypatch.setattr(
        "modules.auth.router.create_access_token",
        mock_create_access_token,
    )
    monkeypatch.setattr(
        "modules.auth.router.create_refresh_token",
        mock_create_refresh_token,
    )
    monkeypatch.setattr(
        "modules.auth.router.revoke_all_user_tokens",
        mock_revoke_all_user_tokens,
    )

    login_response = client.post(
        "/auth/login",
        data={"username": "test_user", "password": "test_password"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == {"message": "Успешный вход в систему"}

    set_cookie_header = login_response.headers.get("set-cookie", "")
    assert "access_token=initial-access-token" in set_cookie_header
    assert "refresh_token=initial-refresh-token" in set_cookie_header

    client.cookies.set("access_token", "initial-access-token")
    client.cookies.set("refresh_token", "initial-refresh-token")

    check_response = client.get("/auth/check")

    assert check_response.status_code == 200
    assert check_response.json() == {
        "authenticated": True,
        "user": {
            "id": 1,
            "login": "test_user",
            "email": "test@example.com",
            "name": "Test User",
        },
    }

    refresh_response = client.post("/auth/refresh")

    assert refresh_response.status_code == 200
    assert refresh_response.json() == {"message": "Токены успешно обновлены"}

    refresh_set_cookie = refresh_response.headers.get("set-cookie", "")
    assert "access_token=refreshed-access-token" in refresh_set_cookie
    assert "refresh_token=refreshed-refresh-token" in refresh_set_cookie

    client.cookies.set("access_token", "initial-access-token")
    logout_response = client.post("/auth/logout")

    assert logout_response.status_code == 200
    assert logout_response.json() == {"detail": "Успешный выход из системы"}

    logout_set_cookie = logout_response.headers.get("set-cookie", "")
    assert "access_token=" in logout_set_cookie
    assert "refresh_token=" in logout_set_cookie


@pytest.mark.integration
def test_auth_check_reissues_access_token_when_current_access_token_expired(
    client,
    monkeypatch,
    test_user,
):
    """
    Интеграционный сценарий:
    access token истёк, но refresh token валиден ->
    /auth/check должен перевыпустить access token и вернуть authenticated=True
    """

    def mock_decode_expired(token, secret, algorithms, options=None, **kwargs):
        raise jose_jwt.ExpiredSignatureError("expired")

    async def mock_verify_refresh_token(session, refresh_token: str):
        assert refresh_token == "valid-refresh-token"
        return SimpleNamespace(sub=1, login="test_user", type="refresh")

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    def mock_create_access_token(payload):
        assert payload.sub == 1
        assert payload.login == "test_user"
        assert payload.type == "access"
        return "reissued-access-token"

    monkeypatch.setattr(
        jose_jwt,
        "decode",
        mock_decode_expired,
    )
    monkeypatch.setattr(
        "modules.auth.router.verify_refresh_token",
        mock_verify_refresh_token,
    )
    monkeypatch.setattr(
        "modules.auth.router.UserService.get_user_by_id",
        mock_get_user_by_id,
    )
    monkeypatch.setattr(
        "modules.auth.router.create_access_token",
        mock_create_access_token,
    )

    client.cookies.set("access_token", "expired-access-token")
    client.cookies.set("refresh_token", "valid-refresh-token")

    response = client.get("/auth/check")

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "user": {
            "id": 1,
            "login": "test_user",
            "email": "test@example.com",
            "name": "Test User",
        },
    }

    set_cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=reissued-access-token" in set_cookie_header


@pytest.mark.integration
def test_auth_check_returns_not_authenticated_without_tokens(client):
    response = client.get("/auth/check")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}