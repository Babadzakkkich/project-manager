from pydantic import BaseModel
from pydantic_settings import BaseSettings

class RunConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000

class ApiPrefix(BaseModel):
    auth_prefix: str = "/auth"
    tasks_prefix: str = "/tasks"

class Settings(BaseSettings):
    run: RunConfig = RunConfig()
    api: ApiPrefix = ApiPrefix()


settings = Settings()