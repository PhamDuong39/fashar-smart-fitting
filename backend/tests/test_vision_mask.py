"""Regression: MediaPipe segmentation masks can carry a singleton channel."""
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".deps"))
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from app.vision.engine import VisionEngine, _mask_2d  # noqa: E402


class MaskShapeTest(unittest.TestCase):
    def test_pose_converts_h_w_1_mask_to_h_w(self):
        mask = np.ones((480, 640, 1), dtype=np.float32)
        landmarks = [SimpleNamespace(x=.5, y=.5, z=-.2, visibility=1.0)] * 33
        result = SimpleNamespace(
            pose_landmarks=[landmarks],
            segmentation_masks=[SimpleNamespace(numpy_view=lambda: mask)],
        )
        engine = VisionEngine.__new__(VisionEngine)
        engine.lock = threading.Lock()
        engine.landmarker = SimpleNamespace(detect=lambda image: result)
        pose = engine.pose(np.zeros((480, 640, 3), dtype=np.uint8))
        self.assertEqual(pose.mask.shape, (480, 640))
        self.assertFalse(np.shares_memory(pose.mask, mask))
        self.assertEqual(pose.points["left_shoulder"]["z"], -.2)

    def test_rejects_multi_channel_mask(self):
        with self.assertRaisesRegex(ValueError, "Mask cơ thể"):
            _mask_2d(np.ones((2, 2, 3), dtype=np.float32))


if __name__ == "__main__":
    unittest.main()
