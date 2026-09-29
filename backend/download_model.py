from pathlib import Path
from urllib.request import urlretrieve

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
MODEL_PATH = Path(__file__).parent / "models" / "pose_landmarker_lite.task"


if __name__ == "__main__":
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MODEL_PATH.exists():
        print(f"Downloading MediaPipe model to {MODEL_PATH} ...")
        urlretrieve(MODEL_URL, MODEL_PATH)
    print(f"Model ready: {MODEL_PATH} ({MODEL_PATH.stat().st_size} bytes)")
