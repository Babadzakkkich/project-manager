from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncEngine,
    async_sessionmaker,
    AsyncSession,
)
from core.config import settings


class DatabaseSession:
    """Синглтон для управления соединениями с БД"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.engine: AsyncEngine = create_async_engine(
            url=str(settings.db.url),
            echo=settings.db.echo,
            echo_pool=settings.db.echo_pool,
            pool_size=settings.db.pool_size,
            max_overflow=settings.db.max_overflow,
        )
        
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        
        self._initialized = True
    
    async def dispose(self) -> None:
        """Закрытие соединения"""
        await self.engine.dispose()
    
    async def session_getter(self) -> AsyncGenerator[AsyncSession, None]:
        """Генератор сессий для запросов"""
        async with self.session_factory() as session:
            yield session
    
    def get_consumer_session(self) -> AsyncSession:
        """Получение сессии для consumer (без автоочистки)"""
        return self.session_factory()
    
    def get_session_sync(self) -> async_sessionmaker[AsyncSession]:
        """Получение фабрики сессий для синхронного использования"""
        return self.session_factory


# Глобальный экземпляр
db_session = DatabaseSession()