"""Document fraud analysis orchestration — Agent C4.

Combines the two layers: deterministic metadata signals (always) and the
optional LLM forensic verdict. Produces the `FraudAnalysisSchema` the API
returns and the citizen upload flow persists.

Sits in `ai/` alongside coherence: both are analysis stages a document passes
through, both degrade gracefully without a key, and neither is a request handler.
"""

from __future__ import annotations

from pathlib import Path

from app.modules.ai.fraud.ela import analyse_ela
from app.modules.ai.fraud.integrity import analyse_integrity
from app.modules.ai.fraud.llm_analyzer import analyze_with_mistral
from app.modules.ai.fraud.metadata import extract_metadata
from app.modules.ai.fraud.schemas import (
    DocumentIntegritySchema,
    FraudAnalysisSchema,
    FraudLlmSchema,
    FraudVisualSchema,
    VisionModelSchema,
)
from app.modules.ai.fraud.vision_model import analyse_with_vision_model
from app.core.config import settings


def _overall_risk(signals: list[str]) -> str:
    """The badge value.

    The value is deterministic: the LLM is explanatory only and never changes
    the review priority in this sensitive workflow.

    """
    return "À VÉRIFIER" if signals else "FAIBLE"


def analyze_document(
    file_path: str,
    *,
    display_name: str | None = None,
    extracted_text: str | None = None,
    duplicate_count: int = 1,
) -> FraudAnalysisSchema:
    """Run metadata, optional contextual, and ELA visual forensic layers."""
    path = Path(file_path)
    meta = extract_metadata(path)
    integrity_raw = analyse_integrity(
        path, extracted_text=extracted_text, duplicate_count=duplicate_count
    )
    integrity = DocumentIntegritySchema.model_validate(integrity_raw)
    vision_model = VisionModelSchema.model_validate(analyse_with_vision_model(path))
    trufor_available = vision_model.status == "TERMINE"

    # ELA is opt-in and limited to original JPEGs. Rendering a PDF or encoding
    # a PNG as JPEG creates artifacts, so it must not influence a review.
    # It supports TruFor by hiding its boxes when TruFor is available.
    ela_raw = (
        analyse_ela(path, draw_boxes=not trufor_available)
        if settings.fraud_enable_ela and path.suffix.lower() in {".jpg", ".jpeg"}
        else []
    )
    ela_visuals = [FraudVisualSchema.model_validate(visual) for visual in ela_raw]

    # Metadata extraction for images needs ExifTool in this project.  That must
    # not discard the independent ELA result: the agent can still inspect the
    # pixels and their localised boxes when EXIF metadata is unavailable.
    if (
        "erreur" in meta
        and not meta.get("signaux_a_verifier")
        and not integrity_raw["signals"]
        and not ela_visuals
    ):
        return FraudAnalysisSchema(
            fichier=display_name or path.name,
            signaux_a_verifier=[],
            niveau_risque="INCONNU",
            a_des_signaux=False,
            integrity=integrity,
            vision_model=vision_model,
            erreur=meta["erreur"],
        )

    signals = list(meta.get("signaux_a_verifier", [])) + integrity_raw["signals"]
    if trufor_available and vision_model.score is not None and vision_model.score >= 0.65:
        signals.append(
            "SIGNAL TruFor : le modèle visuel a relevé une anomalie localisée ; "
            "contrôlez les encadrés violets avec le document d'origine."
        )
    elif not trufor_available and any(visual.is_suspicious for visual in ela_visuals):
        signals.append(
            "SIGNAL ELA : anomalie de compression sur un JPEG original ; "
            "à confirmer par un contrôle humain ou TruFor."
        )
    # The LLM receives only already-computed evidence. It may prioritise review,
    # but it never discovers facts nor makes an eligibility/fraud decision.
    meta["controle_integrite"] = integrity.model_dump(by_alias=True)
    meta["modele_vision"] = vision_model.model_dump(by_alias=True)
    llm_raw = analyze_with_mistral(meta, signals)

    return FraudAnalysisSchema(
        fichier=display_name or meta.get("fichier") or path.name,
        type_fichier=meta.get("type_fichier"),
        date_creation=meta.get("date_creation"),
        date_modification=meta.get("date_modification"),
        logiciel=meta.get("logiciel"),
        auteur_declare=meta.get("auteur_declare"),
        signaux_a_verifier=signals,
        analyse_llm=FraudLlmSchema.model_validate(llm_raw) if llm_raw else None,
        niveau_risque=_overall_risk(signals),
        a_des_signaux=bool(signals) or (llm_raw is not None and bool(llm_raw.get("signaux_llm"))),
        ela_visuals=ela_visuals,
        integrity=integrity,
        vision_model=vision_model,
        erreur=meta.get("erreur"),
    )
