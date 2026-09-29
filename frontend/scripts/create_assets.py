"""Generate editable SVG demo garments and the printable ArUco marker."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets"
GARMENTS = ROOT / "garments"
GARMENTS.mkdir(parents=True, exist_ok=True)
BACKEND = Path(__file__).resolve().parents[2] / "backend"
DEPS = BACKEND / ".deps"
if DEPS.exists():
    sys.path.insert(0, str(DEPS))
sys.path.insert(0, str(BACKEND))
from app.features.catalog.data import PRODUCTS  # noqa: E402
(ROOT.parent / "catalog.json").write_text(json.dumps({"products": PRODUCTS}, ensure_ascii=False), encoding="utf-8")

ITEMS = [
    ("top-01", "#c6f5ee", "#2dd4bf", "shell"),
    ("top-02", "#ecf4fa", "#9cb4ce", "tee"),
    ("top-03", "#a69bd2", "#6555a5", "hoodie"),
    ("top-04", "#d4e8f1", "#6d9eb5", "shirt"),
    ("top-05", "#e3b9d5", "#a45c84", "knit"),
    ("top-06", "#d5dfaa", "#8c9d50", "vest"),
    ("bottom-01", "#a6b3c6", "#657990", "straight"),
    ("bottom-02", "#b9c0a2", "#78815a", "cargo"),
    ("bottom-03", "#86a1c3", "#395a83", "denim"),
    ("bottom-04", "#b5bdc9", "#555e70", "tailor"),
    ("bottom-05", "#d5b5c5", "#8c677b", "wide"),
    ("bottom-06", "#adbad2", "#5f749e", "jogger"),
]

def top_svg(color: str, accent: str, kind: str) -> str:
    neck = '<path d="M205 93 Q256 155 307 93" fill="none" stroke="#24413d" stroke-width="10"/>'
    if kind == "hoodie":
        neck = '<path d="M206 89 Q256 36 306 89 L327 141 Q256 125 185 141Z" fill="url(#shade)" stroke="%s" stroke-width="6"/>' % accent
    collar = ''
    if kind == "shirt":
        collar = '<path d="M205 89 L254 142 L224 164 L175 111ZM307 89 L258 142 L288 164 L337 111Z" fill="#eaf5f5" stroke="%s" stroke-width="5"/>' % accent
    if kind == "vest":
        sleeves = '<path d="M195 110 L116 134 L98 203 L140 218 L182 170Z M317 110 L396 134 L414 203 L372 218 L330 170Z" fill="#16272b" opacity=".7"/>'
    else:
        sleeves = f'<path d="M194 111 L93 134 L9 417 L70 444 L157 220 L188 194Z M318 111 L419 134 L503 417 L442 444 L355 220 L324 194Z" fill="url(#shade)" stroke="{accent}" stroke-width="7"/>'
    detail = {
        'shell': f'<path d="M256 135 V551 M183 263 L225 260 M287 260 L329 263 M179 418 H220 M292 418 H333" stroke="{accent}" stroke-width="6" fill="none"/><path d="M232 164 L256 204 L280 164" fill="none" stroke="{accent}" stroke-width="5"/>',
        'tee': f'<path d="M163 455 H349" stroke="{accent}" stroke-width="5" opacity=".6"/>',
        'hoodie': f'<path d="M175 412 Q256 442 337 412 L324 504 Q256 527 188 504Z" fill="{accent}" opacity=".35" stroke="{accent}" stroke-width="5"/><path d="M237 142 L231 241 M275 142 L281 241" stroke="#e4dcff" stroke-width="5"/>',
        'shirt': f'<path d="M256 145 V554" stroke="{accent}" stroke-width="5"/><circle cx="256" cy="215" r="4" fill="{accent}"/><circle cx="256" cy="292" r="4" fill="{accent}"/><circle cx="256" cy="369" r="4" fill="{accent}"/><path d="M160 286 L206 309 L212 372 L163 360 M352 286 L306 309 L300 372 L349 360" fill="none" stroke="{accent}" stroke-width="4"/>',
        'knit': f'<path d="M172 245 H340 M165 322 H347 M163 399 H349 M168 477 H344" stroke="{accent}" stroke-width="4" opacity=".4"/>',
        'vest': f'<path d="M256 131 V550 M161 391 L217 415 L217 475 L161 455 M351 391 L295 415 L295 475 L351 455" fill="none" stroke="{accent}" stroke-width="6"/>',
    }[kind]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 768"><defs><linearGradient id="shade" x2="1" y2=".8"><stop stop-color="{color}"/><stop offset=".55" stop-color="{color}"/><stop offset="1" stop-color="{accent}"/></linearGradient></defs>{sleeves}<path d="M194 100 Q218 89 222 93 Q256 142 290 93 Q294 89 318 100 L375 150 L350 259 L362 555 Q256 581 150 555 L162 259 L137 150Z" fill="url(#shade)" stroke="{accent}" stroke-width="8"/>{neck}{collar}{detail}<path d="M154 555 Q256 579 358 555" fill="none" stroke="{accent}" stroke-width="7"/></svg>'''

def bottom_svg(color: str, accent: str, kind: str) -> str:
    detail = {
        'straight': f'<path d="M166 200 L179 694 M346 200 L333 694" stroke="{accent}" stroke-width="4" opacity=".5"/>',
        'cargo': f'<path d="M116 330 H201 V419 H116Z M311 330 H396 V419 H311Z" fill="{accent}" opacity=".65" stroke="{accent}" stroke-width="6"/><path d="M121 342 H196 M316 342 H391" stroke="{color}" stroke-width="5"/>',
        'denim': f'<path d="M121 145 Q155 178 215 161 M391 145 Q357 178 297 161 M256 125 V223" fill="none" stroke="#d7e7ef" stroke-width="5" stroke-dasharray="9 6"/>',
        'tailor': f'<path d="M171 200 L183 695 M341 200 L329 695" stroke="#f1f5f4" stroke-width="4" opacity=".6"/>',
        'wide': f'<path d="M171 240 Q141 450 126 696 M341 240 Q371 450 386 696" stroke="{accent}" stroke-width="4" opacity=".45"/>',
        'jogger': f'<path d="M133 684 H216 M296 684 H379" stroke="{accent}" stroke-width="22"/><path d="M126 168 L164 201 L174 293 M386 168 L348 201 L338 293" stroke="{accent}" stroke-width="5" fill="none"/>',
    }[kind]
    width = 26 if kind == 'wide' else 0
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 768"><defs><linearGradient id="shade" x2="1" y2=".7"><stop stop-color="{color}"/><stop offset=".6" stop-color="{color}"/><stop offset="1" stop-color="{accent}"/></linearGradient></defs><path d="M110 54 H402 L415 202 L{395+width} 699 L{285-width} 707 L256 272 L{227+width} 707 L{117-width} 699 L97 202Z" fill="url(#shade)" stroke="{accent}" stroke-width="8"/><path d="M110 54 H402 L405 122 H107Z" fill="{accent}" opacity=".55"/><path d="M256 122 V262 M116 207 Q159 229 211 203 M396 207 Q353 229 301 203" stroke="{accent}" stroke-width="6" fill="none"/>{detail}</svg>'''

for item_id, color, accent, kind in ITEMS:
    (GARMENTS / f"{item_id}.svg").write_text(top_svg(color, accent, kind) if item_id.startswith("top") else bottom_svg(color, accent, kind), encoding="utf-8")

try:
    import cv2
    marker = cv2.aruco.generateImageMarker(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50), 0, 400)
    cells = []
    for y in range(6):
        for x in range(6):
            if marker[y*400//6+33, x*400//6+33] < 128:
                cells.append(f'<rect x="{x*100}" y="{y*100}" width="100" height="100"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 800 800"><rect x="-100" y="-100" width="800" height="800" fill="white"/><g fill="black">'+''.join(cells)+'</g></svg>'
    (ROOT / "aruco-marker.svg").write_text(svg, encoding="utf-8")
    print("Generated 12 garments and ArUco ID 0 marker")
except ImportError:
    print("Generated 12 garments. Install OpenCV, then rerun to generate ArUco marker.")
