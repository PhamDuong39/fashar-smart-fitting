"""Recommendation should keep a useful nearest size when measurements conflict."""
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.features.recommendations.service import recommend


class RecommendationTest(unittest.TestCase):
    def test_top_uses_nearest_size_and_marks_chart_mismatch(self):
        measurements = {"shoulder": 42, "chest": 92, "waist": 76, "hip": 96, "thigh": 55}
        rows = recommend(measurements, "all")["recommendations"]
        top = next(row for row in rows if row["product_id"] == "top-01")
        self.assertEqual((top["size"], top["fit_status"]), ("M", "fits"))
        measurements["chest"] = 120
        rows = recommend(measurements, "all")["recommendations"]
        top = next(row for row in rows if row["product_id"] == "top-01")
        self.assertEqual((top["size"], top["fit_status"]), ("XL", "closest"))

    def test_bottom_moves_to_xl_with_larger_body_measurements(self):
        measurements = {"shoulder": 42, "chest": 92, "waist": 76, "hip": 96, "thigh": 55}
        measurements.update(waist=98, hip=116, thigh=68)
        rows = recommend(measurements, "all")["recommendations"]
        pants = next(row for row in rows if row["product_id"] == "bottom-01")
        self.assertEqual((pants["size"], pants["fit_status"]), ("XL", "fits"))


if __name__ == "__main__":
    unittest.main()
