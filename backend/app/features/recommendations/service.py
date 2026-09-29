"""Body shape classification and size recommendations."""
from __future__ import annotations

from app.features.catalog.data import PRODUCTS, SIZES


def shape_labels(measurements: dict[str, float]) -> list[str]:
    shoulder = measurements.get("shoulder", 0)
    hip_circumference = measurements.get("hip", 0)
    chest = measurements.get("chest", 0)
    waist = measurements.get("waist", 0)
    hip_width = measurements.get("hip_width", 0)
    labels = []
    if shoulder and hip_width:
        ratio = shoulder / hip_width
        labels.append("vai trội" if ratio > 1.10 else "hông trội" if ratio < 0.90 else "cân đối")
    if waist and min(chest, hip_circumference):
        labels.append("eo rõ" if waist < 0.8 * min(chest, hip_circumference) else "dáng thẳng")
    return labels


def recommend(measurements: dict[str, float], audience: str) -> dict:
    labels = shape_labels(measurements)
    results = []
    for product in PRODUCTS:
        if audience != "all" and product["audience"] not in (audience, "unisex"):
            continue
        primary = ("chest", "shoulder") if product["type"] == "top" else ("waist", "hip", "thigh")
        candidates = []
        for size_index, size in enumerate(SIZES):
            chart = product["size_chart"][size]
            if not all(key in measurements and measurements[key] > 0 for key in primary):
                continue
            outside = sum(max(chart[key][0] - measurements[key], 0, measurements[key] - chart[key][1]) / (chart[key][1] - chart[key][0]) for key in primary)
            deviation = sum(abs(measurements[key] - sum(chart[key]) / 2) / (chart[key][1] - chart[key][0]) for key in primary)
            candidates.append((outside, deviation, -size_index, size))
        closest = min(candidates) if candidates else None
        size = closest[3] if closest else None
        fit_status = "fits" if closest and closest[0] == 0 else "closest" if closest else "unavailable"
        matched_tags = [tag for tag in labels if tag in product["tags"]]
        score = (3 if fit_status == "fits" else 1 if size else 0) + len(matched_tags)
        reasons = []
        if fit_status == "fits":
            reasons.append(f"Các vòng chính nằm trong khoảng size {size}")
        elif size:
            reasons.append(f"Size {size} gần số đo nhất, nhưng có vòng nằm ngoài bảng size; hãy kiểm tra trước khi chọn")
        else:
            reasons.append("Thiếu số đo để gợi ý size")
        if matched_tags:
            reasons.append(f"Kiểu dáng hợp với đặc điểm {', '.join(matched_tags)}")
        length_key = "torso_length" if product["type"] == "top" else "outer_leg"
        if size and length_key in measurements:
            low, high = product["size_chart"][size][length_key]
            if not low <= measurements[length_key] <= high:
                reasons.append("Nên kiểm tra chiều dài sản phẩm")
        results.append({"product_id": product["id"], "size": size, "fit_status": fit_status, "score": score, "reasons": reasons})
    results.sort(key=lambda row: (-row["score"], row["product_id"]))
    return {"shape_labels": labels, "recommendations": results}
