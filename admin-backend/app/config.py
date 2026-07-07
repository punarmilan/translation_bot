from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "translation_bot"
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = 5000
    ADMIN_JWT_SECRET: str = "replace-with-an-admin-only-secret-at-least-32-characters"
    ADMIN_JWT_ALGORITHM: str = "HS256"
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    ADMIN_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ADMIN_TOKEN_ISSUER: str = "giftme-admin-api"
    ADMIN_TOKEN_AUDIENCE: str = "admin.giftme.watch"
    ADMIN_COOKIE_SECURE: bool = False
    ADMIN_COOKIE_SAMESITE: str = "strict"
    ADMIN_COOKIE_DOMAIN: str = ""
    ADMIN_BOOTSTRAP_CODE: str = ""
    ADMIN_INVITE_EXPIRE_HOURS: int = 24
    PUBLIC_BACKEND_URL: str = "http://127.0.0.1:8000"
    REDIS_URL: str = "redis://localhost:6379/0"
    CONTROL_PLANE_SECRET: str = "replace-with-shared-control-plane-secret"
    CONTROL_PLANE_ACK_TIMEOUT_SECONDS: float = 4.0
    CONTROL_PLANE_REDIS_TIMEOUT_SECONDS: float = 3.0
    LIBRETRANSLATE_URL: str = "http://127.0.0.1:5000"
    HEALTH_VERIFY_TLS: bool = True
    MEDIA_ROOT: str = "./data/media"
    MAX_UPLOAD_MB: int = 25
    ADMIN_FRONTEND_ORIGINS: str = "http://localhost:5176,http://127.0.0.1:5176,https://admin.giftme.watch"
    PUBLIC_CONTENT_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,https://giftme.watch"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def frontend_origins(self) -> list[str]:
        return [value.strip() for value in self.ADMIN_FRONTEND_ORIGINS.split(",") if value.strip()]

    @property
    def cors_origins(self) -> list[str]:
        values = f"{self.ADMIN_FRONTEND_ORIGINS},{self.PUBLIC_CONTENT_ORIGINS}"
        return list(dict.fromkeys(value.strip() for value in values.split(",") if value.strip()))


@lru_cache
def get_settings() -> Settings:
    return Settings()
