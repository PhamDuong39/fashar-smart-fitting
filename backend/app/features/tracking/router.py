import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.vision.dependencies import tracking_engine
from app.vision.images import decode_frame

router = APIRouter()


@router.websocket("/api/tracking")
async def tracking(socket: WebSocket):
    await socket.accept()
    try:
        vision = tracking_engine()
    except RuntimeError as exc:
        await socket.send_json({"status": "error", "message": str(exc)})
        await socket.close()
        return
    try:
        while True:
            payload = await socket.receive_json()
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
