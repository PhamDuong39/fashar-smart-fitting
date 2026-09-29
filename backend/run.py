"""Run the local API, including dependencies installed in backend/.deps."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEPS = ROOT / ".deps"
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(CACHE))
if DEPS.exists():
    sys.path.insert(0, str(DEPS))
sys.path.insert(0, str(ROOT))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
