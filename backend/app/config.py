"""Application settings, loaded from the repository-root `.env` (shared with the frontend)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",  # the shared .env also holds VITE_* frontend variables
    )

    # App
    node_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    api_port: int = 8787

    # Supabase
    supabase_url: str
    supabase_secret_key: str
    database_url: str

    # First admin (used by scripts/create_superuser.py in step 2)
    superuser_email: str | None = None
    superuser_name: str = "Elation Admin"

    # Client accounts
    client_access_default_days: int = Field(default=30, gt=0)

    # Groq
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    groq_timeout_ms: int = Field(default=20000, gt=0)

    # Resend
    resend_api_key: str | None = None
    email_from: str | None = None
    admin_notification_email: str | None = None

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Supabase hands out `postgresql://` URLs; SQLAlchemy needs the driver named."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    @property
    def is_development(self) -> bool:
        return self.node_env == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
