"""Database access for the citizen document feature.

The only layer that writes SQL. Everything above receives ORM objects.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.citizen.checklist import APL_CHECKLIST, CHECKLIST_VERSION
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ChecklistItem,
    ApplicationStatus,
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


def create_application(db: Session, application_id: str | None = None) -> Application:
    """Create an application and populate its checklist from the standard set.

    The checklist is written as rows now, not derived on read, so an item's
    `received` flag is durable state the classifier flips — not a value
    recomputed on every request.
    """
    application = Application(
        status=ApplicationStatus.incomplete,
        checklist_version=CHECKLIST_VERSION,
    )
    if application_id is not None:
        application.id = application_id

    application.checklist_items = [
        ChecklistItem(
            item_key=t.item_key,
            libelle=t.libelle,
            categorie=t.categorie,
            obligatoire=t.obligatoire,
            justification=t.justification,
            formats_acceptes=list(t.formats_acceptes),
            received=False,
            position=index,
        )
        for index, t in enumerate(APL_CHECKLIST)
    ]

    db.add(application)
    db.commit()
    db.refresh(application)
    return application


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


def set_application_status(db: Session, application: Application, status: ApplicationStatus) -> None:
    if application.status != status:
        application.status = status
        db.add(application)
        db.commit()
