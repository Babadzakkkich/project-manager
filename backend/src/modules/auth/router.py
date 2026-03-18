from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.models import User
from core.database.session import db_session
from core.logger import logger
from .dependencies import get_current_user
from .service import AuthService
from .jwt import verify_refresh_token, create_access_token, create_refresh_token
from .refresh_token import revoke_all_user_tokens
from ..users.service import UserService
from .schemas import Token, TokenRefresh
from .exceptions import RefreshTokenError
from ..users.exceptions import UserNotFoundError

router = APIRouter()

@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(db_session.session_getter),
):
    logger.info(f"Login attempt for user: {form_data.username}")
    auth_service = AuthService(session)
    return await auth_service.login_user(form_data.username, form_data.password)

@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    token_data: TokenRefresh,
    session: AsyncSession = Depends(db_session.session_getter),
):
    logger.info("Token refresh attempt")
    
    try:
        token_payload = await verify_refresh_token(session, token_data.refresh_token)
        
        user_service = UserService(session)
        user = await user_service.get_user_by_id(token_payload.sub)
        if not user:
            logger.warning(f"User {token_payload.sub} not found for token refresh")
            raise UserNotFoundError(user_id=token_payload.sub)
        
        new_access_token = create_access_token(token_payload)
        new_refresh_token = await create_refresh_token(session, user.id, user.login)
        
        logger.info(f"Token refreshed successfully for user {user.id}")
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
        
    except ValueError as e:
        logger.error(f"Token refresh error: {e}")
        raise RefreshTokenError(str(e))

@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    logger.info(f"Logout for user {current_user.id}")
    await revoke_all_user_tokens(session, current_user.id)
    return {"detail": "Успешный выход из системы"}