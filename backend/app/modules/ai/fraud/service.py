"""Document fraud analysis orchestration — Agent C4.

Combines the two layers: deterministic metadata signals (always) and the
optional LLM forensic verdict. Produces the `FraudAnalysisSchema` the API
returns and the citizen upload flow persists.

Sits in `ai/` alongside coherence: both are analysis stages a document passes
through, both degrade gracefully without a key, and neither is a request handler.
"""

from __future__ import annotations

from pathlib import Path

from app.modules.ai.fraud.llm_analyzer import analyze_with_mistral
from app.modules.ai.fraud.metadata import extract_metadata
from app.modules.ai.fraud.schemas import FraudAnalysisSchema, FraudLlmSchema


def _overall_risk(llm: dict | None, signals: list[str]) -> str:
    """The badge value.

    Prefers the LLM's level. Without it, the deterministic layer can only say
    whether *something* warrants a look — never "authentic", which would be a
    verdict the rules are not entitled to give.
    """
    if llm and llm.get("niveau_risque") and llm["niveau_risque"] != "INCONNU":
        return llm["niveau_risque"]
    return "À VÉRIFIER" if signals else "FAIBLE"


def analyze_document(file_path: str, *, display_name: str | None = None) -> FraudAnalysisSchema:
    """Run both forensic layers on a stored file."""
    path = Path(file_path)
    meta = extract_metadata(path)

    if "erreur" in meta and not meta.get("signaux_a_verifier"):
        return FraudAnalysisSchema(
            fichier=display_name or path.name,
            signaux_a_verifier=[],
            niveau_risque="INCONNU",
            a_des_signaux=False,
            erreur=meta["erreur"],
        )

    signals = meta.get("signaux_a_verifier", [])
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
        niveau_risque=_overall_risk(llm_raw, signals),
        a_des_signaux=bool(signals) or (llm_raw is not None and bool(llm_raw.get("signaux_llm"))),
    )
