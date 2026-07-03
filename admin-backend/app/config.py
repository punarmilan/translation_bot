from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "translation_bot"
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = 5000
    JWT_SECRET: str = "change-this-to-a-long-random-string-in-production"
    JWT_ALGORITHM: str = "HS256"
    PUBLIC_BACKEND_URL: str = "http://127.0.0.1:8000"
    ADMIN_FRONTEND_ORIGINS: str = "http://localhost:5176,http://127.0.0.1:5176"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def frontend_origins(self) -> list[str]:
        return [value.strip() for value in self.ADMIN_FRONTEND_ORIGINS.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
