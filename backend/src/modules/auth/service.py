from sqlalchemy.ext.asyncio import AsyncSession

from core.utils.password_hasher import verify_password
from ..users.service import get_user_by_login
from .jwt import create_access_token, create_refresh_token
from .schemas import Token, TokenPayload
from .exceptions import InvalidCredentialsError

async def authenticate_user(session: AsyncSession, login: str, password: str):
    user = await get_user_by_login(session, login)
    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user

async def login_user(
    session: AsyncSession,
    login: str,
    password: str
) -> Token:
    user = await authenticate_user(session, login, password)
    if not user:
        raise InvalidCredentialsError()

    token_payload = TokenPayload(
        sub=user.id,
        login=user.login,
        type="access"
    )
    
    access_token = create_access_token(token_payload)
    refresh_token = await create_refresh_token(session, user.id, user.login)
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )