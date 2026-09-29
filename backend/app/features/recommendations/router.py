from fastapi import APIRouter

from app.features.recommendations.schemas import RecommendationRequest
from app.features.recommendations.service import recommend

router = APIRouter()


@router.post("/api/recommendations")
def recommendations(body: RecommendationRequest):
    return recommend(body.measurements, body.audience)
