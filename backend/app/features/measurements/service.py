"""Coordinate measurement samples and configured overrides."""
import asyncio
from statistics import median

from app.core.settings import load_settings
from app.features.measurements.estimator import measure
from app.features.measurements.schemas import MeasurementRequest
from app.vision.dependencies import engine
from app.vision.images import decode_frame


async def calculate_measurements(body: MeasurementRequest):
    settings = load_settings()
    height_cm = body.height_cm if body.height_cm is not None else (None if body.marker_cm is not None else settings.height_cm)
    if not 1 <= len(body.front_images) <= 5 or not 1 <= len(body.side_images) <= 5:
        raise ValueError("Mỗi góc chụp cần từ 1 đến 5 ảnh.")
    if len(body.front_images) != len(body.side_images):
        raise ValueError("Hai góc chụp cần cùng số lượng ảnh.")
    front_frames = [decode_frame(image) for image in body.front_images]
    side_frames = [decode_frame(image) for image in body.side_images]
    results = []
    failures = []
    vision = engine()
    for front, side in zip(front_frames, side_frames):
        try:
            results.append(await asyncio.to_thread(measure, front, side, body.marker_cm, vision, height_cm))
        except ValueError as exc:
            failures.append(str(exc))
    if len(results) < min(2, len(front_frames)):
        raise ValueError(f"Chưa đủ ảnh hợp lệ. {failures[0] if failures else 'Hãy quét lại.'}")
    values = {key: {"cm": round(median(result["measurements"][key]["cm"] for result in results), 1), "source": "manual" if key == "height" and height_cm is not None else "estimated"} for key in results[0]["measurements"]}
    for key, cm in settings.measurements_cm.items():
        values[key] = {"cm": round(cm, 1), "source": "manual"}
    note = "Số đo còn lại được ước lượng từ ảnh dựa trên chiều cao đã nhập. Hãy đối chiếu thước dây trước khi mua." if height_cm is not None else "Số đo là ước lượng từ ảnh và quần áo đang mặc. Hãy đối chiếu thước dây trước khi mua."
    return {"measurements": values, "samples_used": len(results), "notes": [note]}
