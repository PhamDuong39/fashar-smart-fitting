"""Small, editable demo catalog with body-size charts in centimetres."""
from __future__ import annotations

SIZES = ["S", "M", "L", "XL"]

TOP_CHART = {
    "S": {"chest": [78, 90], "shoulder": [36, 42], "torso_length": [40, 57]},
    "M": {"chest": [88, 100], "shoulder": [39, 46], "torso_length": [43, 61]},
    "L": {"chest": [98, 110], "shoulder": [43, 50], "torso_length": [46, 65]},
    "XL": {"chest": [108, 122], "shoulder": [47, 55], "torso_length": [49, 70]},
}
BOTTOM_CHART = {
    "S": {"waist": [62, 72], "hip": [82, 92], "thigh": [42, 54], "outer_leg": [80, 100]},
    "M": {"waist": [70, 82], "hip": [90, 102], "thigh": [50, 60], "outer_leg": [83, 104]},
    "L": {"waist": [80, 92], "hip": [100, 112], "thigh": [56, 66], "outer_leg": [86, 108]},
    "XL": {"waist": [90, 104], "hip": [110, 124], "thigh": [62, 74], "outer_leg": [89, 112]},
}

PRODUCTS = [
    {"id": "top-01", "name": "Aero Shell", "subtitle": "Áo khoác cấu trúc", "type": "top", "audience": "unisex", "fit": "relaxed", "tags": ["vai trội", "dáng thẳng"], "color": "#c6f5ee", "accent": "#2dd4bf", "price": "690.000₫"},
    {"id": "top-02", "name": "Nexa Tee", "subtitle": "Áo thun tối giản", "type": "top", "audience": "unisex", "fit": "regular", "tags": ["cân đối", "eo rõ"], "color": "#ecf4fa", "accent": "#9cb4ce", "price": "290.000₫"},
    {"id": "top-03", "name": "Orbit Hoodie", "subtitle": "Hoodie form rộng", "type": "top", "audience": "unisex", "fit": "oversized", "tags": ["hông trội", "dáng thẳng"], "color": "#a69bd2", "accent": "#6555a5", "price": "590.000₫"},
    {"id": "top-04", "name": "Core Oxford", "subtitle": "Sơ mi cổ điển", "type": "top", "audience": "men", "fit": "regular", "tags": ["vai trội", "cân đối"], "color": "#d4e8f1", "accent": "#6d9eb5", "price": "520.000₫"},
    {"id": "top-05", "name": "Contour Knit", "subtitle": "Áo dệt ôm nhẹ", "type": "top", "audience": "women", "fit": "slim", "tags": ["eo rõ", "cân đối"], "color": "#e3b9d5", "accent": "#a45c84", "price": "450.000₫"},
    {"id": "top-06", "name": "Delta Vest", "subtitle": "Áo gile layering", "type": "top", "audience": "unisex", "fit": "relaxed", "tags": ["hông trội", "vai trội"], "color": "#d5dfaa", "accent": "#8c9d50", "price": "390.000₫"},
    {"id": "bottom-01", "name": "Axis Straight", "subtitle": "Quần ống suông", "type": "bottom", "audience": "unisex", "fit": "straight", "tags": ["vai trội", "hông trội"], "color": "#a6b3c6", "accent": "#657990", "price": "650.000₫"},
    {"id": "bottom-02", "name": "Pulse Cargo", "subtitle": "Quần túi hộp", "type": "bottom", "audience": "unisex", "fit": "relaxed", "tags": ["vai trội", "dáng thẳng"], "color": "#b9c0a2", "accent": "#78815a", "price": "720.000₫"},
    {"id": "bottom-03", "name": "Mono Denim", "subtitle": "Jeans ống đứng", "type": "bottom", "audience": "unisex", "fit": "straight", "tags": ["cân đối", "eo rõ"], "color": "#86a1c3", "accent": "#395a83", "price": "750.000₫"},
    {"id": "bottom-04", "name": "Metro Tailor", "subtitle": "Quần âu dáng slim", "type": "bottom", "audience": "men", "fit": "slim", "tags": ["vai trội", "cân đối"], "color": "#b5bdc9", "accent": "#555e70", "price": "790.000₫"},
    {"id": "bottom-05", "name": "Flow Wide", "subtitle": "Quần ống rộng", "type": "bottom", "audience": "women", "fit": "wide", "tags": ["hông trội", "eo rõ"], "color": "#d5b5c5", "accent": "#8c677b", "price": "680.000₫"},
    {"id": "bottom-06", "name": "Vector Jogger", "subtitle": "Jogger kỹ thuật", "type": "bottom", "audience": "unisex", "fit": "tapered", "tags": ["dáng thẳng", "cân đối"], "color": "#adbad2", "accent": "#5f749e", "price": "560.000₫"},
]

for product in PRODUCTS:
    product["size_chart"] = TOP_CHART if product["type"] == "top" else BOTTOM_CHART
    product["asset"] = f"/assets/garments/{product['id']}.svg"


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
            if not all(key in measurements and chart[key][0] <= measurements[key] <= chart[key][1] for key in primary):
                continue
            deviation = sum(abs(measurements[key] - sum(chart[key]) / 2) / (chart[key][1] - chart[key][0]) for key in primary)
            candidates.append((deviation, -size_index, size))
        size = min(candidates)[2] if candidates else None
        matched_tags = [tag for tag in labels if tag in product["tags"]]
        score = (3 if size else 0) + len(matched_tags)
        reasons = []
        if size:
            reasons.append(f"Các vòng chính nằm trong khoảng size {size}")
        else:
            reasons.append("Chưa có size phù hợp với các vòng chính")
        if matched_tags:
            reasons.append(f"Kiểu dáng hợp với đặc điểm {', '.join(matched_tags)}")
        length_key = "torso_length" if product["type"] == "top" else "outer_leg"
        if size and length_key in measurements:
            low, high = product["size_chart"][size][length_key]
            if not low <= measurements[length_key] <= high:
                reasons.append("Nên kiểm tra chiều dài sản phẩm")
        results.append({"product_id": product["id"], "size": size, "score": score, "reasons": reasons})
    results.sort(key=lambda row: (-row["score"], row["product_id"]))
    return {"shape_labels": labels, "recommendations": results}
