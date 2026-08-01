"""Database access for the citizen document feature.

The only layer that writes SQL. Everything above receives ORM objects.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.citizen.checklist import CHECKLIST_VERSION
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ApplicationStatus,
    ChecklistItem,
)


def get_application(db: Session, application_id: str) -> Application | None:
    return db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(
            selectinload(Application.documents),
            selectinload(Application.checklist_items),
        )
    ).scalar_one_or_none()


def create_application(
    db: Session, application_id: str | None = None, *, citizen_id: str | None = None
) -> Application:
    """Create an *empty* application — its checklist is generated, not fixed.

    The checklist is no longer populated from the static ``APL_CHECKLIST`` here:
    that was the second, duplicate generation path. Every dossier now gets its
    checklist from the one deterministic, profile-driven generator
    (``dossier.sync_checklist`` → ``checklist_rules``), whether it belongs to a
    citizen (their profile) or is the anonymous demo dossier (the universal
    core). This function only creates the row; the caller syncs the checklist.
    """
    application = Application(
        status=ApplicationStatus.incomplete,
        checklist_version=CHECKLIST_VERSION,
        citizen_id=citizen_id,
    )
    if application_id is not None:
        application.id = application_id

    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def get_application_by_citizen(db: Session, citizen_id: str) -> Application | None:
    """The application belonging to one citizen, if any.

    The personalised dossier is per-citizen: it is found by the ``citizen_id``
    foreign key, not by the demo id the legacy upload page addresses. One
    citizen has at most one live application here (the newest wins, defensively).
    """
    return db.execute(
        select(Application)
        .where(Application.citizen_id == citizen_id)
        .order_by(Application.created_at.desc())
        .options(
            selectinload(Application.documents),
            selectinload(Application.checklist_items),
        )
    ).scalar_one_or_none()


def list_documents(db: Session, application_id: str) -> list[ApplicationDocument]:
    return list(
        db.execute(
            select(ApplicationDocument)
            .where(ApplicationDocument.application_id == application_id)
            .order_by(ApplicationDocument.uploaded_at.asc())
        ).scalars()
    )


def get_document(db: Session, document_id: str) -> ApplicationDocument | None:
    return db.get(ApplicationDocument, document_id)


def find_document_by_hash(
    db: Session, application_id: str, content_hash: str
) -> ApplicationDocument | None:
    """An existing document on this application with identical content, if any."""
    return db.execute(
        select(ApplicationDocument).where(
            ApplicationDocument.application_id == application_id,
            ApplicationDocument.content_hash == content_hash,
        )
    ).scalar_one_or_none()


def add_document(db: Session, document: ApplicationDocument) -> ApplicationDocument:
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def delete_document(db: Session, document: ApplicationDocument) -> None:
    db.delete(document)
    db.commit()


def mark_checklist_received(db: Session, application_id: str, item_key: str) -> None:
    """Flip one checklist item to received."""
    item = db.execute(
        select(ChecklistItem).where(
            ChecklistItem.application_id == application_id,
            ChecklistItem.item_key == item_key,
        )
    ).scalar_one_or_none()

    if item is not None and not item.received:
        item.received = True
        db.add(item)
        db.commit()


def recompute_checklist_item_received(db: Session, application_id: str, item_key: str) -> None:
    """Re-derive one checklist item's `received` flag from the documents still on file.

    Called after a document is deleted: `received` is otherwise a one-way flag
    (see `mark_checklist_received`), so a citizen who uploaded, got matched, then
    removed that same document would stay stuck on *validated* forever — the
    "décocher" action would be a no-op. Re-scanning the remaining documents for
    this item's key, under the same confidence floor the original match used,
    is what lets the item actually fall back to *missing*/*uploaded* when its
    only qualifying document is gone.
    """
    item = db.execute(
        select(ChecklistItem).where(
            ChecklistItem.application_id == application_id,
            ChecklistItem.item_key == item_key,
        )
    ).scalar_one_or_none()
    if item is None:
        return

    remaining = db.execute(
        select(ApplicationDocument).where(
            ApplicationDocument.application_id == application_id,
            ApplicationDocument.matched_checklist_item_id == item_key,
        )
    ).scalars().all()

    still_satisfied = any(
        (doc.classification or {}).get("decision") == "match"
        and (doc.classification or {}).get("confidence", 0) >= 0.5
        for doc in remaining
    )

    if item.received != still_satisfied:
        item.received = still_satisfied
        db.add(item)
        db.commit()


def set_application_status(db: Session, application: Application, status: ApplicationStatus) -> None:
    if application.status != status:
        application.status = status
        db.add(application)
        db.commit()
