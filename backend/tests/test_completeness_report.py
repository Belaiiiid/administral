"""B6 reports must exist and remain understandable for both outcomes."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.modules.agent.completeness_report import build_report, render_html, render_pdf
from app.modules.agent.models import DocumentStatus, ReportOutcome


NOW = datetime(2026, 7, 27, 10, 30, tzinfo=UTC)


def _item(label: str, *, received: bool, required: bool = True):
    return SimpleNamespace(label=label, received=received, required=required)


def _document(name: str, *, status: DocumentStatus, extracted: bool, error: str | None = None):
    return SimpleNamespace(
        file_name=name,
        status=status,
        extracted_at=NOW if extracted else None,
        error_message=error,
    )


def _case(*, outcome: ReportOutcome, rate: int, items, documents):
    return SimpleNamespace(
        application_number="APL-DEMO-001",
        completeness_report=SimpleNamespace(
            outcome=outcome, completion_rate=rate, checked_at=NOW, items=items
        ),
        documents=documents,
    )


def test_complete_case_has_a_readable_html_and_pdf_report() -> None:
    report = build_report(
        _case(
            outcome=ReportOutcome.passed,
            rate=100,
            items=[_item("Pièce d'identité", received=True), _item("RIB", received=True)],
            documents=[_document("identite.pdf", status=DocumentStatus.validated, extracted=True)],
        ),
        use_llm=False,
    )

    assert report.status == "complet"
    assert report.missing_required_documents == []
    assert report.document_readability[0].status == "lisible"
    assert "toutes les pièces obligatoires" in report.summary
    assert "Lisibilité des documents fournis" in render_html(report)
    assert render_pdf(report).startswith(b"%PDF")


def test_incomplete_case_lists_missing_and_unreadable_documents() -> None:
    report = build_report(
        _case(
            outcome=ReportOutcome.warning,
            rate=50,
            items=[_item("Pièce d'identité", received=True), _item("RIB", received=False)],
            documents=[
                _document("rib-flou.pdf", status=DocumentStatus.rejected, extracted=False, error="Image trop floue."),
                _document("bail.pdf", status=DocumentStatus.validated, extracted=False),
            ],
        ),
        use_llm=False,
    )

    assert report.status == "incomplet"
    assert report.missing_required_documents == ["RIB"]
    assert [item.status for item in report.document_readability] == ["illisible", "a_verifier"]
    assert "RIB" in report.summary
