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

    # cv2.imread(str(path)) silently fails on Windows when the path contains
    # non-ASCII characters (e.g. a username outside the system codepage), so
    # the bytes are read and decoded manually instead.
    buffer = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR) if buffer.size else None
    return [image] if image is not None else []


def _resize(image: np.ndarray, maximum: int = 1024) -> np.ndarray:
    height, width = image.shape[:2]
    if max(height, width) <= maximum:
        return image
    ratio = maximum / max(height, width)
    return cv2.resize(image, (round(width * ratio), round(height * ratio)), interpolation=cv2.INTER_AREA)


def _analyse_page(image: np.ndarray, page_number: int, draw_boxes: bool) -> dict:
    image = _resize(image)
    # Multi-quality ELA prevents one arbitrary JPEG quality from deciding the
    # result. The 75th percentile retains residuals recurring across qualities
    # while rejecting one-off recompression spikes.
    residuals: list[np.ndarray] = []
    for quality in (70, 75, 80, 85, 90, 95):
        _, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        residual = cv2.cvtColor(cv2.absdiff(image, recompressed), cv2.COLOR_BGR2GRAY)
        residuals.append(cv2.convertScaleAbs(residual, alpha=10))
    residual_stack = np.stack(residuals)
    enhanced = np.percentile(residual_stack, 75, axis=0).astype(np.uint8)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

    active = enhanced[enhanced > 15]
    median_active = float(np.median(active)) if active.size else float(np.median(enhanced) + 1)
    maximum = int(np.max(enhanced))
    score = maximum / max(median_active, 1.0)
    suspicious = maximum > 80 and score > 4.8
    boxes: list[dict] = []

    if suspicious:
        threshold = min(255, max(1, int(median_active * 2.4)))
        # A candidate must recur in several recompressions. Three of six keeps
        # the detector sensitive to a local edit while rejecting one-off JPEG
        # spikes (common around text).
        quality_support = np.sum(residual_stack >= threshold, axis=0)
        mask = np.where((blurred >= threshold) & (quality_support >= 2), 255, 0).astype(np.uint8)
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25)), iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        page_area = image.shape[0] * image.shape[1]
        for contour in contours:
            area = cv2.contourArea(contour)
            if not 100 < area < page_area * 0.9:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            local_support = float(np.mean(quality_support[y:y + height, x:x + width]) / 6)
            confidence = float((np.max(enhanced[y:y + height, x:x + width]) / maximum * 0.55 + local_support * 0.45) * 100)
            if confidence >= 55 and local_support >= 0.15:
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
        "metrics": {
            "anomaly_score": round(score, 2),
            "max_brightness": maximum,
            "variance": round(float(np.var(enhanced)), 2),
            "energy": round(float(np.mean(np.square(enhanced.astype(np.float32)))), 2),
            "suspicious_pixel_pct": round(float(np.mean(enhanced > 80) * 100), 3),
            "quality_levels": 6,
        },
    }


def analyse_ela(path: Path, draw_boxes: bool = True) -> list[dict]:
    """Return an annotated visual and bounding boxes for every decodable page."""
    return [_analyse_page(page, index, draw_boxes) for index, page in enumerate(_pages(path), start=1)]


def render_fused_regions(path: Path, regions: list[dict]) -> list[dict]:
    """Render one original-page view with the already merged evidence boxes."""
    results: list[dict] = []
    for page_number, page in enumerate(_pages(path), start=1):
        image = _resize(page)
        page_regions = [region for region in regions if region["page_number"] == page_number]
        marked = image.copy()
        for region in page_regions:
            x, y, width, height = region["x"], region["y"], region["width"], region["height"]
            cv2.rectangle(marked, (x, y), (x + width, y + height), (128, 0, 255), 3)
            label = "+".join(region["detectors"]).upper()
            cv2.putText(marked, label[:28], (x, max(y - 8, 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (128, 0, 255), 2)
        _, buffer = cv2.imencode(".jpg", marked, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        results.append({
            "page_number": page_number,
            "is_suspicious": bool(page_regions),
            "regions": [
                {"x": r["x"], "y": r["y"], "width": r["width"], "height": r["height"], "confidence_pct": round(r["confidence"] * 100, 1)}
                for r in page_regions
            ],
            "marked_image_base64": "data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii"),
            "metrics": {},
        })
    return results
