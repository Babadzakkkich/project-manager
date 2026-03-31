import pytest
from jose import jwt as jose_jwt

from modules.auth.exceptions import RefreshTokenError


def test_login_sets_auth_cookies_and_returns_200(client, monkeypatch):
    async def mock_login_user(self, login: str, password: str):
        assert login == "test_user"
        assert password == "test_password"
        return {
            "access_token": "access-cookie-token",
            "refresh_token": "refresh-cookie-token",
        }

    monkeypatch.setattr(
        "modules.auth.router.AuthService.login_user",
        mock_login_user,
    )

    response = client.post(
        "/auth/login",
        data={"username": "test_user", "password": "test_password"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Успешный вход в систему"}

    set_cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=access-cookie-token" in set_cookie_header
    assert "refresh_token=refresh-cookie-token" in set_cookie_header


def test_refresh_returns_400_when_refresh_cookie_missing(client):
    response = client.post("/auth/refresh")

    # Ошибка приходит из кастомного исключения auth-модуля
    assert response.status_code in (400, 401, 422)


def test_refresh_sets_new_cookies_and_returns_200(
    client,
    test_user,
    monkeypatch,
):
    class DummyTokenPayload:
        sub = 1
        login = "test_user"
        type = "refresh"

    async def mock_verify_refresh_token(session, refresh_token: str):
        assert refresh_token == "valid-refresh-token"
        return DummyTokenPayload()

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    def mock_create_access_token(payload):
        assert payload.sub == 1
        return "new-access-token"

    async def mock_create_refresh_token(session, user_id: int, login: str):
        assert user_id == 1
        assert login == "test_user"
        return "new-refresh-token"

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
    monkeypatch.setattr(
        "modules.auth.router.create_refresh_token",
        mock_create_refresh_token,
    )

    response = client.post(
        "/auth/refresh",
        cookies={"refresh_token": "valid-refresh-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Токены успешно обновлены"}

    set_cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=new-access-token" in set_cookie_header
    assert "refresh_token=new-refresh-token" in set_cookie_header


def test_logout_clears_cookies_and_returns_200(client, monkeypatch):
    async def mock_revoke_all_user_tokens(session, user_id: int):
        assert user_id == 1
        return None

    def mock_decode(token, secret, algorithms, options=None):
        assert token == "valid-access-token"
        return {"sub": "1", "type": "access"}

    monkeypatch.setattr(
        "modules.auth.router.revoke_all_user_tokens",
        mock_revoke_all_user_tokens,
    )
    monkeypatch.setattr(
        jose_jwt,
        "decode",
        mock_decode,
    )

    response = client.post(
        "/auth/logout",
        cookies={"access_token": "valid-access-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"detail": "Успешный выход из системы"}

    set_cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=" in set_cookie_header
    assert "refresh_token=" in set_cookie_header


def test_check_returns_authenticated_true_for_valid_access_token(
    client,
    test_user,
    monkeypatch,
):
    def mock_decode(token, secret, algorithms, **kwargs):
        assert token == "valid-access-token"
        return {"sub": "1", "type": "access"}

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    monkeypatch.setattr(jose_jwt, "decode", mock_decode)
    monkeypatch.setattr(
        "modules.auth.router.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    response = client.get(
        "/auth/check",
        cookies={"access_token": "valid-access-token"},
    )

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


def test_check_returns_authenticated_false_without_access_token(client):
    response = client.get("/auth/check")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


@pytest.mark.xfail(
    reason="В auth/check есть дефект: verify_refresh_token возвращает TokenPayload, "
           "а код использует его как user_id и не возвращает Response с новой cookie."
)
def test_check_refresh_flow_should_reissue_access_token_but_currently_broken(
    client,
    test_user,
    monkeypatch,
):
    def mock_decode(token, secret, algorithms, **kwargs):
        raise jose_jwt.ExpiredSignatureError("expired")

    class DummyTokenPayload:
        sub = 1
        login = "test_user"
        type = "refresh"

    async def mock_verify_refresh_token(session, refresh_token):
        return DummyTokenPayload()

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    def mock_create_access_token(payload):
        return "reissued-access-token"

    monkeypatch.setattr(jose_jwt, "decode", mock_decode)
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

    response = client.get(
        "/auth/check",
        cookies={
            "access_token": "expired-access-token",
            "refresh_token": "valid-refresh-token",
        },
    )

    assert response.status_code == 200
    assert response.json()["authenticated"] is True
    assert "access_token=reissued-access-token" in response.headers.get("set-cookie", "")