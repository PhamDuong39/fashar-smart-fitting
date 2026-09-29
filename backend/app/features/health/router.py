from fastapi import APIRouter

from app.core.paths import MODEL_PATH

router = APIRouter()


@router.get("/api/health")
def health():
    return {"ok": True, "model_ready": MODEL_PATH.exists()}
