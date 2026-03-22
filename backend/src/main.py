from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from core.config import settings
from core.database.session import db_session
from core.database.models import Base
from modules.notifications.redis_client import redis_client

# Импортируем роутеры
from modules.auth.router import router as auth_router
from modules.users.router import router as users_router
from modules.groups.router import router as groups_router
from modules.tasks.router import router as tasks_router
from modules.projects.router import router as projects_router
from modules.notifications.router import router as notifications_ws_router
from modules.notifications.http_router import router as notifications_http_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with db_session.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await redis_client.connect()
    
    yield
    
    await redis_client.disconnect()
    await db_session.dispose()


main_app = FastAPI(lifespan=lifespan)

main_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:80", "http://localhost"],
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


if __name__ == "__main__":
    uvicorn.run(
        "main:main_app",
        host=settings.run.host,
        port=settings.run.port,
        reload=True
    )