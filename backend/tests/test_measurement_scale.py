"""The stature scale must come from the detected person, not mask noise."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".deps"))
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from app.features.measurements.estimator import _body_extent  # noqa: E402
from app.vision.engine import PoseResult  # noqa: E402


def person() -> PoseResult:
    mask = np.zeros((800, 640), dtype=np.float32)
    mask[100:760, 290:351] = 1
    mask[200:450, 240:401] = 1
    mask[450:710, 265:376] = 1
    points = {
        "nose": (320, 145), "left_eye": (311, 139), "right_eye": (329, 139),
        "left_shoulder": (260, 210), "right_shoulder": (380, 210),
        "left_hip": (285, 450), "right_hip": (355, 450),
        "left_ankle": (300, 737), "right_ankle": (340, 737),
        "left_foot": (302, 754), "right_foot": (342, 754),
    }
    landmarks = {name: {"x": x / 640, "y": y / 800, "visibility": 1.0} for name, (x, y) in points.items()}
    return PoseResult(landmarks, mask, 1, 640, 800)


class MeasurementScaleTest(unittest.TestCase):
    def test_ignores_unrelated_foreground_at_image_edges(self):
        pose = person()
        self.assertEqual(_body_extent(pose), 659)
        pose.mask[:35, :250] = 1
        pose.mask[770:, 400:] = 1
        self.assertEqual(_body_extent(pose), 659)

    def test_ignores_connected_protrusion_outside_head_region(self):
        pose = person()
        pose.mask[0:450, 240:243] = 1
        self.assertEqual(_body_extent(pose), 659)

    def test_rejects_missing_head_landmark(self):
        pose = person()
        for name in ("nose", "left_eye", "right_eye"):
            pose.points[name]["visibility"] = 0
        with self.assertRaisesRegex(ValueError, "đầu"):
            _body_extent(pose)


if __name__ == "__main__":
    unittest.main()
