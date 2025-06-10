from datetime import datetime, timedelta, timezone
from jose import jwt
from .password_hasher import verify_password
from .dependencies import get_user_by_login
from core.config.settings import settings

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.security.secret_key, algorithm=settings.security.algorithm)
    return encoded_jwt

async def authenticate_user(session, login: str, password: str):
    user = await get_user_by_login(session, login)
    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user