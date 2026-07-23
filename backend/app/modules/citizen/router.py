"""HTTP layer for the citizen document feature.

Paths match, exactly, what the `MonParcours-Completude` `documentService` calls:
`/documents`, `/applications/{id}/checklist`, and so on. They are mounted under
`/api` in `main.py`, so `apiClient.get('/documents')` reaches `/api/documents`.

The application id the frontend uses (`TEST-DOSSIER-0001`) is a query/path value,
not a body field — an application is created on first reference, so the demo
works without an explicit "start application" step.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.citizen import service
from app.modules.citizen.schemas import (
    ApplicationStatusSchema,
    CitizenDocumentSchema,
    DocumentClassificationSchema,
    PersonalizedChecklistSchema,
)

router = APIRouter(tags=["citizen-documents"])

# The application a document belongs to. A query parameter with the same default
# the frontend uses, so a bare `GET /documents` / `POST /documents` resolves to
# the demo dossier without the UI having to thread an id through every call.
_DEFAULT_APPLICATION = "TEST-DOSSIER-0001"
_application_id = Query(default=_DEFAULT_APPLICATION, alias="applicationId")


@router.get("/documents", response_model=list[CitizenDocumentSchema], summary="Documents déposés")
def list_documents(
    application_id: str = _application_id,
    db: Session = Depends(get_db),
) -> list[CitizenDocumentSchema]:
    return service.list_documents(db, application_id)


@router.post(
    "/documents",
    response_model=CitizenDocumentSchema,
    status_code=201,
    summary="Téléverser un document",
    description=(
        "Stocke le fichier, en extrait le texte (PDF natif ou OCR), le classe "
        "contre la checklist du dossier, et met à jour la complétude. Une analyse "
        "en échec n’empêche pas l’enregistrement du document."
    ),
)
async def upload_document(
    file: UploadFile = File(...),
    application_id: str = _application_id,
    db: Session = Depends(get_db),
) -> CitizenDocumentSchema:
    data = await file.read()
    return service.upload_document(
        db,
        application_id,
        file_name=file.filename or "document",
        mime_type=file.content_type or "application/octet-stream",
        data=data,
    )


@router.delete("/documents/{document_id}", status_code=204, summary="Supprimer un document")
def remove_document(document_id: str, db: Session = Depends(get_db)) -> Response:
    service.remove_document(db, document_id)
    return Response(status_code=204)


@router.get(
    "/documents/{document_id}/classification",
    response_model=DocumentClassificationSchema,
    summary="Classification d’un document",
)
def get_classification(
    document_id: str, db: Session = Depends(get_db)
) -> DocumentClassificationSchema:
    return service.get_classification(db, document_id)


@router.get(
    "/applications/{application_id}/checklist",
    response_model=PersonalizedChecklistSchema,
    summary="Checklist personnalisée du dossier",
)
def get_checklist(
    application_id: str, db: Session = Depends(get_db)
) -> PersonalizedChecklistSchema:
    return service.get_checklist(db, application_id)


@router.get(
    "/applications/{application_id}/status",
    response_model=ApplicationStatusSchema,
    summary="Complétude du dossier",
)
def get_status(application_id: str, db: Session = Depends(get_db)) -> ApplicationStatusSchema:
    return service.get_status(db, application_id)
