from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "ClinicalSim AI"
    DEBUG: bool = False
    VERSION: str = "1.0.0"

    DATABASE_URL: str = "sqlite:///./clinicalsim.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "dev-secret-clinicalsim-2024-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24

    # Anthropic (primary)
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-haiku-4-5-20251001"

    # OpenAI (alternative provider)
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Groq uses the OpenAI-compatible chat completions API.
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Which provider to use: "groq" | "anthropic" | "openai" | "fallback"
    AI_PROVIDER: str = "groq"

    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
