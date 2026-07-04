"""App configuration: persisted as JSON, secrets kept separate from GET /config."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from paths import DATA_DIR

CONFIG_PATH = DATA_DIR / "config.json"
SECRETS_PATH = DATA_DIR / "secrets.json"

PROVIDERS = ("eden", "openai", "anthropic", "custom")


class AppConfig(BaseModel):
    client_id: str = ""
    provider: str = "openai"
    base_url: str = ""
    model: str = ""
    check_interval_minutes: int = Field(default=5, ge=1, le=30)
    max_folder_count: int = Field(default=10, ge=1, le=50)
    parent_folder_name: str = "AI Sorted"


class Secrets(BaseModel):
    api_key: str = ""


class ConfigUpdate(BaseModel):
    """Partial update accepted by POST /config. All fields optional."""

    client_id: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    check_interval_minutes: Optional[int] = Field(default=None, ge=1, le=30)
    max_folder_count: Optional[int] = Field(default=None, ge=1, le=50)
    parent_folder_name: Optional[str] = None
    api_key: Optional[str] = None


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_config() -> AppConfig:
    return AppConfig(**_read_json(CONFIG_PATH))


def load_secrets() -> Secrets:
    return Secrets(**_read_json(SECRETS_PATH))


def get_full_config() -> dict:
    """Config + secrets merged, for internal use by graph.py / classifier.py / auth.py."""
    return {**load_config().model_dump(), **load_secrets().model_dump()}


def update_config(update: ConfigUpdate) -> AppConfig:
    current = load_config()
    secrets = load_secrets()

    config_fields = update.model_dump(exclude_unset=True, exclude={"api_key"})
    merged_config = current.model_copy(update=config_fields)
    _write_json(CONFIG_PATH, merged_config.model_dump())

    if update.api_key is not None:
        merged_secrets = secrets.model_copy(update={"api_key": update.api_key})
        _write_json(SECRETS_PATH, merged_secrets.model_dump())

    return merged_config


def is_ai_configured() -> bool:
    cfg = load_config()
    secrets = load_secrets()
    return bool(cfg.provider and cfg.model and secrets.api_key)
