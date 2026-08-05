"""Tests for agent document consultation — the case-scoping boundary.

The endpoint behind these lets an instructing agent open the citizen's actual
file. The rule that makes that safe is that a document is resolved *through its
case*: `require_agent` says "this caller may read dossiers", it does not say
"this caller may read document X". Without the scoping, a valid agent token plus
a guessed document id would reach any piece in the database.

Built in memory: the resolution reads the aggregate and touches the filesystem,
it does not query beyond `find_case_by_id`, which is stubbed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import NotFoundError
from app.modules.agent import repository, service
from app.modules.agent.models import (
    Case,
    CaseDocument,
    DocumentStatus,
    MaritalStatus,
    OccupancyStatus,
)


def _document(document_id: str, stored_path: str | None) -> CaseDocument:
    return CaseDocument(
        id=document_id,
        requirement_id="proof_of_address",
        requirement_label="Justificatif de domicile",
        file_name="quittance.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        uploaded_at=datetime(2026, 7, 14, tzinfo=UTC),
        status=DocumentStatus.validated,
        stored_path=stored_path,
    )


def _case(documents: list[CaseDocument]) -> Case:
    return Case(
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
        documents=documents,
    )


@pytest.fixture()
def stub_case(monkeypatch):
    """Installs a case as the only one `find_case_by_id` knows about."""

    def _install(case: Case | None) -> None:
        monkeypatch.setattr(
            repository,
            "find_case_by_id",
            lambda _db, case_id: case if case is not None and case.id == case_id else None,
        )

    return _install


def test_document_of_another_case_is_not_reachable(stub_case, tmp_path) -> None:
    """A document id absent from *this* case is 404, even though it exists.

    This is the access-control guarantee. An agent is authorised for dossiers,
    not for arbitrary document ids; resolving through the case is what enforces
    it. If this test fails, a guessed id reaches another citizen's piece.
    """
    stored = tmp_path / "real.pdf"
    stored.write_bytes(b"%PDF-1.4 ...")
    stub_case(_case([_document("doc-of-this-case", str(stored))]))

    with pytest.raises(NotFoundError):
        service.get_case_document_file(None, "c1", "doc-of-another-case")


def test_unknown_case_is_not_reachable(stub_case) -> None:
    stub_case(None)

    with pytest.raises(NotFoundError):
        service.get_case_document_file(None, "does-not-exist", "doc-1")


def test_document_without_stored_path_is_reported_not_silently_empty(stub_case) -> None:
    """Cases predating the `stored_path` column say so rather than 404 blankly.

    Seeded and pre-migration cases carry the file *name* but no path. The agent
    must learn that the piece was never attached, not be shown an empty frame.
    """
    stub_case(_case([_document("doc-1", None)]))

    with pytest.raises(NotFoundError, match="n’a pas été conservé"):
        service.get_case_document_file(None, "c1", "doc-1")


def test_missing_file_on_storage_is_reported(stub_case, tmp_path) -> None:
    """A path recorded in the row but gone from disk is not served as a 200."""
    stub_case(_case([_document("doc-1", str(tmp_path / "vanished.pdf"))]))

    with pytest.raises(NotFoundError, match="introuvable sur le stockage"):
        service.get_case_document_file(None, "c1", "doc-1")


def test_resolves_path_mime_and_original_name(stub_case, tmp_path) -> None:
    """The happy path returns the stored bytes' location and the *citizen's*
    file name — the server's UUID name never reaches the agent's browser."""
    stored = tmp_path / "8f3a-uuid-on-disk.bin"
    stored.write_bytes(b"%PDF-1.4 ...")
    stub_case(_case([_document("doc-1", str(stored))]))

    path, mime_type, file_name = service.get_case_document_file(None, "c1", "doc-1")

    assert path == str(stored)
    assert mime_type == "application/pdf"
    assert file_name == "quittance.pdf"
