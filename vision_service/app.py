"""Local CUDA/CPU inference service for the official TruFor implementation."""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path
from threading import Lock

import cv2
import fitz
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parent.parent
TRUFOR_SRC = Path(os.getenv("TRUFOR_SRC", ROOT / "third_party" / "trufor" / "test_docker" / "src"))
WEIGHTS = Path(os.getenv("TRUFOR_WEIGHTS", ROOT / "vision_service" / "weights" / "weights" / "trufor.pth.tar"))
MAX_SIDE = int(os.getenv("TRUFOR_MAX_SIDE", "1024"))
THRESHOLD = float(os.getenv("TRUFOR_LOCALIZATION_THRESHOLD", "0.5"))
CONFIDENCE_THRESHOLD = float(os.getenv("TRUFOR_CONFIDENCE_THRESHOLD", "0.5"))
if str(TRUFOR_SRC) not in sys.path:
    sys.path.insert(0, str(TRUFOR_SRC))

app = FastAPI(title="MonParcours TruFor inference", version="1.0.0")
_model = None
_device: torch.device | None = None
_lock = Lock()


def _device_for_inference() -> torch.device:
    return torch.device("cuda:0" if torch.cuda.is_available() else "cpu")


def _load_model():
    global _model, _device
    if _model is not None:
        return _model, _device
    if not WEIGHTS.is_file():
        raise RuntimeError(f"Poids TruFor introuvables : {WEIGHTS}")
    with _lock:
        if _model is None:
            from config import _C as base_config
            from models.cmx.builder_np_conf import myEncoderDecoder
            config = base_config.clone()
            config.defrost()
            config.merge_from_file(str(TRUFOR_SRC / "trufor.yaml"))
            config.TEST.MODEL_FILE = str(WEIGHTS)
            config.freeze()
            _device = _device_for_inference()
            if _device.type == "cuda":
                torch.backends.cudnn.benchmark = True
                torch.set_float32_matmul_precision("high")
            checkpoint = torch.load(WEIGHTS, map_location=_device, weights_only=False)
            model = myEncoderDecoder(cfg=config)
            model.load_state_dict(checkpoint["state_dict"], strict=True)
            _model = model.to(_device).eval()
    return _model, _device


def _pages(data: bytes, filename: str) -> list[np.ndarray]:
    if filename.lower().endswith(".pdf"):
        document = fitz.open(stream=data, filetype="pdf")
        try:
            result = []
            for page in document:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                result.append(cv2.cvtColor(np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3), cv2.COLOR_RGB2BGR))
            return result
        finally:
            document.close()
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    return [image] if image is not None else []


def _resize(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    if max(height, width) <= MAX_SIDE:
        return image
    scale = MAX_SIDE / max(height, width)
    return cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


def _encode(image: np.ndarray) -> str:
    _, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    return "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")


def _infer_page(image: np.ndarray, page_number: int) -> dict:
    model, device = _load_model()
    image = _resize(image)
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float().div(256.0).unsqueeze(0).to(device)
    with torch.inference_mode():
        pred, confidence, detection, _noiseprint = model(tensor)
        anomaly = F.softmax(pred.squeeze(0), dim=0)[1].float().cpu().numpy()
        confidence_map = torch.sigmoid(confidence.squeeze(0))[0].float().cpu().numpy()
        score = float(torch.sigmoid(detection).item()) if detection is not None else float(anomaly.mean())
    mask = np.where((anomaly >= THRESHOLD) & (confidence_map >= CONFIDENCE_THRESHOLD), 255, 0).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    page_area = image.shape[0] * image.shape[1]
    regions = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not 120 < area < page_area * 0.75:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        regions.append({"x": int(x), "y": int(y), "width": int(width), "height": int(height), "confidence_pct": round(float(confidence_map[y:y + height, x:x + width].mean() * 100), 1)})
    regions = sorted(regions, key=lambda region: region["confidence_pct"], reverse=True)
    marked = image.copy()
    for region in regions:
        x, y, width, height = region["x"], region["y"], region["width"], region["height"]
        cv2.rectangle(marked, (x, y), (x + width, y + height), (255, 0, 255), 3)
    return {"page_number": page_number, "is_suspicious": bool(regions), "regions": regions, "marked_image_base64": _encode(marked), "metrics": {"anomaly_score": round(score, 4), "max_brightness": 0}, "score": round(score, 4)}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "device": str(_device_for_inference()), "weights_present": WEIGHTS.is_file()}


@app.post("/analyse")
async def analyse(file: UploadFile = File(...)) -> dict:
    pages = _pages(await file.read(), file.filename or "document")
    if not pages:
        raise HTTPException(status_code=400, detail="PDF ou image illisible.")
    try:
        results = [_infer_page(page, index) for index, page in enumerate(pages, start=1)]
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"provider": "TRUFOR", "device": str(_device_for_inference()), "score": max(result["score"] for result in results), "pages": results}
