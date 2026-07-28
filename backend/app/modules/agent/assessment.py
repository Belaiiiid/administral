"""The MonParcours Result — one deterministic, explainable assessment for agents.

Four analyses already run before a dossier reaches the Agent Portal —
completeness, coherence, document quality, and fraud/vigilance. Until now the
agent read them as four separate cards. This module combines them into a single
weighted verdict, computed **entirely by rule**:

    global = completeness·35% + coherence·30% + documentQuality·20% + vigilance·15%

Hard boundaries, from the specification:

- **No LLM decides the score.** Every number here is arithmetic over analysis
  outputs that already exist on the `Case`. Given the same inputs it always
  produces the same result, and every category states its explanation and the
  evidence it rests on.
- **The AI does not decide eligibility.** The result is decision *support*: a
  band (favorable / vigilance / défavorable) that orders the agent's attention
  and a list of recommended human review actions — never a ruling. The agent
  remains the final decision maker (the *décision humaine* guardrail).

The result is recomputed on read and persisted only when it changes, so the
`assessment_generated` / `assessment_updated` audit events mark real changes
(for example, when the asynchronous fraud pass lands) rather than every view.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.modules.agent.models import (
    AnomalySeverity,
    Case,
    DocumentStatus,
    ReportOutcome,
)
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.auth.models import User

# The fixed weights. One place, summing to 1.0 — asserted at import so a later
# edit that breaks the sum fails loudly rather than silently skewing scores.
WEIGHT_COMPLETENESS = 0.35
WEIGHT_COHERENCE = 0.30
WEIGHT_DOCUMENT_QUALITY = 0.20
WEIGHT_VIGILANCE = 0.15
assert (
    abs(WEIGHT_COMPLETENESS + WEIGHT_COHERENCE + WEIGHT_DOCUMENT_QUALITY + WEIGHT_VIGILANCE - 1.0)
    < 1e-9
)

#: Vigilance penalty per document fraud-risk level (higher risk → lower score).
#: Keys are the exact ``niveau_risque`` strings the fraud service emits.
_RISK_PENALTY: dict[str, int] = {
    "CRITIQUE": 40,
    "ÉLEVÉ": 30,
    "MODÉRÉ": 15,
    "À VÉRIFIER": 10,
    "FAIBLE": 0,
    "INCONNU": 0,
}

_DISCLAIMER = (
    "Résultat d'aide à l'instruction, calculé de façon déterministe à partir des "
    "analyses du dossier. Il ne préjuge pas de l'éligibilité : la décision reste "
    "humaine."
)


class _CamelBase(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class CategoryAssessment(_CamelBase):
    """One of the four axes of the result."""

    score: int
    #: A short machine label for the band the score falls in (per category).
    status: str
    #: One-sentence, human-readable justification.
    explanation: str
    #: Concrete items the score rests on (missing pieces, anomalies, flags…).
    evidence: list[str]
    #: The category's weight in the global score, surfaced for transparency.
    weight: float


class MonParcoursResult(_CamelBase):
    """The unified assessment shown on the agent's dossier."""

    score: int
    #: Decision-support band — NOT an eligibility verdict.
    band: str
    completeness: CategoryAssessment
    coherence: CategoryAssessment
    document_quality: CategoryAssessment
    vigilance: CategoryAssessment
    #: Deterministic next steps for the human reviewer.
    recommended_actions: list[str]
    computed_at: datetime | None = None
    disclaimer: str = _DISCLAIMER


# ---------------------------------------------------------------------------
# Category computations — pure functions over the loaded Case aggregate.
# ---------------------------------------------------------------------------


def _completeness(case: Case) -> CategoryAssessment:
    report = case.completeness_report
    if report is None:
        return CategoryAssessment(
            score=0,
            status="non_analyse",
            explanation="Analyse de complétude indisponible.",
            evidence=[],
            weight=WEIGHT_COMPLETENESS,
        )
    score = max(0, min(100, report.completion_rate))
    missing = [item.label for item in report.items if item.required and not item.received]
    status = "complet" if score == 100 else "partiel" if score >= 50 else "incomplet"
    explanation = f"{score}% des pièces obligatoires fournies."
    if missing:
        explanation += f" {len(missing)} pièce(s) manquante(s)."
    return CategoryAssessment(
        score=score,
        status=status,
        explanation=explanation,
        evidence=[f"Pièce manquante : {label}" for label in missing],
        weight=WEIGHT_COMPLETENESS,
    )


def _coherence(case: Case) -> CategoryAssessment:
    report = case.coherence_report
    if report is None:
        # Not run (legacy/seed): no incoherence was *found*, but say so plainly.
        return CategoryAssessment(
            score=100,
            status="non_analyse",
            explanation="Analyse de cohérence indisponible.",
            evidence=[],
            weight=WEIGHT_COHERENCE,
        )
    if report.coherence_score is not None:
        score = max(0, min(100, report.coherence_score))
    else:
        score = {ReportOutcome.passed: 100, ReportOutcome.warning: 60, ReportOutcome.failed: 30}[
            report.outcome
        ]
    status = {
        ReportOutcome.passed: "coherent",
        ReportOutcome.warning: "a_revoir",
        ReportOutcome.failed: "incoherent",
    }[report.outcome]
    explanation = report.ai_explanation or f"Cohérence globale : {score}/100."
    evidence = [f"{a.field} : {a.message}" for a in report.anomalies[:5]]
    return CategoryAssessment(
        score=score,
        status=status,
        explanation=explanation,
        evidence=evidence,
        weight=WEIGHT_COHERENCE,
    )


def _document_quality(case: Case) -> CategoryAssessment:
    documents = list(case.documents)
    if not documents:
        return CategoryAssessment(
            score=0,
            status="aucune_piece",
            explanation="Aucune pièce déposée.",
            evidence=[],
            weight=WEIGHT_DOCUMENT_QUALITY,
        )
    # A piece is "exploitable" when it was validated and its text was extracted.
    readable = [
        d for d in documents if d.status == DocumentStatus.validated and d.extracted_at is not None
    ]
    unusable = [d for d in documents if d.status == DocumentStatus.rejected]
    not_extracted = [
        d
        for d in documents
        if d.status == DocumentStatus.validated and d.extracted_at is None
    ]
    score = round(100 * len(readable) / len(documents))
    status = "bonne" if score >= 80 else "moyenne" if score >= 50 else "faible"
    explanation = f"{len(readable)}/{len(documents)} pièce(s) exploitable(s) par l'OCR."
    evidence = [f"Illisible : {d.file_name}" for d in unusable]
    evidence += [f"Texte non exploité : {d.file_name}" for d in not_extracted]
    return CategoryAssessment(
        score=score,
        status=status,
        explanation=explanation,
        evidence=evidence[:5],
        weight=WEIGHT_DOCUMENT_QUALITY,
    )


def _vigilance(case: Case) -> CategoryAssessment:
    """Higher score = lower concern. Starts at 100, penalised by risk signals."""
    penalty = 0
    evidence: list[str] = []

    for doc in case.documents:
        level = doc.fraud_risk
        weight = _RISK_PENALTY.get(level, 0) if level else 0
        if weight > 0:
            penalty += weight
            evidence.append(f"{doc.file_name} : risque {level}")

    if case.coherence_report is not None:
        errors = [a for a in case.coherence_report.anomalies if a.severity == AnomalySeverity.error]
        penalty += 10 * len(errors)
        evidence += [f"Incohérence bloquante : {a.field}" for a in errors]

    score = max(0, min(100, 100 - penalty))
    status = "faible" if score >= 80 else "moderee" if score >= 50 else "elevee"
    explanation = (
        "Aucun signal de vigilance détecté."
        if not evidence
        else f"{len(evidence)} signal(aux) de vigilance à examiner."
    )
    return CategoryAssessment(
        score=score,
        status=status,
        explanation=explanation,
        evidence=evidence[:5],
        weight=WEIGHT_VIGILANCE,
    )


def _band(score: int) -> str:
    """Decision-support band. Explicitly not an eligibility verdict."""
    if score >= 75:
        return "favorable"
    if score >= 50:
        return "vigilance"
    return "defavorable"


def _recommended_actions(
    completeness: CategoryAssessment,
    coherence: CategoryAssessment,
    document_quality: CategoryAssessment,
    vigilance: CategoryAssessment,
) -> list[str]:
    """Deterministic next steps for the human reviewer, worst-first."""
    actions: list[str] = []
    if completeness.score < 100 and completeness.evidence:
        actions.append(
            "Réclamer les pièces manquantes au demandeur avant toute décision."
        )
    if coherence.status == "incoherent":
        actions.append(
            "Lever les incohérences relevées (pièces vs. déclaration) avant validation."
        )
    elif coherence.status == "a_revoir":
        actions.append("Vérifier manuellement les points de cohérence signalés.")
    if document_quality.score < 80:
        actions.append("Redemander les pièces illisibles ou non exploitées par l'OCR.")
    if vigilance.score < 80:
        actions.append(
            "Examiner manuellement les pièces signalées (contrôle anti-fraude) — "
            "ne pas décider sur le seul signal automatique."
        )
    if not actions:
        actions.append("Aucune action bloquante : dossier prêt pour décision humaine.")
    return actions


def compute_assessment(case: Case) -> MonParcoursResult:
    """The pure, deterministic computation. No timestamp, no I/O — testable."""
    completeness = _completeness(case)
    coherence = _coherence(case)
    document_quality = _document_quality(case)
    vigilance = _vigilance(case)

    score = round(
        WEIGHT_COMPLETENESS * completeness.score
        + WEIGHT_COHERENCE * coherence.score
        + WEIGHT_DOCUMENT_QUALITY * document_quality.score
        + WEIGHT_VIGILANCE * vigilance.score
    )

    return MonParcoursResult(
        score=score,
        band=_band(score),
        completeness=completeness,
        coherence=coherence,
        document_quality=document_quality,
        vigilance=vigilance,
        recommended_actions=_recommended_actions(
            completeness, coherence, document_quality, vigilance
        ),
    )


def _stable_payload(result: MonParcoursResult) -> dict:
    """The comparable form stored on the Case — excludes the timestamp.

    Two computations with identical inputs must serialise identically, so the
    change-detection that drives ``assessment_updated`` triggers on a real input
    change, not on the clock.
    """
    return result.model_dump(mode="json", by_alias=True, exclude={"computed_at"})


def get_or_refresh_assessment(
    db: Session, case: Case, *, actor: User | None
) -> MonParcoursResult:
    """Return the MonParcours Result, persisting + auditing it when it changes.

    Recomputes from the current dossier state. If nothing is stored yet, stores
    it and records ``assessment_generated``; if the recomputed result differs
    from what is stored, updates it and records ``assessment_updated``; otherwise
    it is a pure read. The audit event is written in the same transaction as the
    stored change, so the trail cannot disagree with the persisted result.
    """
    result = compute_assessment(case)
    payload = _stable_payload(result)

    if case.assessment is None:
        action: AuditAction | None = AuditAction.assessment_generated
    elif case.assessment != payload:
        action = AuditAction.assessment_updated
    else:
        action = None

    if action is not None:
        now = datetime.now(UTC)
        case.assessment = payload
        case.assessment_computed_at = now
        audit_service.record(
            db,
            action=action,
            entity_type="case",
            entity_id=case.application_number,
            actor=actor,
            summary=(
                f"MonParcours Result {'généré' if action is AuditAction.assessment_generated else 'mis à jour'} "
                f"pour le dossier {case.application_number} — score {result.score}/100 ({result.band})."
            ),
            payload={
                "score": result.score,
                "band": result.band,
                "completeness": result.completeness.score,
                "coherence": result.coherence.score,
                "document_quality": result.document_quality.score,
                "vigilance": result.vigilance.score,
            },
        )
        db.commit()
        db.refresh(case)

    result.computed_at = case.assessment_computed_at
    return result
