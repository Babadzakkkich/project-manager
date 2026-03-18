from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.utils.password_hasher import verify_password
from core.logger import logger
from ..users.service import UserService
from .jwt import create_access_token, create_refresh_token
from .schemas import Token, TokenPayload
from .exceptions import InvalidCredentialsError
from ..users.exceptions import UserNotFoundError


class AuthService:
    """Сервис для аутентификации"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.logger = logger
        self.user_service = UserService(session)
    
    async def authenticate_user(self, login: str, password: str):
        """Аутентификация пользователя"""
        self.logger.debug(f"Authenticating user: {login}")
        
        user = await self.user_service.get_user_by_login(login)
        if not user:
            self.logger.warning(f"User with login {login} not found")
            return False
            
        if not verify_password(password, user.password_hash):
            self.logger.warning(f"Invalid password for user {login}")
            return False
            
        self.logger.debug(f"User {login} authenticated successfully")
        return user
    
    async def login_user(self, login: str, password: str) -> Token:
        """Вход пользователя в систему"""
        self.logger.info(f"Login attempt for user: {login}")
        
        user = await self.authenticate_user(login, password)
        if not user:
            self.logger.warning(f"Failed login attempt for user: {login}")
            raise InvalidCredentialsError()

        token_payload = TokenPayload(
            sub=user.id,
            login=user.login,
            type="access"
        )
        
        access_token = create_access_token(token_payload)
        refresh_token = await create_refresh_token(self.session, user.id, user.login)
        
        self.logger.info(f"User {user.id} logged in successfully")
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )