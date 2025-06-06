from fastapi import FastAPI
import uvicorn

from core.config import settings

from modules.auth import router as auth_router
from modules.tasks import router as tasks_router

main_app = FastAPI()
main_app.include_router(auth_router, prefix=settings.api.auth_prefix)
main_app.include_router(tasks_router, prefix=settings.api.tasks_prefix)

if __name__ == "__main__":
    uvicorn.run("main:main_app", 
                host=settings.run.host, 
                port=settings.run.port, 
                reload=True)