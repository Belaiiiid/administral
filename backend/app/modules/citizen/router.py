"""HTTP layer for the citizen document feature.

Paths match, exactly, what the `MonParcours-Completude` `documentService` calls:
`/documents`, `/applications/{id}/checklist`, and so on. They are mounted under
`/api` in `main.py`, so `apiClient.get('/documents')` reaches `/api/documents`.

The application id the frontend uses (`TEST-DOSSIER-0001`) is a query/path value,
not a body field — an application is created on first reference, so the demo
works without an explicit "start application" step.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.citizen import service, submission
from app.modules.citizen.schemas import (
    ApplicationStatusSchema,
    CitizenDocumentSchema,
    DocumentClassificationSchema,
    PersonalizedChecklistSchema,
)
from app.modules.citizen.submission import (
    DossierReviewResponse,
    SubmitApplicationRequest,
    SubmitApplicationResponse,
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
    "/documents/{document_id}/download",
    summary="Télécharger / prévisualiser un document",
    description=(
        "Renvoie le fichier stocké (inline) pour prévisualisation dans le "
        "navigateur. Le nom sur disque est un UUID côté serveur — jamais une "
        "entrée client — donc aucun risque de traversée de chemin."
    ),
)
def download_document(document_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stored_path, mime_type, file_name = service.get_document_file(db, document_id)
    return FileResponse(
        stored_path,
        media_type=mime_type,
        # `inline` so PDFs/images open in a browser tab instead of downloading.
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


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


@router.post(
    "/applications/{application_id}/submit",
    response_model=SubmitApplicationResponse,
    status_code=201,
    summary="Soumettre le dossier à l’administration",
    description=(
        "Transforme le dossier citoyen (Application + documents + checklist) en "
        "un dossier agent (Case) prêt à être instruit. C’est le pont citoyen → "
        "agent : après soumission, le dossier apparaît dans la file de l’agent. "
        "Idempotent — resoumettre renvoie le même dossier."
    ),
)
def submit_application(
    application_id: str,
    payload: SubmitApplicationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmitApplicationResponse:
    return submission.submit_application(
        db, application_id, payload, current_user, background_tasks=background_tasks
    )


@router.get(
    "/applications/{application_id}/review",
    response_model=DossierReviewResponse,
    summary="Statut d’instruction du dossier soumis (vue citoyen)",
    description=(
        "Où en est le dossier côté agent : non soumis, soumis et en cours "
        "d’instruction, ou décidé (validé / rejeté) avec l’explication. Ferme "
        "la boucle citoyen → agent → statut du point de vue du citoyen."
    ),
)
def get_dossier_review(
    application_id: str, db: Session = Depends(get_db)
) -> DossierReviewResponse:
    return submission.get_dossier_review(db, application_id)
