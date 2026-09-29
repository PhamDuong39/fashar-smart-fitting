"""Application composition; endpoint logic lives in feature packages."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.catalog.router import router as catalog_router
from app.features.configuration.router import router as configuration_router
from app.features.health.router import router as health_router
from app.features.measurements.router import router as measurements_router
from app.features.recommendations.router import router as recommendations_router
from app.features.tracking.router import router as tracking_router

app = FastAPI(title="FASHAR Demo API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


for router in (health_router, configuration_router, catalog_router, measurements_router, recommendations_router, tracking_router):
    app.include_router(router)
