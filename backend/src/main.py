from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from core.config import settings
from core.database.session import db_session
from core.database.models import Base
from modules.notifications.redis_client import redis_client
from shared.messaging import RabbitMQClient, MessagingModule
from modules.notifications.consumer import NotificationConsumer
from modules.notifications.publisher import NotificationPublisher
from core.logger import logger

# Импортируем роутеры
from modules.auth.router import router as auth_router
from modules.users.router import router as users_router
from modules.groups.router import router as groups_router
from modules.tasks.router import router as tasks_router
from modules.projects.router import router as projects_router
from modules.notifications.router import router as notifications_ws_router
from modules.notifications.http_router import router as notifications_http_router
from modules.conferences.router import router as conferences_router

# Глобальные объекты
rabbitmq_client = RabbitMQClient(settings.rabbitmq_url)
notifications_messaging = MessagingModule(rabbitmq_client, "notifications")
notification_publisher = NotificationPublisher(notifications_messaging)
notification_consumer = NotificationConsumer(notifications_messaging)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting application lifespan...")
    
    # Создаем таблицы в БД
    async with db_session.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified")
    
    # Подключаемся к Redis
    await redis_client.connect()
    logger.info(f"Redis connected: {redis_client.is_connected}")
    
    # Подключаемся к RabbitMQ
    connected = await rabbitmq_client.connect()
    logger.info(f"RabbitMQ connected: {connected}")
    
    if connected:
        # Настраиваем модуль уведомлений
        await notifications_messaging.setup(
            exchange_name=settings.rabbitmq.notifications_exchange,
            queue_name=settings.rabbitmq.notifications_queue,
            dlq_name=settings.rabbitmq.dlq_queue
        )
        logger.info("Notifications messaging module set up")
        
        # Запускаем потребителя уведомлений
        await notification_consumer.start()
        logger.info("Notification consumer started")
    else:
        logger.warning("RabbitMQ not connected, messaging not available")
    
    yield
    
    logger.info("Shutting down application...")
    
    # Останавливаем потребителя
    await notification_consumer.stop()
    logger.info("Notification consumer stopped")
    
    # Закрываем соединения
    await rabbitmq_client.disconnect()
    await redis_client.disconnect()
    await db_session.dispose()
    logger.info("All connections closed")


main_app = FastAPI(lifespan=lifespan)

main_app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

main_app.include_router(auth_router, prefix=settings.api.auth, tags=["Auth"])
main_app.include_router(users_router, prefix=settings.api.users, tags=["Users"])
main_app.include_router(groups_router, prefix=settings.api.groups, tags=["Groups"])
main_app.include_router(projects_router, prefix=settings.api.projects, tags=["Projects"])
main_app.include_router(tasks_router, prefix=settings.api.tasks, tags=["Tasks"])
main_app.include_router(notifications_ws_router, prefix=settings.api.notifications, tags=["Notifications WebSocket"])
main_app.include_router(notifications_http_router, prefix=settings.api.notifications, tags=["Notifications HTTP"])
main_app.include_router(conferences_router, prefix=settings.api.conferences, tags=["Conferences"])


if __name__ == "__main__":
    uvicorn.run(
        "main:main_app",
        host=settings.run.host,
        port=settings.run.port,
        reload=True
    )