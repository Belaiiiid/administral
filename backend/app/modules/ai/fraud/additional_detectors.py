"""Conservative, local visual detectors used as independent fraud evidence."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import cv2
import numpy as np

from app.modules.ai.fraud.ela import _pages, _resize
from app.modules.ai.fraud.fusion import DetectorEvidence, EvidenceRegion


def _normal_pages(path: Path) -> list[np.ndarray]:
    return [_resize(page) for page in _pages(path)]


def analyse_copy_move(path: Path) -> DetectorEvidence:
    regions: list[EvidenceRegion] = []
    for page_number, image in enumerate(_normal_pages(path), 1):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        keypoints, descriptors = cv2.ORB_create(nfeatures=1800, fastThreshold=12).detectAndCompute(gray, None)
        if descriptors is None or len(keypoints) < 30:
            continue
        pairs = []
        for match_pair in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(descriptors, descriptors, k=3):
            candidates = [match for match in match_pair if match.queryIdx != match.trainIdx]
            if not candidates:
                continue
            candidate = candidates[0]
            if candidate.distance > 32 or (len(candidates) > 1 and candidate.distance >= 0.80 * candidates[1].distance):
                continue
            a, b = keypoints[candidate.queryIdx].pt, keypoints[candidate.trainIdx].pt
            if np.hypot(a[0] - b[0], a[1] - b[1]) > 55:
                pairs.append((a, b))
        if len(pairs) < 12:
            continue
        # A genuine copy-move normally has a repeated translation. Isolated
        # matches from letters, tables or watermark patterns are discarded.
        shifts = Counter((round((b[0] - a[0]) / 20), round((b[1] - a[1]) / 20)) for a, b in pairs)
        shift, support = shifts.most_common(1)[0]
        consistent = [(a, b) for a, b in pairs if (round((b[0] - a[0]) / 20), round((b[1] - a[1]) / 20)) == shift]
        if support < 12:
            continue
        for points in ([a for a, _b in consistent], [b for _a, b in consistent]):
            xs, ys = [point[0] for point in points], [point[1] for point in points]
            margin = 18
            regions.append(EvidenceRegion(page_number, max(0, int(min(xs) - margin)), max(0, int(min(ys) - margin)), int(max(xs) - min(xs) + 2 * margin), int(max(ys) - min(ys) + 2 * margin), min(0.9, support / 24), 0.65, "copy_move", "Motif visuel similaire retrouvé à deux emplacements avec le même déplacement."))
    return DetectorEvidence("copy_move", "APPLICABLE", min(1.0, len(regions) / 2), 0.70 if regions else 0.35,
        "Aucune duplication interne géométriquement cohérente détectée." if not regions else "Une duplication interne cohérente est à vérifier.", regions=regions,
        limitations=["Les tableaux et filigranes peuvent produire des correspondances légitimes."])


def _tile_regions(image: np.ndarray, page_number: int, detector: str, label: str, mode: str) -> list[EvidenceRegion]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    tile, values = 64, []
    for y in range(0, gray.shape[0] - tile + 1, tile):
        for x in range(0, gray.shape[1] - tile + 1, tile):
            block = gray[y:y + tile, x:x + tile]
            # Uniform paper background is not forensic evidence and makes MAD
            # unstable. Analyse only tiles containing meaningful texture.
            if float(np.std(block)) < 12.0:
                continue
            if mode == "noise":
                value = float(np.var(block - cv2.GaussianBlur(block, (0, 0), 1.2)))
            else:
                value = float(np.mean(np.abs(cv2.dct(block / 255.0)[8:, 8:])))
            values.append((value, x, y))
    if len(values) < 8:
        return []
    sample = np.array([value for value, _x, _y in values])
    median, mad = float(np.median(sample)), float(np.median(np.abs(sample - np.median(sample)))) or 1e-6
    selected = [(value, x, y) for value, x, y in values if abs(value - median) / mad >= 7.0]
    return [EvidenceRegion(page_number, x, y, tile, tile, min(0.78, abs(value - median) / mad / 12), 0.42, detector, label) for value, x, y in selected[:4]]


def analyse_noise(path: Path) -> DetectorEvidence:
    regions = [region for i, page in enumerate(_normal_pages(path), 1) for region in _tile_regions(page, i, "noise", "Niveau de bruit local différent des zones voisines.", "noise")]
    return DetectorEvidence("noise", "APPLICABLE", min(1.0, len(regions) / 4), 0.48 if regions else 0.35,
        "Aucune rupture locale de bruit marquée." if not regions else f"{len(regions)} zone(s) présentent un bruit atypique.", regions=regions,
        limitations=["La qualité d’un scan peut faire varier le bruit sans falsification."])


def analyse_dct(path: Path) -> DetectorEvidence:
    regions = [region for i, page in enumerate(_normal_pages(path), 1) for region in _tile_regions(page, i, "dct", "Artefacts de compression localement différents.", "dct")]
    return DetectorEvidence("dct", "APPLICABLE", min(1.0, len(regions) / 4), 0.46 if regions else 0.34,
        "Aucune incohérence de compression locale marquée." if not regions else f"{len(regions)} zone(s) ont des artefacts de compression atypiques.", regions=regions,
        limitations=["Ce contrôle est moins fiable après conversions ou captures d’écran."])


def analyse_ocr_layout(path: Path, extracted_text: str | None) -> DetectorEvidence:
    if not extracted_text or len(extracted_text.strip()) < 30:
        return DetectorEvidence("ocr_layout", "NON_APPLICABLE", None, 0.0, "Structure OCR non exploitable : texte absent ou trop court.")
    regions: list[EvidenceRegion] = []
    for page_number, image in enumerate(_normal_pages(path), 1):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(binary)
        heights = stats[1:, cv2.CC_STAT_HEIGHT]
        valid = heights[(heights >= 8) & (heights <= 80)]
        if valid.size < 30:
            continue
        median = float(np.median(valid))
        for index in [i for i in range(1, count) if 8 <= stats[i, cv2.CC_STAT_HEIGHT] <= 160 and stats[i, cv2.CC_STAT_AREA] > 80 and stats[i, cv2.CC_STAT_HEIGHT] > median * 2.8][:6]:
            x, y, width, height, _area = stats[index]
            regions.append(EvidenceRegion(page_number, int(x), int(y), int(width), int(height), 0.48, 0.42, "ocr_layout", "Élément textuel ou graphique dont la taille diffère fortement du reste de la page."))
    return DetectorEvidence("ocr_layout", "APPLICABLE", min(1.0, len(regions) / 6), 0.48 if regions else 0.42,
        "Aucune irrégularité de structure textuelle marquée." if not regions else f"{len(regions)} élément(s) de mise en page atypique(s).", regions=regions,
        limitations=["Sans coordonnées OCR détaillées, ce contrôle observe la structure visuelle et non la police exacte."])
