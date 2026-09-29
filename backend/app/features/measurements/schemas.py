from pydantic import BaseModel, Field


class MeasurementRequest(BaseModel):
    front_images: list[str]
    side_images: list[str]
    marker_cm: float | None = Field(default=None, ge=3, le=30)
    height_cm: float | None = Field(default=None, ge=120, le=220)
