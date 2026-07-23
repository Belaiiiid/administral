"""Coherence analysis orchestration (Module C1).

Ported from `MonParcours-nour/analyse_coherence.py`. Takes a completed dossier,
runs the LLM verification, and aggregates the per-check results into a single
verdict.

Called after a dossier is marked "Complet" by the completeness stage. Its
verdict routes the dossier downstream:

    coherent_global = True   → toward the final report / scoring
    coherent_global = False  → toward fraud review (Module C4) or a human

This is business logic, not a request handler and not an HTTP call — the router
owns the first, `mistral_client` owns the second.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.agent.models import (
    AnomalySeverity,
    Case,
    CoherenceAnomaly,
    CoherenceReport,
    ReportOutcome,
)
from app.modules.agent.repository import upsert_coherence_report
from app.modules.ai.coherence.mistral_client import verifier_coherence_llm
from app.modules.ai.coherence.schemas import (
    CoherenceStatus,
    ResultatCoherence,
    Verification,
)


def _statut_global(verifications: list[Verification]) -> CoherenceStatus:
    """The worst status wins.

    One proven `incoherent` makes the whole dossier incoherent. Absent that, any
    `a_revoir` makes it reviewable. `coherent` is only reached when every check
    earned it — coherence is never the default.
    """
    statuts = {v.statut for v in verifications}

    if "incoherent" in statuts:
        return "incoherent"
    if "a_revoir" in statuts:
        return "a_revoir"
    return "coherent"


def analyser_coherence(profil: dict, documents: list[dict]) -> ResultatCoherence:
    """Analyse a complete dossier for cross-document coherence.

    Args:
        profil: the citizen's declared information.
        documents: OCR-extracted fields per document, as the completeness
            pipeline produces them.

    Returns:
        The global verdict plus every non-coherent check.
    """
    resultats = verifier_coherence_llm(profil, documents)
    verifications = [Verification(**r) for r in resultats]

    statut = _statut_global(verifications)
    incoherences = [v for v in verifications if v.statut != "coherent"]

    return ResultatCoherence(
        coherent_global=statut == "coherent",
        statut_global=statut,
        incoherences=incoherences,
    )


# ---------------------------------------------------------------------------
# C6 — Rapport de cohérence : génération + persistance
# ---------------------------------------------------------------------------

_OUTCOME_MAP: dict[CoherenceStatus, ReportOutcome] = {
    "coherent": ReportOutcome.passed,
    "a_revoir": ReportOutcome.warning,
    "incoherent": ReportOutcome.failed,
}

_SEVERITY_MAP: dict[CoherenceStatus, AnomalySeverity] = {
    "incoherent": AnomalySeverity.error,
    "a_revoir": AnomalySeverity.warning,
    # "coherent" never appears in incoherences, included for completeness
    "coherent": AnomalySeverity.info,
}


def _verif_to_anomaly(v: Verification, report_id: str) -> CoherenceAnomaly:
    """Map one `Verification` (non-coherent) to a `CoherenceAnomaly` DB entity.

    `declared_value` and `observed_value` are extracted from `preuves` on a
    best-effort basis: the LLM does not guarantee two distinct entries. When
    fewer than two proofs are available `raison` serves as the fallback so the
    anomaly row is never blank.
    """
    declared = v.preuves[0] if len(v.preuves) > 0 else v.raison
    observed = v.preuves[1] if len(v.preuves) > 1 else v.raison

    return CoherenceAnomaly(
        report_id=report_id,
        severity=_SEVERITY_MAP.get(v.statut, AnomalySeverity.warning),
        field=v.champ,
        declared_value=declared,
        observed_value=observed,
        message=v.raison,
    )


def generer_et_persister_rapport(
    db: Session,
    *,
    case: Case,
    profil: dict,
    documents: list[dict],
) -> CoherenceReport:
    """Run C1 analysis and persist the result as a `CoherenceReport`.

    Idempotent: calling this twice on the same case replaces the previous
    report, so a re-run after document correction is safe.

    Args:
        db: SQLAlchemy session (transaction management delegated to
            `upsert_coherence_report`).
        case: the loaded `Case` ORM instance (with `coherence_report` eager-
            loaded so the upsert can detect an existing report).
        profil: citizen's declared information, as `CoherenceRequest.profil_declare`.
        documents: OCR-extracted document fields, as `CoherenceRequest.documents_extraits`.

    Returns:
        The persisted `CoherenceReport` (with its `id` populated by the DB).
    """
    resultat = analyser_coherence(profil, documents)
    outcome = _OUTCOME_MAP[resultat.statut_global]
    now = datetime.now(timezone.utc)

    # Build the report shell first (without anomalies) so its `id` can be
    # referenced by the anomaly rows before the INSERT is flushed.
    from app.modules.agent.models import _uuid  # local import avoids circular

    report_id = _uuid()
    anomalies = [
        _verif_to_anomaly(v, report_id) for v in resultat.incoherences
    ]

    report = CoherenceReport(
        id=report_id,
        case_id=case.id,
        outcome=outcome,
        checked_at=now,
        anomalies=anomalies,
    )

    return upsert_coherence_report(db, case=case, report=report)

