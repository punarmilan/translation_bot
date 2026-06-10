from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "translation_bot"
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = 5000
    JWT_SECRET: str = "change-this-to-a-long-random-string-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    LIBRETRANSLATE_URL: str = "http://127.0.0.1:5000"
    TRANSLATION_TIMEOUT_SECONDS: float = 8.0
    TRANSLATION_CACHE_MAX_SIZE: int = 512
    MIN_DETECTION_CONFIDENCE: float = 0.72

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
