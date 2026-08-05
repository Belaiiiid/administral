"""Tests for citizen document consultation — the two rules that gate it.

The route lets an allocataire re-read a piece they deposited. What keeps that
narrow is checked here:

* the document is resolved *through its application*, so an id from another
  dossier is not reachable by guessing it;
* only a document the classifier **matched to a checklist line** is served — a
  file it could not place is not a piece of the dossier yet, and handing it back
  out of the API would re-expose whatever was uploaded by mistake.

Built in memory: the resolution reads one row and touches the filesystem, so
only `get_document` is stubbed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.citizen import repository, service
from app.modules.citizen.models import ApplicationDocument, DocumentStatus


def _document(
    *,
    application_id: str = "app-1",
    stored_path: str,
    matched: str | None = "proof_of_address",
) -> ApplicationDocument:
    return ApplicationDocument(
        id="doc-1",
        application_id=application_id,
        file_name="quittance.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        stored_path=stored_path,
        uploaded_at=datetime(2026, 7, 14, tzinfo=UTC),
        status=DocumentStatus.validated,
        matched_checklist_item_id=matched,
    )


@pytest.fixture()
def stub_document(monkeypatch):
    def _install(document: ApplicationDocument | None) -> None:
        monkeypatch.setattr(repository, "get_document", lambda _db, _id: document)

    return _install


def test_document_of_another_application_is_not_reachable(stub_document, tmp_path) -> None:
    """The scoping guarantee: a valid id on the wrong dossier is 404.

    Without it, any signed-in citizen reaching this route with someone else's
    document id would be served another household's justificatif.
    """
    stored = tmp_path / "real.pdf"
    stored.write_bytes(b"%PDF-1.4 ...")
    stub_document(_document(application_id="app-of-someone-else", stored_path=str(stored)))

    with pytest.raises(NotFoundError, match="n’appartient pas à ce dossier"):
        service.get_document_file(None, "app-1", "doc-1")


def test_unmatched_document_is_refused(stub_document, tmp_path) -> None:
    """A file the classifier could not place is not consultable.

    This is the rule the UI mirrors by not offering the action. It lives here
    too because hiding a button is not access control.
    """
    stored = tmp_path / "mystere.pdf"
    stored.write_bytes(b"%PDF-1.4 ...")
    stub_document(_document(stored_path=str(stored), matched=None))

    with pytest.raises(ValidationError, match="n’est pas consultable"):
        service.get_document_file(None, "app-1", "doc-1")


def test_unknown_document_is_not_reachable(stub_document) -> None:
    stub_document(None)

    with pytest.raises(NotFoundError, match="introuvable"):
        service.get_document_file(None, "app-1", "doc-1")


def test_missing_file_on_storage_is_reported(stub_document, tmp_path) -> None:
    """A path recorded in the row but gone from disk is not served as a 200."""
    stub_document(_document(stored_path=str(tmp_path / "vanished.pdf")))

    with pytest.raises(NotFoundError, match="introuvable sur le stockage"):
        service.get_document_file(None, "app-1", "doc-1")


def test_matched_document_resolves_path_mime_and_name(stub_document, tmp_path) -> None:
    """The happy path returns the citizen's own file name, not the disk UUID."""
    stored = tmp_path / "3c1f-uuid-on-disk.bin"
    stored.write_bytes(b"%PDF-1.4 ...")
    stub_document(_document(stored_path=str(stored)))

    path, mime_type, file_name = service.get_document_file(None, "app-1", "doc-1")

    assert path == str(stored)
    assert mime_type == "application/pdf"
    assert file_name == "quittance.pdf"
