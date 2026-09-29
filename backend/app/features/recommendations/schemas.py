from typing import Literal

from pydantic import BaseModel


class RecommendationRequest(BaseModel):
    measurements: dict[str, float]
    audience: Literal["all", "men", "women", "unisex"]
