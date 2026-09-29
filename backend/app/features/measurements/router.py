from fastapi import APIRouter, HTTPException

from app.features.measurements.schemas import MeasurementRequest
from app.features.measurements.service import calculate_measurements

router = APIRouter()


@router.post("/api/measurements")
async def measurements(body: MeasurementRequest):
    try:
        return await calculate_measurements(body)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
