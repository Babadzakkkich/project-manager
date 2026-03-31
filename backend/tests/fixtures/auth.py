from types import SimpleNamespace

import pytest


@pytest.fixture
def auth_tokens():
    return {
        "access_token": "access-token-value",
        "refresh_token": "refresh-token-value",
    }


@pytest.fixture
def token_payload():
    return SimpleNamespace(
        sub=1,
        login="test_user",
        type="access",
    )