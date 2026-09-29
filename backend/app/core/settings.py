"""Validated, editable settings shared by the API and browser."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from app.core.paths import CONFIG_PATH

MEASUREMENT_KEYS = frozenset({"shoulder", "chest", "waist", "hip", "hip_width", "arm_length", "torso_length", "outer_leg", "thigh"})


class CameraSettings(BaseModel):
    orientation: Literal["portrait", "landscape"]
    width: int = Field(ge=320, le=3840)
    height: int = Field(ge=320, le=3840)


class Settings(BaseModel):
    height_cm: float = Field(ge=120, le=220)
    measurements_cm: dict[str, float] = Field(default_factory=dict)
    capture_seconds: float = Field(gt=0, le=30)
    camera: CameraSettings


def load_settings() -> Settings:
    """Read on each request so manual JSON edits take effect without an API restart."""
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("gốc JSON phải là một object")
        settings = Settings(**data)
    except (OSError, ValueError) as exc:
        raise ValueError(f"backend/config.json không hợp lệ: {exc}") from exc
    unknown = set(settings.measurements_cm) - MEASUREMENT_KEYS
    if unknown:
        raise ValueError(f"backend/config.json có số đo không hỗ trợ: {', '.join(sorted(unknown))}")
    for name, cm in settings.measurements_cm.items():
        if not 0 < cm <= 250:
            raise ValueError(f"backend/config.json: measurements_cm.{name} phải từ 0 đến 250 cm")
    if settings.camera.orientation == "portrait" and settings.camera.width >= settings.camera.height:
        raise ValueError("backend/config.json: camera portrait cần width < height")
    if settings.camera.orientation == "landscape" and settings.camera.width <= settings.camera.height:
        raise ValueError("backend/config.json: camera landscape cần width > height")
    return settings
