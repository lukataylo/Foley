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

    def require(self, *keys: str) -> None:
        """Raise MissingApiKey with a friendly message if any of the given
        env keys is empty. Routes that shell out detect the prefix and turn
        it into a 412 Precondition Failed instead of a 500."""
        missing = [k for k in keys if not (getattr(self, k.lower(), "") or "")]
        if missing:
            raise MissingApiKey(missing)


class MissingApiKey(RuntimeError):
    """Raised when a required API key isn't set in the environment.

    The message starts with the literal `MISSING_API_KEY:` prefix so route
    handlers that shell out to the director can detect it in stderr and
    return HTTP 412 with a friendly UI-facing message instead of a stack
    trace. Carries `keys` as a structured attribute for callers that catch
    it directly (Python-side).
    """

    def __init__(self, keys: list[str]):
        self.keys = keys
        joined = ", ".join(keys)
        super().__init__(
            f"MISSING_API_KEY: {joined}. Add the value(s) to .env at the "
            f"repo root and restart `pnpm dev`."
        )


settings = Settings()
