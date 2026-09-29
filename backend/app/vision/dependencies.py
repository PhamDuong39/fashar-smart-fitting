"""Cached inference engines shared across requests."""
from functools import lru_cache

from app.vision.engine import VisionEngine


@lru_cache(maxsize=1)
def engine() -> VisionEngine:
    return VisionEngine()


@lru_cache(maxsize=1)
def tracking_engine() -> VisionEngine:
    # Live pose does not need the full-resolution silhouette used for measurements.
    return VisionEngine(segmentation=False)
