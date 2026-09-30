"""MediaPipe pose inference and optional silhouette extraction."""
from __future__ import annotations

import threading
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from app.core.paths import MODEL_PATH

KEYPOINTS = {
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14, "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24, "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28, "left_heel": 29, "right_heel": 30,
    "left_foot": 31, "right_foot": 32,
}


@dataclass
class PoseResult:
    points: dict[str, dict[str, float]]
    mask: np.ndarray | None
    people_count: int
    width: int
    height: int


def _mask_2d(mask: np.ndarray) -> np.ndarray:
    """MediaPipe may expose its one-channel float mask as HxW or HxWx1."""
    if mask.ndim == 3 and mask.shape[-1] == 1:
        mask = mask[:, :, 0]
    if mask.ndim != 2:
        raise ValueError(f"Mask cơ thể không đúng định dạng: {mask.shape}")
    return mask


class VisionEngine:
    def __init__(self, segmentation: bool = True) -> None:
        if not MODEL_PATH.exists():
            raise RuntimeError("Thiếu model MediaPipe. Chạy: python backend/download_model.py")
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL_PATH)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=2,
            min_pose_detection_confidence=0.55,
            min_pose_presence_confidence=0.55,
            min_tracking_confidence=0.55,
            output_segmentation_masks=segmentation,
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
                    "z": float(landmarks[index].z or 0.0),
                    "visibility": float(landmarks[index].visibility),
                }
                for name, index in KEYPOINTS.items()
            }
        mask = None
        if result.segmentation_masks:
            mask = _mask_2d(result.segmentation_masks[0].numpy_view()).copy()
        return PoseResult(points, mask, len(result.pose_landmarks), w, h)
