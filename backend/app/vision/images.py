"""Decode camera frames shared by scanning and live tracking."""
import base64
import binascii

import cv2
import numpy as np


def decode_frame(data: str) -> np.ndarray:
    try:
        raw = base64.b64decode(data.split(",", 1)[-1], validate=True)
        if not raw:
            raise ValueError("Ảnh từ camera rỗng")
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    except (AttributeError, binascii.Error, cv2.error, ValueError) as exc:
        raise ValueError("Không đọc được ảnh từ camera") from exc
    if frame is None:
        raise ValueError("Không đọc được ảnh từ camera")
    return frame
