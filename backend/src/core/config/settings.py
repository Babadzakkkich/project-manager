from pydantic import BaseModel, Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from urllib.parse import quote_plus

class RunConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000

class ApiPrefix(BaseModel):
    users: str = "/users"
    groups: str = "/groups"
    projects: str = "/projects"
    tasks: str = "/tasks"

class DatabaseConfig(BaseModel):
    user: str = Field(..., env="APP_CONFIG__DB__USER")
    password: str = Field(..., env="APP_CONFIG__DB__PASSWORD")
    host: str = Field(..., env="APP_CONFIG__DB__HOST")
    port: int = Field(..., env="APP_CONFIG__DB__PORT")
    name: str = Field(..., env="APP_CONFIG__DB__NAME")

    echo: bool = False
    echo_pool: bool = False
    pool_size: int = 50
    max_overflow: int = 10

    @property
    def url(self) -> PostgresDsn:
        encoded_password = quote_plus(self.password)
        return f"postgresql+asyncpg://{self.user}:{encoded_password}@{self.host}:{self.port}/{self.name}"


class SecurityConfig(BaseModel):
    secret_key: str
    token_expire_minutes: int
    algorithm: str

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("./backend/.env", ".env"),
        case_sensitive=False,
        env_nested_delimiter="__",
        env_prefix="APP_CONFIG__",
    )

    run: RunConfig = RunConfig()
    api: ApiPrefix = ApiPrefix()
    db: DatabaseConfig = Field(...)
    security: SecurityConfig = Field(...)

settings = Settings()