from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import Depends, FastAPI
import uvicorn

from core.config import settings
from core.database import db_session
from core.database import Base

from modules.auth import router as auth_router
from modules.users import router as users_router
from modules.groups import router as groups_router
from modules.tasks import router as tasks_router
from modules.projects import router as projects_router

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # startup
    async with db_session.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # shutdown
    print("dispose engine")
    await db_session.dispose()


main_app = FastAPI(lifespan=lifespan)
main_app.include_router(auth_router, prefix=settings.api.auth)
main_app.include_router(users_router, prefix=settings.api.users, tags=["Users"])
main_app.include_router(groups_router, prefix=settings.api.groups, tags=["Groups"])
main_app.include_router(tasks_router, prefix=settings.api.tasks, tags=["Tasks"])
main_app.include_router(projects_router, prefix=settings.api.projects, tags=["Projects"])

if __name__ == "__main__":
    uvicorn.run("main:main_app", 
                host=settings.run.host, 
                port=settings.run.port, 
                reload=True)