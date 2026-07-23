"""Reads verifiable facts out of a Case.

## Why this is extraction and not analysis

Every function here *reads* a column the pipeline already wrote and restates it
in citizen-readable French. Nothing is inferred, computed or judged: a document
is missing because ``received is False``, not because this module decided it
matters. That distinction is what keeps the decision endpoint a consumer of
processed cases rather than a second decision engine.

## The phrasing rule

``value`` is written as a sentence fragment that can be concatenated after
« car … » without alteration. Explanations are built by joining these verbatim,
so the citizen-facing wording is decided *here*, next to the field it came from,
never by a downstream paraphrase that could drift from it.

Constructions avoid French gender agreement (« le document « X » n'a pas été
fourni » rather than « X est absent·e ») so a new document label cannot produce
a grammatically wrong sentence.

Ported from the frontend mock this replaces; the wording is identical on
purpose, so cutting over changes no message a citizen would receive.
"""

from __future__ import annotations

import re

from app.modules.agent.models import AnomalySeverity, Case, DocumentStatus, ReportOutcome
from app.modules.agent.schemas import DecisionEvidenceSchema


def _strip_trailing_period(text: str) -> str:
    return re.sub(r"\.\s*$", "", text)


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


def extract_blocking_evidence(case: Case) -> list[DecisionEvidenceSchema]:
    """Grounds for rejection: what is missing, unusable or inconsistent.

    An empty result means the case presents no verifiable defect — precisely
    the situation in which a rejection must be refused.
    """
    evidence: list[DecisionEvidenceSchema] = []

    # A document that was uploaded but rejected also shows as "not received" on
    # the completeness checklist. Reporting both would cite the same defect
    # twice, so the more specific finding wins and the checklist entry is
    # skipped for that requirement.
    unusable_requirements = {
        doc.requirement_id for doc in case.documents if doc.status == DocumentStatus.rejected
    }

    for doc in case.documents:
        if doc.status != DocumentStatus.rejected:
            continue

        detail = ""
        if doc.error_message:
            detail = f" ({_lower_first(_strip_trailing_period(doc.error_message))})"

        evidence.append(
            DecisionEvidenceSchema(
                field="documents",
                value=(
                    f"le document « {doc.requirement_label} » transmis "
                    f"n’a pas pu être exploité{detail}"
                ),
                source=f"Case.documents[{doc.id}]",
            )
        )

    if case.completeness_report is not None:
        for item in case.completeness_report.items:
            if item.received or not item.required:
                continue
            if item.item_key in unusable_requirements:
                continue

            evidence.append(
                DecisionEvidenceSchema(
                    field="documents",
                    value=f"le document « {item.label} » n’a pas été fourni",
                    source=f"Case.completenessReport.items[{item.item_key}]",
                )
            )

    if case.coherence_report is not None:
        for anomaly in case.coherence_report.anomalies:
            # `info` anomalies are observations, not defects — they justify nothing.
            if anomaly.severity == AnomalySeverity.info:
                continue

            evidence.append(
                DecisionEvidenceSchema(
                    field="coherenceReport",
                    value=(
                        f"l’information « {anomaly.field} » que vous avez déclarée "
                        f"({anomaly.declared_value}) ne correspond pas à la pièce "
                        f"fournie ({anomaly.observed_value})"
                    ),
                    source=f"Case.coherenceReport.anomalies[{anomaly.id}]",
                )
            )

    return evidence


def extract_supporting_evidence(case: Case) -> list[DecisionEvidenceSchema]:
    """Grounds for approval: which checks the case satisfied.

    The AI score is deliberately excluded. It is an internal instruction aid,
    not a justification owed to a citizen, and quoting a model's number back to
    someone as the reason for a decision about them is not a defensible
    explanation.

    Approval may carry no evidence at all — an agent can approve a case that has
    reservations, and the business rules require evidence only for rejections.
    """
    evidence: list[DecisionEvidenceSchema] = []

    if case.completeness_report is not None:
        if case.completeness_report.outcome == ReportOutcome.passed:
            evidence.append(
                DecisionEvidenceSchema(
                    field="completenessReport",
                    value="l’ensemble des pièces justificatives requises a été fourni",
                    source="Case.completenessReport.outcome",
                )
            )

    if case.coherence_report is not None:
        if case.coherence_report.outcome == ReportOutcome.passed:
            evidence.append(
                DecisionEvidenceSchema(
                    field="coherenceReport",
                    value="les informations déclarées correspondent aux pièces fournies",
                    source="Case.coherenceReport.outcome",
                )
            )

    return evidence
