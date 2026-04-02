from fastapi import Response

from modules.auth.utils.cookie_management import (
    set_auth_cookies,
    clear_auth_cookies,
)


def test_set_auth_cookies_sets_access_and_refresh_cookies():
    response = Response()

    set_auth_cookies(
        response=response,
        access_token="access-token-value",
        refresh_token="refresh-token-value",
    )

    set_cookie_headers = response.headers.getlist("set-cookie")

    assert len(set_cookie_headers) == 2
    assert any("access_token=access-token-value" in header for header in set_cookie_headers)
    assert any("refresh_token=refresh-token-value" in header for header in set_cookie_headers)
    assert all("HttpOnly" in header for header in set_cookie_headers)
    assert all("Path=/" in header for header in set_cookie_headers)


def test_clear_auth_cookies_removes_access_and_refresh_cookies():
    response = Response()

    clear_auth_cookies(response)

    set_cookie_headers = response.headers.getlist("set-cookie")

    assert len(set_cookie_headers) == 2
    assert any("access_token=" in header for header in set_cookie_headers)
    assert any("refresh_token=" in header for header in set_cookie_headers)
    assert all("Path=/" in header for header in set_cookie_headers)