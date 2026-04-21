from pydantic import BaseModel, Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import quote_plus


class RunConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = Field(True, env="APP_CONFIG__RUN__DEBUG")
    
    cookie_secure: bool = Field(False, env="APP_CONFIG__RUN__COOKIE_SECURE")
    cookie_samesite: str = Field("lax", env="APP_CONFIG__RUN__COOKIE_SAMESITE")


class ApiPrefix(BaseModel):
    auth: str = "/auth"
    users: str = "/users"
    groups: str = "/groups"
    projects: str = "/projects"
    tasks: str = "/tasks"
    notifications: str = "/notifications"
    conferences: str = "/conferences"


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
    secret_key: str = Field(..., env="APP_CONFIG__SECURITY__SECRET_KEY")
    access_token_expire_minutes: int = Field(..., env="APP_CONFIG__SECURITY__ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(..., env="APP_CONFIG__SECURITY__REFRESH_TOKEN_EXPIRE_DAYS")
    algorithm: str = Field(..., env="APP_CONFIG__SECURITY__ALGORITHM")


class RedisConfig(BaseModel):
    """Конфигурация Redis для кэширования"""
    host: str = Field("localhost", env="APP_CONFIG__REDIS__HOST")
    port: int = Field(6379, env="APP_CONFIG__REDIS__PORT")
    db: int = Field(0, env="APP_CONFIG__REDIS__DB")
    password: str | None = Field(None, env="APP_CONFIG__REDIS__PASSWORD")
    max_connections: int = Field(10, env="APP_CONFIG__REDIS__MAX_CONNECTIONS")
    
    @property
    def url(self) -> str:
        if self.password:
            return f"redis://:{self.password}@{self.host}:{self.port}/{self.db}"
        return f"redis://{self.host}:{self.port}/{self.db}"


class RabbitMQConfig(BaseModel):
    """Конфигурация RabbitMQ для гарантированной доставки уведомлений"""
    host: str = Field("localhost", env="APP_CONFIG__RABBITMQ__HOST")
    port: int = Field(5672, env="APP_CONFIG__RABBITMQ__PORT")
    user: str = Field("guest", env="APP_CONFIG__RABBITMQ__USER")
    password: str = Field("guest", env="APP_CONFIG__RABBITMQ__PASSWORD")
    vhost: str = Field("/", env="APP_CONFIG__RABBITMQ__VHOST")
    
    # Настройки очередей
    notifications_queue: str = Field("notifications", env="APP_CONFIG__RABBITMQ__NOTIFICATIONS_QUEUE")
    notifications_exchange: str = Field("notifications", env="APP_CONFIG__RABBITMQ__NOTIFICATIONS_EXCHANGE")
    dlq_queue: str = Field("notifications_dlq", env="APP_CONFIG__RABBITMQ__DLQ_QUEUE")
    
    @property
    def url(self) -> str:
        """Формирует URL для подключения к RabbitMQ"""
        return f"amqp://{self.user}:{self.password}@{self.host}:{self.port}/{self.vhost}"


class LiveKitConfig(BaseModel):
    """Конфигурация для LiveKit"""
    host: str = Field("livekit", env="APP_CONFIG__LIVEKIT__HOST")
    external_host: str = Field("localhost", env="APP_CONFIG__LIVEKIT__EXTERNAL_HOST")
    api_key: str = Field("devkey", env="APP_CONFIG__LIVEKIT__API_KEY")
    api_secret: str = Field("secretsecretsecretsecretsecret12", env="APP_CONFIG__LIVEKIT__API_SECRET")
    ws_port: int = Field(7880, env="APP_CONFIG__LIVEKIT__WS_PORT")
    http_port: int = Field(7881, env="APP_CONFIG__LIVEKIT__HTTP_PORT")
    
    @property
    def ws_url(self) -> str:
        """URL для подключения клиента к LiveKit"""
        return f"ws://{self.external_host}:{self.ws_port}"
    
    @property
    def internal_ws_url(self) -> str:
        """URL для внутреннего использования (бэкенд -> LiveKit)"""
        return f"ws://{self.host}:{self.ws_port}"
    
    @property
    def api_url(self) -> str:
        """URL для LiveKit Server API (бэкенд -> LiveKit)"""
        return f"http://{self.host}:{self.http_port}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_nested_delimiter="__",
        env_prefix="APP_CONFIG__",
    )

    run: RunConfig = RunConfig()
    api: ApiPrefix = ApiPrefix()
    db: DatabaseConfig = Field(...)
    security: SecurityConfig = Field(...)
    redis: RedisConfig = RedisConfig()
    rabbitmq: RabbitMQConfig = RabbitMQConfig()
    livekit: LiveKitConfig = LiveKitConfig()
    
    @property
    def debug(self) -> bool:
        return self.run.debug
    
    @property
    def redis_url(self) -> str:
        return self.redis.url
    
    @property
    def rabbitmq_url(self) -> str:
        return self.rabbitmq.url
    
    @property
    def livekit_ws_url(self) -> str:
        return self.livekit.ws_url


settings = Settings()