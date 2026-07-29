"""Error Level Analysis (ELA) for localising possible image manipulation.

ELA is an *indicator*, not a proof of fraud: a JPEG recompression residual is
compared across the page and unusually strong local residuals are highlighted
for the reviewing agent.  The detector is deliberately conservative and only
emits regions when both an absolute and a relative threshold are exceeded.
"""

from __future__ import annotations

import base64
from pathlib import Path

import cv2
import fitz
import numpy as np


def _pages(path: Path) -> list[np.ndarray]:
    """Decode an uploaded PDF or image into BGR pages."""
    if path.suffix.lower() == ".pdf":
        document = fitz.open(path)
        try:
            pages: list[np.ndarray] = []
            for page in document:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                pages.append(
                    np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
                )
            return pages
        finally:
            document.close()

    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    return [image] if image is not None else []


def _resize(image: np.ndarray, maximum: int = 2000) -> np.ndarray:
    height, width = image.shape[:2]
    if max(height, width) <= maximum:
        return image
    ratio = maximum / max(height, width)
    return cv2.resize(image, (round(width * ratio), round(height * ratio)), interpolation=cv2.INTER_AREA)


def _analyse_page(image: np.ndarray, page_number: int, draw_boxes: bool) -> dict:
    image = _resize(image)
    _, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    residual = cv2.cvtColor(cv2.absdiff(image, recompressed), cv2.COLOR_BGR2GRAY)
    enhanced = cv2.convertScaleAbs(residual, alpha=10)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

    active = enhanced[enhanced > 15]
    median_active = float(np.median(active)) if active.size else float(np.median(enhanced) + 1)
    maximum = int(np.max(enhanced))
    score = maximum / max(median_active, 1.0)
    suspicious = maximum > 80 and score > 4.8
    boxes: list[dict] = []

    if suspicious:
        threshold = min(255, max(1, int(median_active * 2.4)))
        mask = cv2.inRange(blurred, threshold, 255)
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)), iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        page_area = image.shape[0] * image.shape[1]
        for contour in contours:
            area = cv2.contourArea(contour)
            if not 250 < area < page_area * 0.9:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            confidence = float(np.max(enhanced[y:y + height, x:x + width]) / maximum * 100)
            if confidence >= 70:
                boxes.append({"x": int(x), "y": int(y), "width": int(width), "height": int(height), "confidence_pct": round(confidence, 1)})

    marked = image.copy()
    if draw_boxes:
        for box in boxes:
            x, y, width, height = box["x"], box["y"], box["width"], box["height"]
            cv2.rectangle(marked, (x, y), (x + width, y + height), (0, 0, 255), 3)
            cv2.putText(marked, "A VERIFIER", (x, max(y - 8, 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    _, buffer = cv2.imencode(".jpg", marked, [int(cv2.IMWRITE_JPEG_QUALITY), 82])

    return {
        "page_number": page_number,
        "is_suspicious": bool(boxes),
        "regions": boxes,
        "marked_image_base64": "data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii"),
        "metrics": {"anomaly_score": round(score, 2), "max_brightness": maximum},
    }


def analyse_ela(path: Path, draw_boxes: bool = True) -> list[dict]:
    """Return an annotated visual and bounding boxes for every decodable page."""
    return [_analyse_page(page, index, draw_boxes) for index, page in enumerate(_pages(path), start=1)]

