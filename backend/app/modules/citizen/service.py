"""Citizen document business logic.

The upload flow is the substance of this module, and its order is deliberate:

    store bytes → extract text → classify against checklist
                → record → if matched, flip the checklist item
                → recompute application completeness

Each step degrades rather than aborts: a file whose text cannot be read is still
stored and recorded, classified as `insufficient` with the reason shown. A
citizen never loses an upload because a later stage was unavailable.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.config import settings
from app.modules.citizen import repository, storage
from app.modules.citizen.checklist import APL_CHECKLIST
from app.modules.citizen.classification import classify_document
from app.modules.citizen.extraction import extract_text
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ApplicationStatus,
    DocumentStatus,
)
from app.modules.citizen.schemas import (
    ApplicationStatusSchema,
    ChecklistDocumentSchema,
    CitizenDocumentSchema,
    DocumentClassificationSchema,
    PersonalizedChecklistSchema,
)

_ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}


def _ensure_application(db: Session, application_id: str) -> Application:
    application = repository.get_application(db, application_id)
    if application is None:
        # Auto-create on first touch: the frontend addresses a dossier by id
        # before any explicit "create application" step exists. Creating it here
        # keeps the demo working without inventing a citizen or a fake account.
        application = repository.create_application(db, application_id)
    return application


def _to_document_schema(document: ApplicationDocument) -> CitizenDocumentSchema:
    classification = (
        DocumentClassificationSchema.model_validate(document.classification)
        if document.classification
        else None
    )
    return CitizenDocumentSchema(
        id=document.id,
        file_name=document.file_name,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        uploaded_at=document.uploaded_at,
        status=document.status,
        error_message=document.error_message,
        extraction_method=document.extraction_method,
        extracted_text_preview=document.extracted_text_preview,
        classification=classification,
        classification_error=document.classification_error,
    )


def list_documents(db: Session, application_id: str) -> list[CitizenDocumentSchema]:
    _ensure_application(db, application_id)
    return [_to_document_schema(d) for d in repository.list_documents(db, application_id)]


def upload_document(
    db: Session,
    application_id: str,
    *,
    file_name: str,
    mime_type: str,
    data: bytes,
) -> CitizenDocumentSchema:
    """Store, analyse and record one uploaded file."""
    if mime_type not in _ALLOWED_MIME:
        raise ValidationError(
            f"Type de fichier non accepté : {mime_type}. Formats acceptés : PDF, JPG, PNG."
        )
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("Fichier trop volumineux (maximum 10 Mo).")
    if not data:
        raise ValidationError("Fichier vide.")

    application = _ensure_application(db, application_id)

    stored_path = storage.store(data, file_name)
    extraction = extract_text(data, mime_type)
    classification = classify_document(extraction.text, list(APL_CHECKLIST))

    document = ApplicationDocument(
        application_id=application.id,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=len(data),
        stored_path=stored_path,
        uploaded_at=datetime.now(UTC),
        # The document is stored and recorded whatever the analysis found — a
        # failed classification is not a failed upload.
        status=DocumentStatus.validated,
        extraction_method=extraction.method,
        extracted_text_preview=extraction.preview,
        classification={
            "decision": classification.decision,
            "matched_checklist_document_id": classification.matched_checklist_document_id,
            "confidence": classification.confidence,
            "evidence": classification.evidence,
            "reason": classification.reason,
        },
        classification_error=classification.error,
        matched_checklist_item_id=classification.matched_checklist_document_id,
    )
    repository.add_document(db, document)

    # A confident match flips the checklist item; a guess does not. The 0.5 floor
    # keeps a low-confidence "match" from marking a required piece received on
    # thin evidence — the safe direction for completeness.
    if (
        classification.decision == "match"
        and classification.matched_checklist_document_id
        and classification.confidence >= 0.5
    ):
        repository.mark_checklist_received(
            db, application.id, classification.matched_checklist_document_id
        )

    _recompute_status(db, application.id)
    return _to_document_schema(document)


def remove_document(db: Session, document_id: str) -> None:
    document = repository.get_document(db, document_id)
    if document is None:
        raise NotFoundError(f"Aucun document ne correspond à l’identifiant « {document_id} ».")

    storage.delete(document.stored_path)
    application_id = document.application_id
    repository.delete_document(db, document)
    _recompute_status(db, application_id)


def get_classification(db: Session, document_id: str) -> DocumentClassificationSchema:
    document = repository.get_document(db, document_id)
    if document is None or document.classification is None:
        raise NotFoundError("Aucune classification disponible pour ce document.")
    return DocumentClassificationSchema.model_validate(document.classification)


def _recompute_status(db: Session, application_id: str) -> None:
    """A dossier is complete when every *required* checklist item is received."""
    application = repository.get_application(db, application_id)
    if application is None:
        return

    required = [item for item in application.checklist_items if item.obligatoire]
    complete = bool(required) and all(item.received for item in required)

    repository.set_application_status(
        db,
        application,
        ApplicationStatus.complete if complete else ApplicationStatus.incomplete,
    )


def get_checklist(db: Session, application_id: str) -> PersonalizedChecklistSchema:
    application = _ensure_application(db, application_id)

    required = [i for i in application.checklist_items if i.obligatoire]
    required_received = [i for i in required if i.received]

    return PersonalizedChecklistSchema(
        dossier_id=application.id,
        documents=[
            ChecklistDocumentSchema(
                id=item.item_key,
                libelle=item.libelle,
                categorie=item.categorie,
                obligatoire=item.obligatoire,
                justification=item.justification,
                formats_acceptes=item.formats_acceptes,
                received=item.received,
            )
            for item in application.checklist_items
        ],
        version_checklist=application.checklist_version,
        status="complete" if application.status == ApplicationStatus.complete else "incomplete",
        required_received_count=len(required_received),
        required_document_count=len(required),
    )


def get_status(db: Session, application_id: str) -> ApplicationStatusSchema:
    checklist = get_checklist(db, application_id)
    return ApplicationStatusSchema(
        dossier_id=checklist.dossier_id,
        status=checklist.status,
        required_received_count=checklist.required_received_count,
        required_document_count=checklist.required_document_count,
    )
