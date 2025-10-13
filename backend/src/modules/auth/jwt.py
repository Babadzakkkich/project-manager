from datetime import datetime, timedelta, timezone
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from core.config.settings import settings
from modules.auth.schemas import TokenPayload
from .refresh_token import create_refresh_token_record, verify_and_mark_used_refresh_token
from ..users.service import get_user_by_id

def create_access_token(token_data: TokenPayload) -> str:
    to_encode = token_data.model_dump()
    to_encode["sub"] = str(to_encode["sub"])
    to_encode["type"] = "access"
    
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.security.access_token_expire_minutes)
    
    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp())   
    })
    
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.security.secret_key, 
        algorithm=settings.security.algorithm
    )
    return encoded_jwt

async def create_refresh_token(
    session: AsyncSession,
    user_id: int,
    login: str
) -> str:
    refresh_token = await create_refresh_token_record(
        session=session,
        user_id=user_id,
        expires_delta_days=settings.security.refresh_token_expire_days
    )
    return refresh_token

async def verify_refresh_token(
    session: AsyncSession,
    refresh_token: str
) -> TokenPayload:
    try:
        user_id = await verify_and_mark_used_refresh_token(session, refresh_token)
        
        user = await get_user_by_id(session, user_id)
        if not user:
            raise ValueError("Пользователь не найден")
        
        return TokenPayload(
            sub=user.id,
            login=user.login,
            type="refresh"
        )
        
    except Exception as e:
        raise ValueError(f"Невалидный refresh токен: {str(e)}")