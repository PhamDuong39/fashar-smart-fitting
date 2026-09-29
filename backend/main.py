from __future__ import annotations

import asyncio
from functools import lru_cache
from statistics import median

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from catalog import PRODUCTS, recommend
from vision import MODEL_PATH, VisionEngine, decode_frame, measure

app = FastAPI(title="FASHAR Demo API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@lru_cache(maxsize=1)
def engine() -> VisionEngine:
    return VisionEngine()


class MeasurementRequest(BaseModel):
    front_images: list[str] = Field(min_length=1, max_length=5)
    side_images: list[str] = Field(min_length=1, max_length=5)
    marker_cm: float = Field(ge=3, le=30)


class RecommendationRequest(BaseModel):
    measurements: dict[str, float]
    audience: str = Field(pattern="^(all|men|women|unisex)$")


@app.get("/api/health")
def health():
    return {"ok": True, "model_ready": MODEL_PATH.exists()}


@app.get("/api/catalog")
def catalog():
    return {"products": PRODUCTS}


@app.post("/api/measurements")
async def measurements(body: MeasurementRequest):
    try:
        front_frames = [decode_frame(image) for image in body.front_images]
        side_frames = [decode_frame(image) for image in body.side_images]
        if len(front_frames) != len(side_frames):
            raise ValueError("Hai góc chụp cần cùng số lượng ảnh.")
        results = []
        failures = []
        vision = engine()
        for front, side in zip(front_frames, side_frames):
            try:
                results.append(await asyncio.to_thread(measure, front, side, body.marker_cm, vision))
            except ValueError as exc:
                failures.append(str(exc))
        if len(results) < min(2, len(front_frames)):
            raise ValueError(f"Chưa đủ ảnh hợp lệ. {failures[0] if failures else 'Hãy quét lại.'}")
        values = {key: {"cm": round(median(result["measurements"][key]["cm"] for result in results), 1), "source": "estimated"} for key in results[0]["measurements"]}
        return {"measurements": values, "samples_used": len(results), "notes": ["Số đo là ước lượng từ ảnh và quần áo đang mặc. Hãy đối chiếu thước dây trước khi mua."]}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/recommendations")
def recommendations(body: RecommendationRequest):
    return recommend(body.measurements, body.audience)


@app.websocket("/api/tracking")
async def tracking(socket: WebSocket):
    await socket.accept()
    try:
        vision = engine()
    except RuntimeError as exc:
        await socket.send_json({"status": "error", "message": str(exc)})
        await socket.close()
        return
    last_frame_at = 0.0
    try:
        while True:
            payload = await socket.receive_json()
            now = time.monotonic()
            if now - last_frame_at < 0.08:
                await socket.send_json({"status": "busy"})
                continue
            last_frame_at = now
            try:
                frame = decode_frame(payload["image"])
                pose = await asyncio.to_thread(vision.pose, frame)
                if pose.people_count == 0:
                    await socket.send_json({"status": "no_person", "timestamp": payload.get("timestamp")})
                elif pose.people_count > 1:
                    await socket.send_json({"status": "multiple_people", "timestamp": payload.get("timestamp")})
                else:
                    visible = all(pose.points.get(name, {}).get("visibility", 0) > 0.45 for name in ("left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_ankle", "right_ankle"))
                    await socket.send_json({"status": "tracked" if visible else "partial", "landmarks": pose.points, "timestamp": payload.get("timestamp")})
            except (ValueError, KeyError) as exc:
                await socket.send_json({"status": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
