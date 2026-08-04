"""Configurable, explainable Evidence Fusion for document-fraud signals.

This module deliberately separates a detector's raw output from its calibrated
fraud evidence.  Calibration and weights live in ``fusion_config.json`` so
operational tuning never requires a code deployment.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class EvidenceRegion:
    page_number: int
    x: int
    y: int
    width: int
    height: int
    suspicion: float
    confidence: float
    detector: str
    explanation: str


@dataclass(frozen=True)
class DetectorEvidence:
    detector: str
    status: str
    raw_score: float | None
    confidence: float
    explanation: str
    regions: list[EvidenceRegion] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


@lru_cache(maxsize=1)
def load_fusion_config() -> dict:
    path = Path(__file__).with_name("fusion_config.json")
    return json.loads(path.read_text(encoding="utf-8"))


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def calibrate(detector: str, raw_score: float, config: dict) -> float:
    """Map detector-native scores to the common [0, 1] suspicion scale."""
    points = config["calibration"].get(detector, [[0.0, 0.0], [1.0, 1.0]])
    value = _clamp(raw_score)
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if value <= x2:
            if x2 == x1:
                return _clamp(y2)
            return _clamp(y1 + (value - x1) * (y2 - y1) / (x2 - x1))
    return _clamp(float(points[-1][1]))


def _iou(a: EvidenceRegion, b: EvidenceRegion) -> float:
    left, top = max(a.x, b.x), max(a.y, b.y)
    right, bottom = min(a.x + a.width, b.x + b.width), min(a.y + a.height, b.y + b.height)
    intersection = max(0, right - left) * max(0, bottom - top)
    union = a.width * a.height + b.width * b.height - intersection
    return intersection / union if union else 0.0


def merge_regions(evidences: list[DetectorEvidence], config: dict) -> list[dict]:
    """Merge overlapping detector boxes while retaining every contributor."""
    groups: list[list[EvidenceRegion]] = []
    threshold = float(config["regionMergeIou"])
    for region in [r for e in evidences for r in e.regions]:
        matching = next((g for g in groups if g[0].page_number == region.page_number and any(_iou(region, item) >= threshold for item in g)), None)
        if matching is None:
            groups.append([region])
        else:
            matching.append(region)

    merged: list[dict] = []
    for group in groups:
        left = min(r.x for r in group)
        top = min(r.y for r in group)
        right = max(r.x + r.width for r in group)
        bottom = max(r.y + r.height for r in group)
        detectors = sorted({r.detector for r in group})
        suspicion = sum(r.suspicion for r in group) / len(group)
        # Agreement of independent localisers raises confidence, never suspicion.
        confidence = min(1.0, sum(r.confidence for r in group) / len(group) + 0.08 * (len(detectors) - 1))
        # A single forensic method can be noisy on administrative documents, so
        # regions are tagged rather than hidden: the agent decides whether an
        # uncorroborated-but-strong signal warrants manual verification.
        corroborated = len(detectors) >= 2
        merged.append({
            "page_number": group[0].page_number,
            "x": left, "y": top, "width": right - left, "height": bottom - top,
            "suspicion": round(suspicion, 3), "confidence": round(confidence, 3),
            "detectors": detectors,
            "explanation": "Zone signalée par " + ", ".join(detectors) + ".",
            "corroborated": corroborated,
        })
    ordered = sorted(merged, key=lambda item: (item["page_number"], -(item["suspicion"] * item["confidence"])))
    per_page: dict[int, int] = {}
    result: list[dict] = []
    for item in ordered:
        page_number = item["page_number"]
        # Keep the normal presentation compact, but never hide a strongly
        # corroborated zone merely because three weaker ones were already shown.
        high_confidence = (
            item["confidence"] >= 0.75
            and item["suspicion"] >= 0.70
            and ("trufor" in item["detectors"] or len(item["detectors"]) >= 3)
        )
        if per_page.get(page_number, 0) >= 3 and not high_confidence:
            continue
        result.append(item)
        if not high_confidence:
            per_page[page_number] = per_page.get(page_number, 0) + 1
    return result


def fuse(evidences: list[DetectorEvidence]) -> dict:
    """Return a dynamic-weight decision and fully explainable contributions."""
    config = load_fusion_config()
    applicable = [e for e in evidences if e.status == "APPLICABLE" and e.raw_score is not None]
    inactive_contributions = [
        {
            "detector": evidence.detector,
            "status": evidence.status,
            "raw_score": None,
            "score": None,
            "confidence": 0.0,
            "weight": 0.0,
            "contribution": 0.0,
            "explanation": evidence.explanation,
            "limitations": evidence.limitations,
            "depreciation_applied": False,
            "depreciation_reason": None,
        }
        for evidence in evidences if evidence not in applicable
    ]
    if not applicable:
        return {"score_final": 0.0, "confidence": 0.0, "niveau_risque": "INCONNU", "contributions": inactive_contributions, "regions": []}

    base = config["baseWeights"]
    reliability = {e.detector: max(0.05, min(1.0, e.confidence)) for e in applicable}
    denominator = sum(float(base.get(e.detector, 0.0)) * reliability[e.detector] for e in applicable)
    merged_regions = merge_regions(applicable, config)
    confirmed_detectors = {detector for region in merged_regions for detector in region["detectors"]}
    
    # Calculate convergence for visual detectors globally across the document
    visual_detectors = {"ela", "trufor", "copy_move", "noise", "dct", "ocr_layout", "llm_vision"}
    convergent_count = sum(1 for e in applicable if e.detector in visual_detectors and e.raw_score is not None and float(e.raw_score) >= 0.70)
    
    contributions: list[dict] = []
    score = 0.0
    for evidence in applicable:
        weight = (float(base.get(evidence.detector, 0.0)) * reliability[evidence.detector] / denominator) if denominator else 0.0
        calibrated = calibrate(evidence.detector, float(evidence.raw_score), config)
        depreciation_applied = False
        depreciation_reason = None
        
        if evidence.detector in visual_detectors and evidence.detector not in confirmed_detectors:
            raw = float(evidence.raw_score) if evidence.raw_score is not None else 0.0
            
            if convergent_count >= 2:
                # Blended formula: skip the binary cliff if multiple independent visual signals fire strongly
                multiplier = min(0.85, 0.35 + 0.20 * (convergent_count - 1))
                calibrated *= multiplier
                depreciation_applied = True
                depreciation_reason = f"Preuve visuelle non corroborée spatialement, mais corroborée globalement (convergence de {convergent_count} détecteurs)."
            elif raw >= 0.8:
                # Graduated penalty: single signal but very strong
                calibrated *= 0.85
                depreciation_applied = True
                depreciation_reason = "Preuve visuelle non corroborée, mais score brut suffisamment élevé pour justifier une alerte."
            else:
                # Standard penalty for noise
                calibrated *= 0.60
                depreciation_applied = True
                depreciation_reason = "Preuve visuelle non corroborée ou zones masquées par le filtre de présentation."
                
        contribution = weight * calibrated
        score += contribution
        contributions.append({
            "detector": evidence.detector,
            "status": evidence.status,
            "raw_score": round(float(evidence.raw_score), 3),
            "score": round(calibrated, 3),
            "confidence": round(evidence.confidence, 3),
            "weight": round(weight, 3),
            "contribution": round(contribution, 3),
            "explanation": evidence.explanation,
            "limitations": evidence.limitations,
            "depreciation_applied": depreciation_applied,
            "depreciation_reason": depreciation_reason,
        })

    # Confidence measures decision coverage and corroboration, not fraud level.
    coverage = min(1.0, denominator / sum(float(value) for value in base.values()))
    suspicious = [c for c in contributions if c["score"] >= 0.45]
    corroboration = min(0.20, 0.07 * max(0, len(suspicious) - 1))
    confidence = min(1.0, coverage * (sum(reliability.values()) / len(reliability)) + corroboration)
    score = _clamp(score)
    thresholds = config["riskThresholds"]
    # A deterministic, verifiable integrity/metadata/2D-Doc anomaly must remain
    # visible even when several neutral visual detectors are applicable. This
    # rule is deliberately restricted: TruFor, ELA, noise and DCT can never
    # trigger it.
    strong_verifiable_signal = any(
        item["detector"] in {"metadata", "integrity", "twodoc"}
        and item["score"] >= 0.75
        and item["confidence"] >= 0.75
        for item in contributions
    )
    # A single visual detector can be penalised down to near-zero by the
    # uncorroborated-evidence multipliers above, yet still carry a calibrated
    # score strong enough that an agent should not dismiss it outright. This
    # bypass surfaces the dossier for manual review without letting one signal
    # drive the numeric score_final past the ELEVE/MODERE thresholds.
    strong_visual_signal = any(
        item["detector"] in visual_detectors and item["score"] is not None and item["score"] >= 0.65
        for item in contributions
    )
    risk = (
        "ELEVE" if score >= thresholds["eleve"]
        else "MODERE" if score >= thresholds["modere"]
        else "A_VERIFIER" if score >= thresholds["faible"] or strong_verifiable_signal or strong_visual_signal
        else "FAIBLE"
    )
    return {"score_final": round(score, 3), "confidence": round(confidence, 3), "niveau_risque": risk, "contributions": contributions + inactive_contributions, "regions": merged_regions}
