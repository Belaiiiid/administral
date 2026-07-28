"""The MonParcours Result — the deterministic 4-category scoring.

DB-free: the assessment is arithmetic over analysis outputs, so these exercise
that arithmetic on lightweight stand-ins carrying the same attributes (and the
same real enums) a loaded ``Case`` would. Locking the weighting and the
per-category rules down here is what makes "no LLM decides the score" verifiable.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.modules.agent.assessment import (
    WEIGHT_COHERENCE,
    WEIGHT_COMPLETENESS,
    WEIGHT_DOCUMENT_QUALITY,
    WEIGHT_VIGILANCE,
    compute_assessment,
    _stable_payload,
)
from app.modules.agent.models import AnomalySeverity, DocumentStatus, ReportOutcome

_NOW = datetime(2026, 7, 26, 16, 0, tzinfo=UTC)


def _doc(name="piece.pdf", *, status=DocumentStatus.validated, extracted=True, fraud_risk=None):
    return SimpleNamespace(
        file_name=name,
        status=status,
        extracted_at=_NOW if extracted else None,
        fraud_risk=fraud_risk,
    )


def _completeness_report(rate, items=()):
    return SimpleNamespace(completion_rate=rate, items=list(items))


def _item(label, *, required=True, received=True):
    return SimpleNamespace(label=label, required=required, received=received)


def _coherence_report(score, outcome, anomalies=(), explanation="ok"):
    return SimpleNamespace(
        coherence_score=score, outcome=outcome, ai_explanation=explanation, anomalies=list(anomalies)
    )


def _anomaly(field, message, severity=AnomalySeverity.warning):
    return SimpleNamespace(field=field, message=message, severity=severity)


def _case(*, completeness=None, coherence=None, documents=()):
    return SimpleNamespace(
        application_number="APL-x",
        completeness_report=completeness,
        coherence_report=coherence,
        documents=list(documents),
    )


# ---------------------------------------------------------------------------


def test_weights_sum_to_one() -> None:
    total = WEIGHT_COMPLETENESS + WEIGHT_COHERENCE + WEIGHT_DOCUMENT_QUALITY + WEIGHT_VIGILANCE
    assert abs(total - 1.0) < 1e-9


def test_perfect_dossier_scores_100_favorable() -> None:
    case = _case(
        completeness=_completeness_report(100, [_item("RIB")]),
        coherence=_coherence_report(100, ReportOutcome.passed),
        documents=[_doc(), _doc("bail.pdf")],
    )
    result = compute_assessment(case)
    assert result.score == 100
    assert result.band == "favorable"
    assert result.completeness.score == 100
    assert result.vigilance.score == 100
    assert "prêt pour décision humaine" in " ".join(result.recommended_actions)


def test_global_is_the_weighted_sum() -> None:
    # Each category 80 → global 80, whatever the weights are.
    case = _case(
        completeness=_completeness_report(80, [_item("A", received=True)]),
        coherence=_coherence_report(80, ReportOutcome.warning),
        documents=[
            _doc("a.pdf"),
            _doc("b.pdf"),
            _doc("c.pdf"),
            _doc("d.pdf"),
            _doc("e.pdf", status=DocumentStatus.rejected, extracted=False),
        ],  # 4/5 readable = 80
    )
    # vigilance has no signals → 100, so recompute expected explicitly:
    expected = round(0.35 * 80 + 0.30 * 80 + 0.20 * 80 + 0.15 * 100)
    assert compute_assessment(case).score == expected


def test_missing_required_piece_lowers_completeness_and_lists_it() -> None:
    case = _case(
        completeness=_completeness_report(
            90, [_item("Avis d'imposition", required=True, received=False)]
        ),
    )
    result = compute_assessment(case)
    assert result.completeness.score == 90
    assert result.completeness.status == "partiel"
    assert any("Avis d'imposition" in e for e in result.completeness.evidence)
    assert any("manquantes" in a or "manquante" in a for a in result.recommended_actions)


def test_incoherence_flags_status_and_recommends_action() -> None:
    case = _case(
        coherence=_coherence_report(
            30,
            ReportOutcome.failed,
            [_anomaly("Loyer", "déclaré 500, bail 800", AnomalySeverity.error)],
        ),
    )
    result = compute_assessment(case)
    assert result.coherence.score == 30
    assert result.coherence.status == "incoherent"
    assert any("Loyer" in e for e in result.coherence.evidence)
    assert any("incohérence" in a.lower() for a in result.recommended_actions)


def test_document_quality_reflects_readability() -> None:
    case = _case(
        documents=[
            _doc("ok.pdf"),
            _doc("bad.pdf", status=DocumentStatus.rejected, extracted=False),
        ]
    )
    result = compute_assessment(case)
    assert result.document_quality.score == 50
    assert result.document_quality.status == "moyenne"
    assert any("bad.pdf" in e for e in result.document_quality.evidence)


def test_no_documents_scores_zero_quality() -> None:
    result = compute_assessment(_case())
    assert result.document_quality.score == 0
    assert result.document_quality.status == "aucune_piece"


def test_fraud_risk_penalises_vigilance() -> None:
    case = _case(documents=[_doc("suspect.pdf", fraud_risk="ÉLEVÉ")])
    result = compute_assessment(case)
    assert result.vigilance.score == 70  # 100 - 30
    assert any("suspect.pdf" in e for e in result.vigilance.evidence)
    assert any("anti-fraude" in a for a in result.recommended_actions)


def test_critical_risk_and_error_anomaly_stack() -> None:
    case = _case(
        coherence=_coherence_report(
            40, ReportOutcome.failed, [_anomaly("NIR", "incohérent", AnomalySeverity.error)]
        ),
        documents=[_doc("faux.pdf", fraud_risk="CRITIQUE")],  # -40
    )
    # -40 (critique) -10 (one error anomaly) = 50
    assert compute_assessment(case).vigilance.score == 50


def test_unanalysed_reports_are_stated_not_silently_scored() -> None:
    result = compute_assessment(_case())
    assert result.completeness.status == "non_analyse"
    assert result.coherence.status == "non_analyse"


def test_band_thresholds() -> None:
    # A dossier engineered to land exactly on the boundaries via completeness only.
    def score_for(completeness_rate: int) -> int:
        case = _case(
            completeness=_completeness_report(completeness_rate),
            coherence=_coherence_report(completeness_rate, ReportOutcome.passed),
            documents=[_doc()] if completeness_rate else [],
        )
        return compute_assessment(case).score

    assert compute_assessment(
        _case(
            completeness=_completeness_report(100),
            coherence=_coherence_report(100, ReportOutcome.passed),
            documents=[_doc()],
        )
    ).band == "favorable"


def test_determinism() -> None:
    case = _case(
        completeness=_completeness_report(75, [_item("A", received=False)]),
        coherence=_coherence_report(60, ReportOutcome.warning),
        documents=[_doc("x.pdf", fraud_risk="MODÉRÉ")],
    )
    assert compute_assessment(case).model_dump() == compute_assessment(case).model_dump()


def test_stable_payload_excludes_timestamp() -> None:
    # Change-detection must ignore the clock, or every read would look "updated".
    result = compute_assessment(_case(completeness=_completeness_report(100)))
    result.computed_at = _NOW
    assert "computedAt" not in _stable_payload(result)
    assert "computed_at" not in _stable_payload(result)
