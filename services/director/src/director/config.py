"""Settings loaded from .env, validated with pydantic-settings."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "XB0fDUnXU5powFXDhCwa"  # Charlotte, default
    github_webhook_secret: str = ""
    github_token: str = ""
    logfire_token: str = ""

    demo_app_repo: str = "lukataylo/Foley-demo"
    demo_app_local_path: Path = Path("/Users/lukadadiani/Documents/Foley-demo-app")
    demo_app_dev_url: str = "http://localhost:3001"

    public_dashboard_url: str = "http://localhost:3000"

    @property
    def repo_root(self) -> Path:
        # services/director/src/director/config.py → repo root
        return Path(__file__).resolve().parents[4]

    @property
    def walkthroughs_dir(self) -> Path:
        return self.repo_root / "walkthroughs"


settings = Settings()
