"""Pose, silhouette and ArUco based body measurement estimates."""
from __future__ import annotations

import math
import time

import cv2
import numpy as np

from app.vision.engine import PoseResult, VisionEngine

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


def _visible_midpoint(pose: PoseResult, left: str, right: str) -> np.ndarray:
    points = [pose.points.get(name) for name in (left, right)]
    visible = [np.array([p["x"] * pose.width, p["y"] * pose.height], dtype=float) for p in points if p and p["visibility"] >= 0.45]
    if not visible:
        raise ValueError("Không thấy rõ thân người ở góc nghiêng. Hãy xoay lại và quét tiếp.")
    return np.mean(visible, axis=0)


def _body_extent(pose: PoseResult) -> float:
    if pose.mask is None:
        raise ValueError("Không có mask cơ thể để đo chiều cao.")
    shoulders = _visible_midpoint(pose, "left_shoulder", "right_shoulder")
    hips = _visible_midpoint(pose, "left_hip", "right_hip")
    torso = float(np.linalg.norm(hips - shoulders))
    shoulder_points = [pose.points.get(name) for name in ("left_shoulder", "right_shoulder")]
    shoulder_x = [p["x"] * pose.width for p in shoulder_points if p and p["visibility"] >= 0.45]
    shoulder_span = max(shoulder_x) - min(shoulder_x) if len(shoulder_x) == 2 else 0
    if torso < pose.height * 0.12:
        raise ValueError("Không thấy rõ thân người để xác định chiều cao.")

    # Keep only the silhouette connected to the detected torso. Other segmented
    # objects must not set the top or bottom of the pixel-to-centimetre scale.
    binary = (pose.mask > 0.52).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    center = (shoulders + hips) / 2
    cx, cy = int(center[0]), int(center[1])
    x0, x1 = max(0, cx - 12), min(pose.width, cx + 13)
    y0, y1 = max(0, cy - 12), min(pose.height, cy + 13)
    nearby = labels[y0:y1, x0:x1]
    candidates = np.bincount(nearby[nearby > 0], minlength=count)
    if not candidates.any():
        raise ValueError("Không xác định được vùng cơ thể quanh thân người.")
    body_label = int(np.argmax(candidates))
    if stats[body_label, cv2.CC_STAT_AREA] < pose.height * 3:
        raise ValueError("Mask cơ thể quá nhỏ để đo chiều cao.")
    body = labels == body_label

    face = [pose.points.get(name) for name in ("nose", "left_eye", "right_eye", "left_ear", "right_ear")]
    face = [p for p in face if p and p["visibility"] >= 0.45]
    if not face:
        raise ValueError("Không thấy rõ đầu để đo chiều cao. Hãy quét lại.")
    face_point = min(face, key=lambda p: p["y"])
    face_x, face_y = face_point["x"] * pose.width, face_point["y"] * pose.height
    head_reach = max(18, shoulder_span * 0.42, torso * 0.22)
    head_top = face_y - max(shoulder_span * 0.7, (shoulders[1] - face_y) * 1.5, torso * 0.28)

    def edge_rows(top: float, bottom: float, left: float, right: float) -> np.ndarray:
        top_i, bottom_i = max(0, int(top)), min(pose.height, int(bottom) + 1)
        left_i, right_i = max(0, int(left)), min(pose.width, int(right) + 1)
        if top_i >= bottom_i or left_i >= right_i:
            return np.empty(0, dtype=int)
        return np.flatnonzero(body[top_i:bottom_i, left_i:right_i].sum(axis=1) >= 2) + top_i

    head_rows = edge_rows(head_top, shoulders[1], face_x - head_reach, face_x + head_reach)
    if not len(head_rows) or head_rows[0] >= face_y:
        raise ValueError("Không xác định được đỉnh đầu trên mask. Hãy quét lại.")

    foot_rows = []
    foot_reach = max(18, shoulder_span * 0.22, torso * 0.18)
    for side in ("left", "right"):
        ankle = pose.points.get(f"{side}_ankle")
        if not ankle or ankle["visibility"] < 0.45:
            continue
        foot = pose.points.get(f"{side}_foot")
        x = (foot if foot and foot["visibility"] >= 0.45 else ankle)["x"] * pose.width
        ankle_y = ankle["y"] * pose.height
        rows = edge_rows(ankle_y - torso * 0.12, ankle_y + torso * 0.35, x - foot_reach, x + foot_reach)
        if len(rows) and rows[-1] >= ankle_y:
            foot_rows.append(int(rows[-1]))
    if not foot_rows:
        raise ValueError("Không xác định được bàn chân trên mask. Hãy quét lại.")
    extent = max(foot_rows) - int(head_rows[0])
    if extent < pose.height * 0.45:
        raise ValueError("Cơ thể chưa đủ trong khung hình.")
    return float(extent)


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


def _torso_width(pose: PoseResult, fraction: float, partial: bool = False) -> float:
    if pose.mask is None:
        raise ValueError("Không có mask cơ thể để đo vòng.")
    shoulder = _visible_midpoint(pose, "left_shoulder", "right_shoulder") if partial else (_point(pose, "left_shoulder") + _point(pose, "right_shoulder")) / 2
    hip = _visible_midpoint(pose, "left_hip", "right_hip") if partial else (_point(pose, "left_hip") + _point(pose, "right_hip")) / 2
    center = shoulder * (1 - fraction) + hip * fraction
    shoulder_span = _distance(pose, "left_shoulder", "right_shoulder") if not partial else pose.width * 0.26
    reach = max(25, int(shoulder_span * 0.65))
    return _row_width(pose.mask, int(center[1]), int(center[0]), reach)


def _circumference(width: float, depth: float) -> float:
    a, b = width / 2, depth / 2
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def measure(front_frame: np.ndarray, side_frame: np.ndarray, marker_cm: float | None, engine: VisionEngine, height_cm: float | None = None) -> dict:
    front_marker = side_marker = None
    if height_cm is None:
        if marker_cm is None:
            raise ValueError("Thiếu chiều cao hoặc kích thước marker.")
        front_scale, front_marker = marker_scale(front_frame, marker_cm)
        side_scale, side_marker = marker_scale(side_frame, marker_cm)
    front = engine.pose(front_frame)
    side = engine.pose(side_frame)
    if front.people_count != 1 or side.people_count != 1:
        raise ValueError("Mỗi ảnh cần có đúng một người.")
    if front.mask is None or side.mask is None:
        raise ValueError("Không tách được hình người. Hãy quét lại trong điều kiện đủ sáng.")
    for name in ("left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_ankle", "right_ankle"):
        _point(front, name)
    for left, right in (("left_shoulder", "right_shoulder"), ("left_hip", "right_hip"), ("left_ankle", "right_ankle")):
        _visible_midpoint(side, left, right)
    front_extent = _body_extent(front)
    side_extent = _body_extent(side)
    if height_cm is not None:
        if not 0.85 <= side_extent / front_extent <= 1.15:
            raise ValueError("Hai góc chụp không cùng tỷ lệ chiều cao. Giữ camera và vị trí đứng cố định rồi quét lại.")
        front_scale = front_extent / height_cm
        side_scale = side_extent / height_cm
    height = height_cm if height_cm is not None else front_extent / front_scale
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
        depth = _torso_width(side, fraction, partial=True) / side_scale
        values[key] = _circumference(width, depth)
    # Thigh width is measured separately on the front and side at 18% down the upper leg.
    for pose, scale, label in ((front, front_scale, "front"), (side, side_scale, "side")):
        leg_side = "left" if label == "front" or min(pose.points.get("left_hip", {}).get("visibility", 0), pose.points.get("left_knee", {}).get("visibility", 0)) >= min(pose.points.get("right_hip", {}).get("visibility", 0), pose.points.get("right_knee", {}).get("visibility", 0)) else "right"
        hip = _point(pose, f"{leg_side}_hip")
        knee = _point(pose, f"{leg_side}_knee")
        sample = hip * 0.82 + knee * 0.18
        values[f"thigh_{label}"] = _row_width(pose.mask, int(sample[1]), int(sample[0]), int(pose.width * 0.11)) / scale
    values["thigh"] = _circumference(values.pop("thigh_front"), values.pop("thigh_side"))
    result = {k: {"cm": round(float(v), 1), "source": "manual" if k == "height" and height_cm is not None else "estimated"} for k, v in values.items()}
    return {
        "measurements": result,
        "markers": {"front": front_marker, "side": side_marker},
        "notes": ["Số đo là ước lượng từ ảnh và quần áo đang mặc. Hãy đối chiếu thước dây trước khi mua."],
        "timestamp": time.time(),
    }
