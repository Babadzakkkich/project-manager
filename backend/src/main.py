from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
import uvicorn

from core.config import settings
from core.database import db_session
from core.database import Base

from modules.auth import router as auth_router
from modules.tasks import router as tasks_router

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # startup
    async with db_session.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    yield
    # shutdown
    print("dispose engine")
    await db_session.dispose()


main_app = FastAPI(lifespan=lifespan)
main_app.include_router(auth_router, prefix=settings.api.auth)
main_app.include_router(tasks_router, prefix=settings.api.tasks)

if __name__ == "__main__":
    uvicorn.run("main:main_app", 
                host=settings.run.host, 
                port=settings.run.port, 
                reload=True)