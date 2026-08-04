"""Document-fraud orchestration with configurable multi-evidence fusion."""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.modules.ai.fraud.ela import analyse_ela, render_fused_regions
from app.modules.ai.fraud.additional_detectors import (
    analyse_copy_move,
    analyse_dct,
    analyse_noise,
    analyse_ocr_layout,
)
from app.modules.ai.fraud.fusion import DetectorEvidence, EvidenceRegion, fuse
from app.modules.ai.fraud.integrity import analyse_integrity
from app.modules.ai.fraud.llm_analyzer import analyze_with_mistral, is_llm_available, render_pages_for_llm
from app.modules.ai.fraud.metadata import extract_metadata
from app.modules.ai.fraud.schemas import (
    DocumentIntegritySchema,
    FraudAnalysisSchema,
    FraudLlmSchema,
    FraudVisualSchema,
    VisionModelSchema,
)
from app.modules.ai.fraud.twodoc import analyse_2ddoc
from app.modules.ai.fraud.vision_model import analyse_with_vision_model


def _metadata_evidence(meta: dict) -> DetectorEvidence:
    signals = meta.get("signaux_a_verifier", [])
    if "erreur" in meta:
        return DetectorEvidence("metadata", "UNAVAILABLE", None, 0.0, "Métadonnées indisponibles.", limitations=[meta["erreur"]])
    strong = any("logiciel" in signal.lower() or "date" in signal.lower() for signal in signals)
    return DetectorEvidence(
        "metadata", "APPLICABLE", 1.0 if strong else min(1.0, len(signals) / 1.5), 0.82,
        "Aucune incohérence de métadonnées." if not signals
        else f"{len(signals)} incohérence(s) de métadonnées détectée(s).",
    )


def _integrity_evidence(raw: dict, extracted_text: str | None) -> DetectorEvidence:
    score = 0.0
    reasons: list[str] = []
    if raw["exact_duplicate_in_dossier"]:
        score = max(score, 0.70)
        reasons.append("même empreinte présente plusieurs fois dans le dossier")
    if raw["mrz_detected"] and raw["mrz_checksum_valid"] is False:
        score = 1.0
        reasons.append("checksum MRZ invalide")
    # A signature that no longer matches its signed byte range means the
    # document was edited after signing — as close to a cryptographic proof
    # of tampering as this module can produce.
    if raw["pdf_signature_state"] == "SIGNEE_ALTEREE":
        score = 1.0
        reasons.append("signature PDF invalide : document modifié après signature")
    signature_checked = raw["pdf_signature_state"] in {"SIGNEE_INTEGRE", "SIGNEE_ALTEREE"}
    confidence = 0.96 if raw["mrz_detected"] or raw["exact_duplicate_in_dossier"] or signature_checked else 0.65
    limitations = [] if extracted_text else ["MRZ non vérifiable : texte OCR non fourni."]
    return DetectorEvidence(
        "integrity", "APPLICABLE", score, confidence,
        "Aucune anomalie structurelle vérifiable." if not reasons else "Anomalie structurelle : " + "; ".join(reasons) + ".",
        limitations=limitations,
    )


def _ela_evidence(path: Path, enabled: bool) -> tuple[DetectorEvidence, list[FraudVisualSchema]]:
    if not enabled:
        return DetectorEvidence("ela", "NON_APPLICABLE", None, 0.0, "ELA désactivée par configuration."), []
    visuals = [FraudVisualSchema.model_validate(item) for item in analyse_ela(path, draw_boxes=False)]
    if not visuals:
        return DetectorEvidence("ela", "NON_APPLICABLE", None, 0.0, "ELA impossible : document image/PDF illisible."), []
    # ela.py only ever emits a region once anomaly_score > 4.8 (its internal
    # "suspicious" cutoff). On the validation corpus used to loosen that filter
    # (see ela.py and test_analyse_ela_detects_spliced_region), genuinely
    # falsified splices sit at anomaly_score ≈ 5-7, while untouched pages stay
    # well under the 4.8 cutoff. The previous offset/divisor (3.5 / 10.0) needed
    # anomaly_score ≈ 12 — a synthetic worst case — to reach a calibrated score
    # usable by fusion's 0.65 strong_visual_signal bypass, so realistic single
    # splices never crossed it. Anchoring raw_score at 0 for anomaly_score = 3.7
    # (comfortably below the suspicious cutoff) and at 1 around anomaly_score ≈
    # 7.4 keeps quiet pages near zero while letting the upper end of the
    # observed falsified range (~7) reach a calibrated score that clears 0.65
    # even after fusion's uncorroborated-evidence penalty.
    raw_score = max((max(0.0, min(1.0, (float(v.metrics.get("anomaly_score", 0)) - 3.7) / 3.7)) for v in visuals), default=0.0)
    regions = [
        EvidenceRegion(
            v.page_number, r.x, r.y, r.width, r.height,
            r.confidence_pct / 100,
            min(0.80 if path.suffix.lower() in {".jpg", ".jpeg"} else 0.72, 0.30 + 0.50 * r.confidence_pct / 100),
            "ela", "Résidu de compression localement atypique et répété sur plusieurs recompressions.",
        )
        for v in visuals for r in v.regions
    ]
    return DetectorEvidence(
        "ela", "APPLICABLE", raw_score, (0.70 if regions else 0.45) if path.suffix.lower() in {".jpg", ".jpeg"} else (0.48 if regions else 0.35),
        "ELA n'a relevé aucune zone locale exploitable." if not regions else f"ELA a localisé {len(regions)} zone(s) de compression atypique(s).",
        regions=regions,
        limitations=["ELA est un indicateur de compression ; il ne prouve pas une falsification."] + ([] if path.suffix.lower() in {".jpg", ".jpeg"} else ["PNG/PDF rendu temporairement en JPEG : confiance réduite."]),
    ), visuals


_LLM_RISK_TO_SCORE = {"FAIBLE": 0.10, "MODÉRÉ": 0.45, "ÉLEVÉ": 0.75, "CRITIQUE": 0.95}


def _llm_vision_evidence(llm_raw: dict | None) -> DetectorEvidence:
    if llm_raw is None:
        return DetectorEvidence("llm_vision", "NON_APPLICABLE", None, 0.0, "Analyse contextuelle IA non configurée (clé Mistral absente).")
    risk = llm_raw.get("niveau_risque")
    if risk not in _LLM_RISK_TO_SCORE:
        return DetectorEvidence("llm_vision", "UNAVAILABLE", None, 0.0, llm_raw.get("verdict") or "Analyse contextuelle IA indisponible.")
    return DetectorEvidence(
        "llm_vision", "APPLICABLE", _LLM_RISK_TO_SCORE[risk], 0.55,
        llm_raw.get("verdict") or "Analyse contextuelle IA sans anomalie notable.",
        limitations=["Jugement visuel et contextuel d'un modèle de langage ; à confirmer par un examen humain, jamais un verdict seul."],
    )


def _trufor_evidence(vision: VisionModelSchema) -> DetectorEvidence:
    if vision.status != "TERMINE" or vision.score is None:
        status = "NON_APPLICABLE" if vision.status == "NON_CONFIGURE" else "UNAVAILABLE"
        return DetectorEvidence("trufor", status, None, 0.0, vision.message)
    regions = [
        EvidenceRegion(page.page_number, r.x, r.y, r.width, r.height, r.confidence_pct / 100, r.confidence_pct / 100, "trufor", "Anomalie localisée par TruFor.")
        for page in vision.pages for r in page.regions
    ]
    # A global score without a usable location is weak evidence in this workflow.
    # The fusion logic will automatically depreciate it if no regions are corroborated.
    raw_score = min(1.0, vision.score)
    confidence = min(0.9, 0.55 + 0.1 * min(len(regions), 3)) if regions else 0.30
    return DetectorEvidence(
        "trufor", "APPLICABLE", raw_score, confidence,
        "TruFor n'a pas localisé de zone exploitable ; son score global est fortement déprécié." if not regions else f"TruFor a localisé {len(regions)} zone(s) à examiner.",
        regions=regions,
        limitations=["TruFor est une source de preuve visuelle parmi d'autres, jamais un verdict seul."],
    )


def analyze_document(
    file_path: str,
    *,
    display_name: str | None = None,
    extracted_text: str | None = None,
    duplicate_count: int = 1,
) -> FraudAnalysisSchema:
    """Analyse a document and return additive, calibrated evidence-fusion data."""
    path = Path(file_path)
    meta = extract_metadata(path)
    integrity_raw = analyse_integrity(path, extracted_text=extracted_text, duplicate_count=duplicate_count)
    integrity = DocumentIntegritySchema.model_validate(integrity_raw)
    vision_model = VisionModelSchema.model_validate(analyse_with_vision_model(path))

    # Mistral now forms its own independent visual + contextual judgment and
    # feeds the fusion below as the `llm_vision` evidence, so it is called
    # before fuse(): the deterministic signals passed here are pre-fusion
    # (metadata + integrity only) context for its narrative, not evidence it
    # should restate into its own risk level — see llm_analyzer.py's prompt.
    deterministic_signals = list(meta.get("signaux_a_verifier", [])) + integrity_raw["signals"]
    llm_context = dict(meta)
    llm_context["controle_integrite"] = integrity.model_dump(by_alias=True)
    llm_context["modele_vision"] = vision_model.model_dump(by_alias=True)
    llm_images = render_pages_for_llm(path) if is_llm_available() else []
    llm_raw = analyze_with_mistral(llm_context, deterministic_signals, llm_images)

    ela_evidence, ela_visuals = _ela_evidence(path, settings.fraud_enable_ela)
    evidences = [
        _metadata_evidence(meta),
        _integrity_evidence(integrity_raw, extracted_text),
        analyse_2ddoc(path, extracted_text),
        _llm_vision_evidence(llm_raw),
        ela_evidence,
        _trufor_evidence(vision_model),
        analyse_copy_move(path),
        analyse_noise(path),
        analyse_dct(path),
        analyse_ocr_layout(path, extracted_text),
    ]
    fused = fuse(evidences)
    signals = list(deterministic_signals)
    signals.extend(item["explanation"] for item in fused["contributions"] if item["score"] is not None and item["score"] >= 0.45 and item["explanation"] not in signals)

    manual_review = any(c.get("depreciation_applied", False) and c.get("raw_score", 0.0) is not None and float(c.get("raw_score", 0.0)) >= 0.8 for c in fused["contributions"])

    if manual_review and fused["niveau_risque"] in {"FAIBLE", "INCONNU", "A_VERIFIER"}:
        fused["niveau_risque"] = "MODERE"

    # The displayed LLM risk badge matches the fused verdict for one coherent
    # number in the UI — now legitimately informed by Mistral's own
    # contribution above, not purely cosmetic like before.
    if llm_raw and isinstance(llm_raw, dict) and "niveau_risque" in llm_raw:
        llm_raw["niveau_risque"] = fused["niveau_risque"]

    return FraudAnalysisSchema(
        fichier=display_name or meta.get("fichier") or path.name,
        type_fichier=meta.get("type_fichier"), date_creation=meta.get("date_creation"),
        date_modification=meta.get("date_modification"), logiciel=meta.get("logiciel"), auteur_declare=meta.get("auteur_declare"),
        signaux_a_verifier=signals,
        analyse_llm=FraudLlmSchema.model_validate(llm_raw) if llm_raw else None,
        niveau_risque=fused["niveau_risque"], manual_review_recommended=manual_review, a_des_signaux=fused["niveau_risque"] not in {"FAIBLE", "INCONNU"},
        ela_visuals=ela_visuals, integrity=integrity, vision_model=vision_model,
        score_final=fused["score_final"], confiance=fused["confidence"],
        contributions=fused["contributions"], zones_suspectes=fused["regions"],
        visualisations_fusionnees=[FraudVisualSchema.model_validate(item) for item in render_fused_regions(path, fused["regions"])],
        analyses_non_applicables=[e.detector for e in evidences if e.status == "NON_APPLICABLE"],
        erreur=meta.get("erreur"),
    )
