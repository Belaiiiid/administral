"""Tests for evidence extraction — the anti-hallucination boundary.

These verify the two rules that make a rejection defensible: a clean case yields
no blocking evidence (so it cannot be rejected), and a document that is both
rejected and missing is cited once, not twice.

They build Case objects in memory without a database — extraction reads the
aggregate, it does not query.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.modules.agent.models import (
    AnomalySeverity,
    Case,
    CaseDocument,
    CoherenceAnomaly,
    CoherenceReport,
    CompletenessItem,
    CompletenessReport,
    DocumentStatus,
    MaritalStatus,
    OccupancyStatus,
    ReportOutcome,
)
from app.modules.agent.evidence import (
    extract_blocking_evidence,
    extract_supporting_evidence,
)


def _case(**overrides: object) -> Case:
    """A minimal valid Case; override the fields a test cares about."""
    defaults: dict[str, object] = dict(
        id="c1",
        application_number="2026-APL-0001",
        status="ready_for_decision",
        submitted_at=datetime(2026, 7, 14, tzinfo=UTC),
        service_id="caf",
        service_label="APL",
        marital_status=MaritalStatus.single,
        dependent_children=0,
        attached_adults=0,
        occupancy_status=OccupancyStatus.tenant,
        living_area_sqm=30,
        monthly_rent_excluding_charges=600,
        address="x",
        postal_code="69000",
        city="Lyon",
        annual_income=20000,
        profile_captured_at=datetime(2026, 7, 14, tzinfo=UTC),
        documents=[],
        completeness_report=None,
        coherence_report=None,
    )
    defaults.update(overrides)
    return Case(**defaults)


def test_clean_case_yields_no_blocking_evidence() -> None:
    """A case with everything passed presents nothing to reject.

    This is what makes the decision service refuse a rejection on a clean case:
    the guard fires precisely because this list is empty.
    """
    case = _case(
        completeness_report=CompletenessReport(
            outcome=ReportOutcome.passed, checked_at=datetime(2026, 7, 14, tzinfo=UTC),
            completion_rate=100, items=[],
        ),
        coherence_report=CoherenceReport(
            outcome=ReportOutcome.passed, checked_at=datetime(2026, 7, 14, tzinfo=UTC),
            anomalies=[],
        ),
    )

    assert extract_blocking_evidence(case) == []
    assert len(extract_supporting_evidence(case)) == 2


def test_rejected_and_missing_document_is_cited_once() -> None:
    """A rejected upload also shows as "not received"; only the specific finding counts."""
    case = _case(
        documents=[
            CaseDocument(
                id="d1", requirement_id="proof_of_address", requirement_label="Attestation",
                file_name="f.jpg", mime_type="image/jpeg", size_bytes=1,
                uploaded_at=datetime(2026, 7, 14, tzinfo=UTC),
                status=DocumentStatus.rejected, error_message="Illisible.",
            )
        ],
        completeness_report=CompletenessReport(
            outcome=ReportOutcome.failed, checked_at=datetime(2026, 7, 14, tzinfo=UTC),
            completion_rate=50,
            items=[
                CompletenessItem(
                    item_key="proof_of_address", label="Attestation",
                    received=False, required=True,
                )
            ],
        ),
    )

    evidence = extract_blocking_evidence(case)

    assert len(evidence) == 1
    assert "n’a pas pu être exploité" in evidence[0].value


def test_info_anomaly_is_not_blocking() -> None:
    """`info` anomalies are observations, not defects — they justify no rejection."""
    case = _case(
        coherence_report=CoherenceReport(
            outcome=ReportOutcome.warning, checked_at=datetime(2026, 7, 14, tzinfo=UTC),
            anomalies=[
                CoherenceAnomaly(
                    id="a1", severity=AnomalySeverity.info, field="X",
                    declared_value="1", observed_value="1", message="note",
                )
            ],
        ),
    )

    assert extract_blocking_evidence(case) == []


def test_explanation_cites_only_supplied_evidence() -> None:
    """The invariant: every evidence value appears verbatim in the message.

    This is the whole anti-hallucination guarantee, tested at the composition
    step. When a model replaces the templates, this test is what catches it
    inventing or dropping a fact.
    """
    from app.modules.agent.models import DecisionOutcome
    from app.modules.agent.schemas import DecisionEvidenceSchema
    from app.modules.ai.explanation import generate_explanation

    evidence = [
        DecisionEvidenceSchema(field="documents", value="le document « A » n’a pas été fourni", source="s1"),
        DecisionEvidenceSchema(field="coherenceReport", value="l’information « B » ne correspond pas", source="s2"),
    ]

    message = generate_explanation(DecisionOutcome.rejected, evidence)

    assert all(item.value in message for item in evidence)


def test_rejection_without_evidence_is_refused() -> None:
    """Composition refuses an unsupported rejection even if the guard upstream is bypassed."""
    import pytest

    from app.core.exceptions import ValidationError
    from app.modules.agent.models import DecisionOutcome
    from app.modules.ai.explanation import generate_explanation

    with pytest.raises(ValidationError):
        generate_explanation(DecisionOutcome.rejected, [])
