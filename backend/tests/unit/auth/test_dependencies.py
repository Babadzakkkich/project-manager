import pytest
from fastapi import Request
from jose import jwt

from modules.auth.dependencies import (
    get_current_user,
    get_optional_current_user,
    get_current_user_ws,
)
from modules.auth.exceptions import TokenValidationError


def build_request_with_cookies(cookies: dict):
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
    }
    request = Request(scope)
    request._cookies = cookies
    return request


class DummyWebSocket:
    def __init__(self, cookie_header: str = ""):
        self.headers = {"cookie": cookie_header}


@pytest.mark.asyncio
async def test_get_current_user_returns_user(
    fake_session,
    test_user,
    monkeypatch,
):
    request = build_request_with_cookies({"access_token": "valid-token"})

    def mock_decode(token, secret, algorithms, **kwargs):
        assert token == "valid-token"
        return {"sub": "1", "type": "access"}

    async def mock_get_user_by_id(self, user_id: int):
        assert user_id == 1
        return test_user

    monkeypatch.setattr(jwt, "decode", mock_decode)
    monkeypatch.setattr(
        "modules.auth.dependencies.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    user = await get_current_user(request=request, session=fake_session)

    assert user == test_user


@pytest.mark.asyncio
async def test_get_current_user_raises_when_cookie_missing(fake_session):
    request = build_request_with_cookies({})

    with pytest.raises(TokenValidationError):
        await get_current_user(request=request, session=fake_session)


@pytest.mark.asyncio
async def test_get_current_user_raises_for_wrong_token_type(
    fake_session,
    monkeypatch,
):
    request = build_request_with_cookies({"access_token": "wrong-type-token"})

    def mock_decode(token, secret, algorithms, **kwargs):
        return {"sub": "1", "type": "refresh"}

    monkeypatch.setattr(jwt, "decode", mock_decode)

    with pytest.raises(TokenValidationError):
        await get_current_user(request=request, session=fake_session)


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_without_cookie(fake_session):
    request = build_request_with_cookies({})

    user = await get_optional_current_user(request=request, session=fake_session)

    assert user is None


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_user(
    fake_session,
    test_user,
    monkeypatch,
):
    request = build_request_with_cookies({"access_token": "valid-token"})

    def mock_decode(token, secret, algorithms, **kwargs):
        return {"sub": "1", "type": "access"}

    async def mock_get_user_by_id(self, user_id: int):
        return test_user

    monkeypatch.setattr(jwt, "decode", mock_decode)
    monkeypatch.setattr(
        "modules.auth.dependencies.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    user = await get_optional_current_user(request=request, session=fake_session)

    assert user == test_user


@pytest.mark.asyncio
async def test_get_current_user_ws_returns_user(
    fake_session,
    test_user,
    monkeypatch,
):
    websocket = DummyWebSocket("access_token=valid-token; refresh_token=refresh")

    def mock_decode(token, secret, algorithms, **kwargs):
        assert token == "valid-token"
        return {"sub": "1", "type": "access"}

    async def mock_get_user_by_id(self, user_id: int):
        return test_user

    monkeypatch.setattr(jwt, "decode", mock_decode)
    monkeypatch.setattr(
        "modules.auth.dependencies.UserService.get_user_by_id",
        mock_get_user_by_id,
    )

    user = await get_current_user_ws(websocket=websocket, session=fake_session)

    assert user == test_user


@pytest.mark.asyncio
async def test_get_current_user_ws_returns_none_without_access_token(fake_session):
    websocket = DummyWebSocket("refresh_token=refresh-only")

    user = await get_current_user_ws(websocket=websocket, session=fake_session)

    assert user is None