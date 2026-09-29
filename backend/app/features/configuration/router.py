from fastapi import APIRouter, HTTPException

from app.core.settings import load_settings

router = APIRouter()


@router.get("/api/config")
def config():
    try:
        settings = load_settings()
        return settings.dict()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
