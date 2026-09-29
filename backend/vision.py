"""Pose, silhouette and ArUco based estimates for a local demonstration."""
from __future__ import annotations

import base64
import math
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

MODEL_PATH = Path(__file__).parent / "models" / "pose_landmarker_lite.task"
KEYPOINTS = {
    "nose": 0, "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14, "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24, "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28, "left_heel": 29, "right_heel": 30,
    "left_foot": 31, "right_foot": 32,
}


def decode_frame(data: str) -> np.ndarray:
    raw = data.split(",", 1)[-1]
    frame = cv2.imdecode(np.frombuffer(base64.b64decode(raw), dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Không đọc được ảnh từ camera")
    return frame


@dataclass
class PoseResult:
    points: dict[str, dict[str, float]]
    mask: np.ndarray | None
    people_count: int
    width: int
    height: int


class VisionEngine:
    def __init__(self) -> None:
        if not MODEL_PATH.exists():
            raise RuntimeError("Thiếu model MediaPipe. Chạy: python backend/download_model.py")
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL_PATH)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=2,
            min_pose_detection_confidence=0.55,
            min_pose_presence_confidence=0.55,
            min_tracking_confidence=0.55,
            output_segmentation_masks=True,
        )
        self.landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(options)
        self.lock = threading.Lock()

    def pose(self, frame: np.ndarray) -> PoseResult:
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        with self.lock:
            result = self.landmarker.detect(image)
        points = {}
        if result.pose_landmarks:
            landmarks = result.pose_landmarks[0]
            points = {
                name: {
                    "x": float(landmarks[index].x),
                    "y": float(landmarks[index].y),
                    "visibility": float(landmarks[index].visibility),
                }
                for name, index in KEYPOINTS.items()
            }
        mask = None
        if result.segmentation_masks:
            mask = result.segmentation_masks[0].numpy_view().copy()
        return PoseResult(points, mask, len(result.pose_landmarks), w, h)


def marker_scale(frame: np.ndarray, marker_cm: float) -> tuple[float, list[list[float]]]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())
    corners, ids, _ = detector.detectMarkers(gray)
    if ids is None or 0 not in ids.flatten():
        raise ValueError("Không thấy marker ArUco ID 0. Đặt marker cạnh người, hướng về camera.")
    corner = corners[int(np.where(ids.flatten() == 0)[0][0])][0]
    sides = [float(np.linalg.norm(corner[i] - corner[(i + 1) % 4])) for i in range(4)]
    if min(sides) < 25:
        raise ValueError("Marker quá nhỏ trong ảnh. Đưa camera lại gần hoặc in marker lớn hơn.")
    if min(sides) / max(sides) < 0.72:
        raise ValueError("Marker bị nghiêng nhiều. Hướng bảng thẳng vào camera.")
    return float(np.mean(sides)) / marker_cm, corner.tolist()


def _point(pose: PoseResult, name: str) -> np.ndarray:
    p = pose.points.get(name)
    if not p or p["visibility"] < 0.45:
        raise ValueError(f"Không thấy rõ {name.replace('_', ' ')}. Hãy đứng đủ toàn thân và quét lại.")
    return np.array([p["x"] * pose.width, p["y"] * pose.height], dtype=float)


def _distance(pose: PoseResult, a: str, b: str) -> float:
    return float(np.linalg.norm(_point(pose, a) - _point(pose, b)))


def _row_width(mask: np.ndarray, y: int, cx: int, reach: int) -> float:
    binary = mask > 0.52
    h, w = binary.shape
    widths = []
    for row in range(max(0, y - 3), min(h, y + 4)):
        lo, hi = max(0, cx - reach), min(w, cx + reach + 1)
        active = np.flatnonzero(binary[row, lo:hi])
        if len(active) < 5:
            continue
        center = int(np.argmin(np.abs(active + lo - cx)))
        if abs(active[center] + lo - cx) > 15:
            continue
        left = right = center
        while left > 0 and active[left] - active[left - 1] <= 2:
            left -= 1
        while right < len(active) - 1 and active[right + 1] - active[right] <= 2:
            right += 1
        widths.append(float(active[right] - active[left] + 1))
    if not widths:
        raise ValueError("Không xác định được biên cơ thể. Mặc đồ ôm vừa và tách tay khỏi thân.")
    return float(np.median(widths))


def _torso_width(pose: PoseResult, fraction: float) -> float:
    if pose.mask is None:
        raise ValueError("Không có mask cơ thể để đo vòng.")
    shoulder = (_point(pose, "left_shoulder") + _point(pose, "right_shoulder")) / 2
    hip = (_point(pose, "left_hip") + _point(pose, "right_hip")) / 2
    center = shoulder * (1 - fraction) + hip * fraction
    shoulder_span = _distance(pose, "left_shoulder", "right_shoulder")
    reach = max(25, int(shoulder_span * 0.65))
    return _row_width(pose.mask, int(center[1]), int(center[0]), reach)


def _circumference(width: float, depth: float) -> float:
    a, b = width / 2, depth / 2
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def measure(front_frame: np.ndarray, side_frame: np.ndarray, marker_cm: float, engine: VisionEngine) -> dict:
    front_scale, front_marker = marker_scale(front_frame, marker_cm)
    side_scale, side_marker = marker_scale(side_frame, marker_cm)
    front = engine.pose(front_frame)
    side = engine.pose(side_frame)
    if front.people_count != 1 or side.people_count != 1:
        raise ValueError("Mỗi ảnh cần có đúng một người.")
    if front.mask is None or side.mask is None:
        raise ValueError("Không tách được hình người. Hãy quét lại trong điều kiện đủ sáng.")
    for pose in (front, side):
        for name in ("left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_ankle", "right_ankle"):
            _point(pose, name)
    mask = front.mask > 0.52
    ys = np.where(mask.any(axis=1))[0]
    if len(ys) < front.height * 0.45:
        raise ValueError("Cơ thể chưa đủ trong khung hình.")
    height = (float(ys[-1] - ys[0]) / front_scale)
    if not 120 <= height <= 220:
        raise ValueError("Chiều cao ước lượng ngoài khoảng hợp lý; kiểm tra marker và khoảng cách đứng.")
    shoulder = _distance(front, "left_shoulder", "right_shoulder") / front_scale
    arm = np.median([
        (_distance(front, "left_shoulder", "left_elbow") + _distance(front, "left_elbow", "left_wrist")) / front_scale,
        (_distance(front, "right_shoulder", "right_elbow") + _distance(front, "right_elbow", "right_wrist")) / front_scale,
    ])
    hip_mid = (_point(front, "left_hip") + _point(front, "right_hip")) / 2
    shoulder_mid = (_point(front, "left_shoulder") + _point(front, "right_shoulder")) / 2
    torso = float(np.linalg.norm(hip_mid - shoulder_mid)) / front_scale
    leg = float(np.median([_distance(front, "left_hip", "left_ankle"), _distance(front, "right_hip", "right_ankle")])) / front_scale
    values = {
        "height": height,
        "shoulder": shoulder,
        "hip_width": _torso_width(front, 1.02) / front_scale,
        "arm_length": float(arm),
        "torso_length": torso,
        "outer_leg": leg,
    }
    for key, fraction in (("chest", 0.32), ("waist", 0.67), ("hip", 1.02)):
        width = _torso_width(front, fraction) / front_scale
        depth = _torso_width(side, fraction) / side_scale
        values[key] = _circumference(width, depth)
    # Thigh width is measured separately on the front and side at 18% down the upper leg.
    for pose, scale, label in ((front, front_scale, "front"), (side, side_scale, "side")):
        hip = _point(pose, "left_hip")
        knee = _point(pose, "left_knee")
        sample = hip * 0.82 + knee * 0.18
        values[f"thigh_{label}"] = _row_width(pose.mask, int(sample[1]), int(sample[0]), int(pose.width * 0.11)) / scale
    values["thigh"] = _circumference(values.pop("thigh_front"), values.pop("thigh_side"))
    result = {k: {"cm": round(float(v), 1), "source": "estimated"} for k, v in values.items()}
    return {
        "measurements": result,
        "markers": {"front": front_marker, "side": side_marker},
        "notes": ["Số đo là ước lượng từ ảnh và quần áo đang mặc. Hãy đối chiếu thước dây trước khi mua."],
        "timestamp": time.time(),
    }
