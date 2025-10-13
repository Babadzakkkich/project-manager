from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
import hashlib
import secrets

from core.database.models import RefreshToken

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(64)

async def create_refresh_token_record(
    session: AsyncSession, 
    user_id: int, 
    expires_delta_days: int
) -> str:    
    refresh_token = generate_refresh_token()
    token_hash = hash_token(refresh_token)
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_delta_days)
    
    db_refresh_token = RefreshToken(
        token_hash=token_hash,
        user_id=user_id,
        expires_at=expires_at
    )
    
    session.add(db_refresh_token)
    await session.commit()
    
    return refresh_token

async def verify_and_mark_used_refresh_token(
    session: AsyncSession, 
    refresh_token: str
) -> int:
    token_hash = hash_token(refresh_token)
    
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == token_hash,
        RefreshToken.used == False,
        RefreshToken.expires_at > datetime.now(timezone.utc)
    )
    
    result = await session.execute(stmt)
    db_token = result.scalar_one_or_none()
    
    if not db_token:
        raise ValueError("Невалидный или просроченный refresh токен")
    
    db_token.used = True
    await session.commit()
    
    return db_token.user_id

async def revoke_all_user_tokens(session: AsyncSession, user_id: int):
    stmt = delete(RefreshToken).where(RefreshToken.user_id == user_id)
    await session.execute(stmt)
    await session.commit()

async def cleanup_expired_tokens(session: AsyncSession):
    stmt = delete(RefreshToken).where(
        RefreshToken.expires_at < datetime.now(timezone.utc)
    )
    await session.execute(stmt)
    await session.commit()