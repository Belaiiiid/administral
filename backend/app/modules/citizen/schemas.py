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
from pydantic.alias_generators import to_camel

from app.modules.citizen.models import DocumentCategory, DocumentStatus, ExtractionMethod


class _Base(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class _CamelBase(BaseModel):
    """Clean camelCase wire shape for the newer personalised-dossier contract."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


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


# ---------------------------------------------------------------------------
# Personalised dossier — the profile-driven checklist (Iteration 3)
# ---------------------------------------------------------------------------


class DossierChecklistItemSchema(_CamelBase):
    """One expected document on a *personalised* checklist, with its per-item state.

    ``documentType`` is the stable ``item_key`` the classifier targets; ``reason``
    is the profile-grounded justification for why this piece is asked; ``status``
    is the three-state derived from the citizen's uploads.
    """

    document_type: str
    libelle: str
    categorie: DocumentCategory
    required: bool
    reason: str
    status: Literal["missing", "uploaded", "validated"]
    formats_acceptes: list[str]


class PersonalizedDossierSchema(_CamelBase):
    """A citizen's personalised dossier: the checklist derived from their profile."""

    application_id: str
    version_checklist: str
    #: True once the profiling has produced enough to tailor the checklist beyond
    #: the universal core — drives the "complétez votre profil" nudge in the UI.
    profile_complete: bool
    status: Literal["complete", "incomplete"]
    required_received_count: int
    required_document_count: int
    items: list[DossierChecklistItemSchema]


class EstimationAideSchema(_CamelBase):
    """A rough, explainable monthly APL estimate — see `citizen/estimation.py`."""

    montant_estime: int
    loyer_retenu: float
    charges_retenues: float
    participation_personnelle: float
    #: False when the profile does not yet have enough to attempt an estimate
    #: (housing status or rent still unknown) — distinct from a genuine 0 €.
    estimation_possible: bool
    avertissement: str
