"""Wire schemas for the citizen document feature.

These reproduce, field for field, the contract the `MonParcours-Completude`
frontend already declares in `frontend/src/types/document.ts`. That contract is
an irregular camel/snake mix — `fileName` but `matched_checklist_document_id`,
`requiredReceivedCount` but `version_checklist` — so the aliases below are set
explicitly per field rather than by a blanket generator. Matching an existing
consumer beats imposing a tidier convention it would not understand.

FastAPI serialises `response_model` with `by_alias=True` by default, so these
aliases are what appears on the wire.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.citizen.models import DocumentCategory, DocumentStatus, ExtractionMethod


class _Base(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class DocumentClassificationSchema(_Base):
    """The classifier's verdict on one upload — all keys snake_case."""

    decision: Literal["match", "not_expected", "example_or_template", "insufficient"]
    matched_checklist_document_id: str | None = None
    confidence: float
    evidence: list[str] = Field(default_factory=list)
    reason: str


class CitizenDocumentSchema(_Base):
    """An uploaded document — camelCase keys."""

    id: str
    file_name: str = Field(serialization_alias="fileName")
    mime_type: str = Field(serialization_alias="mimeType")
    size_bytes: int = Field(serialization_alias="sizeBytes")
    uploaded_at: datetime = Field(serialization_alias="uploadedAt")
    status: DocumentStatus
    error_message: str | None = Field(default=None, serialization_alias="errorMessage")
    extraction_method: ExtractionMethod | None = Field(
        default=None, serialization_alias="extractionMethod"
    )
    extracted_text_preview: str | None = Field(
        default=None, serialization_alias="extractedTextPreview"
    )
    classification: DocumentClassificationSchema | None = None
    classification_error: str | None = Field(
        default=None, serialization_alias="classificationError"
    )


class ChecklistDocumentSchema(_Base):
    """One expected document — keys match the frontend `ChecklistDocument`."""

    id: str
    libelle: str
    categorie: DocumentCategory
    obligatoire: bool
    justification: str
    formats_acceptes: list[str]
    received: bool


class PersonalizedChecklistSchema(_Base):
    """The checklist for an application — mixed camel/snake, per the contract."""

    dossier_id: str
    documents: list[ChecklistDocumentSchema]
    version_checklist: str
    status: Literal["complete", "incomplete"]
    required_received_count: int = Field(serialization_alias="requiredReceivedCount")
    required_document_count: int = Field(serialization_alias="requiredDocumentCount")


class ApplicationStatusSchema(_Base):
    """The completeness counters alone, for a status badge — a subset of the checklist."""

    dossier_id: str
    status: Literal["complete", "incomplete"]
    required_received_count: int = Field(serialization_alias="requiredReceivedCount")
    required_document_count: int = Field(serialization_alias="requiredDocumentCount")
