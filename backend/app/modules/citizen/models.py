"""SQLAlchemy entities for the citizen document pipeline.

This is the *pre-Case* side of the platform. The domain model puts it plainly:
the Citizen Portal owns an application while it is being built; the Agent Portal
consumes it once processed. So these tables are upstream of `cases` — an
`Application` is what a citizen assembles, a `Case` is what the pipeline emits
from it. They are related concepts, deliberately not the same table.

    Application ──< ApplicationDocument   (the files a citizen uploads)
        └────────< ChecklistItem          (what the dossier still needs)

`Citizen` is reused from the agent module rather than redefined — one applicant,
one row, shared by both sides.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


def _uuid() -> str:
    return str(uuid.uuid4())


class ApplicationStatus(str, enum.Enum):
    """Completeness state of the dossier, driven by its checklist."""

    incomplete = "incomplete"
    complete = "complete"


class DocumentStatus(str, enum.Enum):
    uploading = "uploading"
    analysing = "analysing"
    validated = "validated"
    rejected = "rejected"


class ExtractionMethod(str, enum.Enum):
    """How text was pulled from an upload — for display and auditing."""

    native_pdf = "native_pdf"
    mistral_ocr = "mistral_ocr"


class DocumentCategory(str, enum.Enum):
    identite = "identite"
    ressources = "ressources"
    logement = "logement"
    famille = "famille"
    autre = "autre"


class Application(TimestampMixin, Base):
    """A dossier a citizen is assembling, before it becomes a Case."""

    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)

    # Nullable until auth exists and applications are tied to a real account.
    # A FK, not a copy, because unlike a Case snapshot this is live and editable.
    citizen_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("citizens.id", ondelete="SET NULL"), nullable=True
    )

    service_id: Mapped[str] = mapped_column(String(64), nullable=False, default="caf")
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus, name="application_status"),
        nullable=False,
        default=ApplicationStatus.incomplete,
    )
    checklist_version: Mapped[str] = mapped_column(String(32), nullable=False, default="apl-v1")

    documents: Mapped[list[ApplicationDocument]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    checklist_items: Mapped[list[ChecklistItem]] = relationship(
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="ChecklistItem.position",
    )


class ApplicationDocument(TimestampMixin, Base):
    """One uploaded file, its extracted text, and how it was classified."""

    __tablename__ = "application_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application: Mapped[Application] = relationship(back_populates="documents")

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Path on the storage backend. Never served to the client; only metadata is.
    stored_path: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus, name="app_document_status"), nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    extraction_method: Mapped[ExtractionMethod | None] = mapped_column(
        SAEnum(ExtractionMethod, name="extraction_method"), nullable=True
    )
    #: A capped preview of the extracted text, shown in the UI. Not the full body.
    extracted_text_preview: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: The classifier's verdict, stored whole. JSON rather than columns because
    #: it is an opaque model output the UI renders as a block, never queried by
    #: field — the queryable fact (which checklist item it satisfied) is lifted
    #: out into `matched_checklist_item_id` below.
    classification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    classification_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_checklist_item_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ChecklistItem(Base):
    """One expected document for an application.

    Generated when the application is created (see `checklist.py`) and flipped to
    `received` when a document is classified as satisfying it. Per-application
    rather than global so it can become genuinely personalised — driven by the
    citizen's profile — without any schema change.
    """

    __tablename__ = "checklist_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application: Mapped[Application] = relationship(back_populates="checklist_items")

    #: Stable key the classifier targets, e.g. `id_card`. Unique per application.
    item_key: Mapped[str] = mapped_column(String(64), nullable=False)
    libelle: Mapped[str] = mapped_column(String(255), nullable=False)
    categorie: Mapped[DocumentCategory] = mapped_column(
        SAEnum(DocumentCategory, name="document_category"), nullable=False
    )
    obligatoire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    formats_acceptes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    received: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Order in the checklist, so the UI lists items deterministically.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
