"""Stable paths to editable configuration and local model assets."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = BACKEND_ROOT / "config.json"
MODEL_PATH = BACKEND_ROOT / "models" / "pose_landmarker_lite.task"
