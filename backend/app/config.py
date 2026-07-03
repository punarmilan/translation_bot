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
    FRONTEND_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:5175,http://127.0.0.1:5175"
    )
    CORS_ORIGIN_REGEX: str = (
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|"
        r"172\.\d+\.\d+\.\d+):(5173|5174|5175)"
    )
    TURN_HOST: str = ""
    TURN_PORT: int = 3478
    TURN_SHARED_SECRET: str = ""
    TURN_CREDENTIAL_TTL_SECONDS: int = 3600

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def frontend_origins(self) -> list[str]:
        return [
            value.strip()
            for value in self.FRONTEND_ORIGINS.split(",")
            if value.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
