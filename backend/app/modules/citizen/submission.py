"""Citizen → Agent bridge: submit an assembled Application as a reviewable Case.

This is the link the merge left missing. Two dossier worlds share a database but
nothing joins them: the citizen module owns an ``Application`` (uploaded
documents + checklist), the agent module owns a ``Case`` (what the pipeline emits
for review). The models say so in their own docstrings — *"an Application is what
a citizen assembles, a Case is what the pipeline emits from it"* — but no code
ever performed that emission, so an agent only ever saw seeded demo cases.

``submit_application`` performs it: it reads the citizen ``Application`` and
writes the agent ``Case`` (applicant, documents, and a completeness report
derived from the real checklist). That crossing is the whole point, so it lives
in this dedicated bridge module rather than inside either feature's service —
neither gains a hard dependency on the other's write path.

Deliberately conservative about fabrication: the completeness report is built
from real checklist state; the eligibility **score** and **coherence** report are
left unset (``None``) because they are pipeline stages that have not run — the
agent computes/records those. Nothing here invents a verdict.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from pathlib import Path

from fastapi import BackgroundTasks
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.modules.agent.models import (
    AnomalySeverity,
    Case,
    CaseDecision,
    CaseDocument,
    CaseStatus,
    Citizen,
    CoherenceAnomaly,
    CoherenceReport,
    CompletenessItem,
    CompletenessReport,
    MaritalStatus,
    OccupancyStatus,
    ReportOutcome,
)
from app.modules.agent.models import DocumentStatus as CaseDocumentStatus
from app.modules.ai.coherence.service import analyser_coherence
from app.modules.auth.models import User
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.citizen import profile as citizen_profile, repository as citizen_repo
from app.modules.citizen.models import Application
from app.modules.notifications import service as notifications_service

# Public-facing labels per administration, so the agent queue reads the service
# name the citizen chose rather than a bare id.
_SERVICE_LABELS = {
    "caf": "Aide personnalisée au logement",
    "france-travail": "France Travail",
}

# No civil-status placeholders. `birth_date` and `social_security_number` were
# filled with 1990-01-01 and a fifteen-zero NIR when the citizen had not
# declared them — values an agent reading the case could not tell apart from
# real ones. Both columns are nullable now, and undeclared reads as undeclared.


class ProfileSnapshotIn(BaseModel):
    """The household/housing snapshot frozen onto the Case at submission.

    Every field is optional with a safe default, so a submission never fails for
    a citizen who skipped the profiling assistant — the agent then sees a case
    with blank civil status rather than no case at all. The citizen frontend maps
    the profiling ``profil_partiel`` onto these fields where it has them.
    """

    model_config = ConfigDict(populate_by_name=True)

    marital_status: str = "single"
    dependent_children: int = 0
    attached_adults: int = 0
    occupancy_status: str = "tenant"
    living_area_sqm: int = 0
    monthly_rent_excluding_charges: int = 0
    address: str = ""
    postal_code: str = ""
    city: str = ""
    annual_income: int = 0
    birth_date: date | None = None
    social_security_number: str | None = None


class SubmitApplicationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    service_id: str = "caf"
    profile: ProfileSnapshotIn = Field(default_factory=ProfileSnapshotIn)


class SubmitApplicationResponse(BaseModel):
    case_id: str
    application_number: str
    status: str
    documents_transferred: int
    completion_rate: int
    coherence_score: int | None = None
    coherence_outcome: str | None = None


class DecisionView(BaseModel):
    """The agent's final decision, as the citizen sees it."""

    outcome: str
    explanation: str
    decided_by: str
    decided_at: datetime


class AnomalyView(BaseModel):
    severity: str
    field: str
    declared_value: str
    observed_value: str
    message: str


class CoherenceView(BaseModel):
    """The coherence analysis, as shown in the Citizen Portal."""

    outcome: str
    score: int | None = None
    explanation: str | None = None
    anomalies: list[AnomalyView] = Field(default_factory=list)


class DossierReviewResponse(BaseModel):
    """Where a submitted dossier stands in the agent review — the citizen's read side.

    ``submitted`` is False when the citizen has not sent the dossier yet (no case
    exists). Once submitted it carries the live case status, the coherence
    analysis, and ``decision`` (populated only after an agent has ruled) — closing
    the citizen → agent → status loop from the citizen's point of view.
    """

    submitted: bool
    application_number: str | None = None
    status: str | None = None
    submitted_at: datetime | None = None
    completion_rate: int | None = None
    coherence: CoherenceView | None = None
    decision: DecisionView | None = None


def _coerce_enum(enum_cls, value: str, default):
    try:
        return enum_cls(value)
    except ValueError:
        return default


def _find_or_create_citizen(db: Session, user: User, profile: ProfileSnapshotIn) -> Citizen:
    """One applicant, one ``citizens`` row — keyed by the account's id.

    Delegates to `citizen_profile.resolve_citizen`, which resolves on the
    ``user_id`` foreign key. Submission used to run its own e-mail match here;
    two resolvers meant a citizen who edited their address could get a second
    applicant row from whichever path ran first. There is now one rule, in one
    place, and the profile page and the submission bridge both obey it.

    Civil status is *not* invented. A citizen who skipped profiling submits with
    a null birth date and NIR, and the agent sees them as missing — which is
    true — rather than as 1990-01-01 and a fifteen-zero NIR, which is not.
    """
    citizen = citizen_profile.resolve_citizen(db, user)

    # Fill only what is still unknown: the snapshot supplies civil status the
    # profile does not have yet, and never overwrites what the citizen declared.
    if citizen.birth_date is None and profile.birth_date:
        citizen.birth_date = profile.birth_date
    if citizen.social_security_number is None and profile.social_security_number:
        citizen.social_security_number = profile.social_security_number

    db.flush()  # assign the PK so the Case FK resolves in this transaction
    return citizen


def _build_completeness_report(application: Application, now: datetime) -> CompletenessReport:
    """Derive the case completeness report from the application's real checklist."""
    items_by_key = {}
    for ci in application.checklist_items:
        if ci.item_key in items_by_key:
            items_by_key[ci.item_key].received = items_by_key[ci.item_key].received or ci.received
            continue
        items_by_key[ci.item_key] = CompletenessItem(
            item_key=ci.item_key,
            label=ci.libelle,
            received=ci.received,
            required=ci.obligatoire,
        )

    items = list(items_by_key.values())
    required_total = sum(1 for item in items if item.required)
    required_received = sum(1 for item in items if item.required and item.received)

    completion_rate = round(100 * required_received / required_total) if required_total else 100
    if required_total == 0 or required_received == required_total:
        outcome = ReportOutcome.passed
    elif required_received == 0:
        outcome = ReportOutcome.failed
    else:
        outcome = ReportOutcome.warning

    return CompletenessReport(
        outcome=outcome,
        checked_at=now,
        completion_rate=completion_rate,
        items=items,
    )


_ANOMALY_SEVERITY_FROM_STATUT = {
    "incoherent": AnomalySeverity.error,
    "a_revoir": AnomalySeverity.warning,
}


def _profil_for_coherence(profile: ProfileSnapshotIn) -> dict:
    """The declared information the coherence analyser compares against documents."""
    raw = {
        "situation_familiale": profile.marital_status,
        "statut_occupation": profile.occupancy_status,
        "loyer_mensuel_hors_charges": profile.monthly_rent_excluding_charges,
        "surface_habitable_m2": profile.living_area_sqm,
        "adresse": profile.address,
        "code_postal": profile.postal_code,
        "ville": profile.city,
        "revenu_annuel": profile.annual_income,
        "nombre_enfants_a_charge": profile.dependent_children,
    }
    return {k: v for k, v in raw.items() if v not in (None, "")}


def _documents_for_coherence(application: Application) -> list[dict]:
    return [
        {
            "fichier": d.file_name,
            "statut": d.status.value,
            "texte_extrait": d.extracted_text_preview or "",
        }
        for d in application.documents
    ]


def _declared_value_for(champ: str, profil: dict) -> str:
    lowered = (champ or "").lower()
    for key, val in profil.items():
        if key.split("_")[0] in lowered or lowered in key:
            return str(val)
    return "Information déclarée"


def _compose_explanation(
    completion_rate: int, unreadable: int, incoherences: list, score: int
) -> str:
    parts = [f"Complétude du dossier : {completion_rate} %."]
    parts.append(
        f"{unreadable} pièce(s) illisible(s) ou non exploitée(s) par l’OCR."
        if unreadable
        else "Toutes les pièces déposées sont lisibles."
    )
    if incoherences:
        raisons = " ; ".join(v.raison for v in incoherences[:3])
        parts.append(
            f"{len(incoherences)} incohérence(s) relevée(s) entre les informations "
            f"déclarées et les pièces : {raisons}."
        )
    else:
        parts.append("Aucune incohérence détectée entre les informations déclarées et les pièces.")
    parts.append(f"Score de cohérence global : {score}/100.")
    return " ".join(parts)


def _build_coherence_report(
    application: Application,
    profile: ProfileSnapshotIn,
    completion_rate: int,
    now: datetime,
) -> CoherenceReport:
    """Run the full coherence analysis and shape it into the persisted report.

    Combines a deterministic OCR/readability check with the LLM cross-document
    coherence analysis (``analyser_coherence`` — reused verbatim, and itself
    fail-safe: a Mistral outage degrades to ``a_revoir`` rather than raising, so a
    submission is never blocked by the analyser). Produces the anomalies, an
    overall 0–100 score, and a natural-language explanation shown to both portals.
    """
    anomalies: list[CoherenceAnomaly] = []

    # 1. OCR / readability quality — deterministic, from each document's state.
    unreadable = 0
    for doc in application.documents:
        rejected = doc.status.name == "rejected"
        no_text = not (doc.extracted_text_preview or "").strip()
        if rejected or no_text:
            unreadable += 1
            anomalies.append(
                CoherenceAnomaly(
                    severity=AnomalySeverity.error if rejected else AnomalySeverity.warning,
                    field="Lisibilité du document",
                    declared_value=doc.file_name,
                    observed_value="Illisible" if rejected else "Texte non exploité par l’OCR",
                    message=doc.error_message
                    or "Le contenu du document n’a pas pu être exploité par l’OCR.",
                )
            )

    # 2. Cross-document inconsistencies — LLM analysis (fail-safe).
    incoherences: list = []
    try:
        resultat = analyser_coherence(
            _profil_for_coherence(profile), _documents_for_coherence(application)
        )
        incoherences = resultat.incoherences
    except Exception:  # noqa: BLE001 — analysis must never break submission
        incoherences = []
    for v in incoherences:
        anomalies.append(
            CoherenceAnomaly(
                severity=_ANOMALY_SEVERITY_FROM_STATUT.get(v.statut, AnomalySeverity.warning),
                field=v.champ or "Cohérence",
                declared_value=_declared_value_for(v.champ, _profil_for_coherence(profile)),
                observed_value=("; ".join(v.preuves)[:255] if v.preuves else "Constaté sur les pièces"),
                message=v.raison,
            )
        )

    # 3. Overall score + outcome (worst severity wins for the outcome).
    errors = sum(1 for a in anomalies if a.severity == AnomalySeverity.error)
    warnings = sum(1 for a in anomalies if a.severity == AnomalySeverity.warning)
    score = max(0, min(100, completion_rate - 25 * errors - 10 * warnings))
    if errors:
        outcome = ReportOutcome.failed
    elif warnings:
        outcome = ReportOutcome.warning
    else:
        outcome = ReportOutcome.passed

    return CoherenceReport(
        outcome=outcome,
        checked_at=now,
        coherence_score=score,
        ai_explanation=_compose_explanation(completion_rate, unreadable, incoherences, score),
        anomalies=anomalies,
    )


def submit_application(
    db: Session,
    application_id: str,
    payload: SubmitApplicationRequest,
    user: User,
    background_tasks: BackgroundTasks | None = None,
) -> SubmitApplicationResponse:
    """Emit a reviewable agent ``Case`` from a citizen ``Application``.

    Idempotent: a second submission of the same application returns the existing
    case rather than creating a duplicate (the application number is derived from
    the application id and is unique).
    """
    application = citizen_repo.get_application(db, application_id)
    if application is None:
        raise NotFoundError(
            f"Aucun dossier ne correspond à l’identifiant « {application_id} »."
        )

    application_number = f"APL-{application_id}"[:64]

    existing_case = db.execute(
        select(Case).where(Case.application_number == application_number)
    ).scalar_one_or_none()
    if existing_case is not None:
        rate = (
            existing_case.completeness_report.completion_rate
            if existing_case.completeness_report is not None
            else 0
        )
        coh = existing_case.coherence_report
        return SubmitApplicationResponse(
            case_id=existing_case.id,
            application_number=existing_case.application_number,
            status=existing_case.status.value,
            documents_transferred=len(existing_case.documents),
            completion_rate=rate,
            coherence_score=coh.coherence_score if coh is not None else None,
            coherence_outcome=coh.outcome.value if coh is not None else None,
        )

    now = datetime.now(UTC)
    profile = payload.profile
    completeness = _build_completeness_report(application, now)
    coherence = _build_coherence_report(application, profile, completeness.completion_rate, now)
    citizen = _find_or_create_citizen(db, user, profile)

    # Map each uploaded document onto a case document, resolving which checklist
    # requirement it satisfied (by the id the classifier matched). We also keep,
    # for each new case document, the path to its stored file — the C4 fraud
    # forensics (slow: metadata + a Mistral-large verdict) run asynchronously
    # after submission, so the citizen is not made to wait.
    checklist_by_id = {ci.id: ci for ci in application.checklist_items}
    case_documents: list[CaseDocument] = []
    doc_sources: list[tuple[CaseDocument, str, str | None]] = []
    for doc in application.documents:
        matched = checklist_by_id.get(doc.matched_checklist_item_id)
        case_doc = CaseDocument(
            requirement_id=matched.item_key if matched else "autre",
            requirement_label=matched.libelle if matched else doc.file_name,
            file_name=doc.file_name,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            uploaded_at=doc.uploaded_at,
            # Both modules define the same status names; map by name.
            status=CaseDocumentStatus[doc.status.name],
            error_message=doc.error_message,
        )
        case_documents.append(case_doc)
        doc_sources.append((case_doc, doc.stored_path, doc.extracted_text_preview))

    case = Case(
        application_number=application_number,
        status=CaseStatus.submitted,
        submitted_at=now,
        citizen=citizen,
        service_id=payload.service_id,
        service_label=_SERVICE_LABELS.get(payload.service_id, payload.service_id),
        # Score + coherence are pipeline stages that have not run — left unset.
        marital_status=_coerce_enum(MaritalStatus, profile.marital_status, MaritalStatus.single),
        dependent_children=profile.dependent_children,
        attached_adults=profile.attached_adults,
        occupancy_status=_coerce_enum(
            OccupancyStatus, profile.occupancy_status, OccupancyStatus.tenant
        ),
        living_area_sqm=profile.living_area_sqm,
        monthly_rent_excluding_charges=profile.monthly_rent_excluding_charges,
        address=profile.address,
        postal_code=profile.postal_code,
        city=profile.city,
        annual_income=profile.annual_income,
        profile_captured_at=now,
        documents=case_documents,
        completeness_report=completeness,
        coherence_report=coherence,
    )

    db.add(case)
    # Flush to assign the Case PK, then write the audit event into this same
    # transaction so the trail entry and the dossier commit atomically — a
    # submitted dossier can never exist without its "dossier_submitted" trace,
    # and vice versa. Unlike the notification below, this is not best-effort.
    db.flush()
    audit_service.record(
        db,
        action=AuditAction.dossier_submitted,
        entity_type="case",
        entity_id=case.application_number,
        actor=user,
        summary=f"Dossier {case.application_number} soumis pour instruction.",
        payload={
            "case_id": case.id,
            "service_id": case.service_id,
            "documents_transferred": len(case.documents),
            "completion_rate": completeness.completion_rate,
            "coherence_score": coherence.coherence_score,
        },
    )
    db.commit()
    db.refresh(case)

    # The dossier now exists in the agent queue — tell the agents. Best-effort:
    # `emit_dossier_submitted` never raises, so a notification hiccup cannot fail
    # a submission that has already committed.
    notifications_service.emit_dossier_submitted(db, application_number=case.application_number)

    # C4 fraud forensics run AFTER the response is sent — slow (metadata + a
    # Mistral-large verdict per document) and not something to make the citizen
    # wait on. By the time the agent opens the case it is populated; if the
    # analysis is still running or fails, the documents simply carry no fraud
    # badge yet (never an error). The seed cases already carry it.
    if background_tasks is not None:
        hashes: dict[str, int] = {}
        for _case_doc, stored_path, _ocr_text in doc_sources:
            try:
                digest = hashlib.sha256(Path(stored_path).read_bytes()).hexdigest()
                hashes[digest] = hashes.get(digest, 0) + 1
            except OSError:
                continue
        specs = []
        for case_doc, stored_path, ocr_text in doc_sources:
            try:
                duplicate_count = hashes.get(hashlib.sha256(Path(stored_path).read_bytes()).hexdigest(), 1)
            except OSError:
                duplicate_count = 1
            specs.append((case_doc.id, stored_path, case_doc.file_name, ocr_text, duplicate_count))
        if specs:
            background_tasks.add_task(run_fraud_analysis, specs)

    return SubmitApplicationResponse(
        case_id=case.id,
        application_number=case.application_number,
        status=case.status.value,
        documents_transferred=len(case.documents),
        completion_rate=case.completeness_report.completion_rate,
        coherence_score=case.coherence_report.coherence_score,
        coherence_outcome=case.coherence_report.outcome.value,
    )


def run_fraud_analysis(specs: list[tuple[str, str, str, str | None, int]]) -> None:
    """Populate each case document's C4 fraud forensics, out of the request path.

    ``specs`` is ``(case_document_id, stored_file_path, file_name, ocr_text,
    duplicate_count)``. Reuses the
    existing fraud service verbatim (``analyze_document`` — deterministic metadata
    + optional Mistral verdict, itself fail-safe). Runs in its own session; a
    failure on one document never affects the others or the submission.
    """
    from app.database.session import SessionLocal
    from app.modules.ai.fraud import service as fraud_service

    db = SessionLocal()
    try:
        for case_document_id, stored_path, file_name, ocr_text, duplicate_count in specs:
            try:
                analysis = fraud_service.analyze_document(
                    stored_path,
                    display_name=file_name,
                    extracted_text=ocr_text,
                    duplicate_count=duplicate_count,
                )
                case_doc = db.get(CaseDocument, case_document_id)
                if case_doc is not None:
                    case_doc.fraud_analysis = analysis.model_dump(by_alias=True)
                    case_doc.fraud_risk = analysis.niveau_risque
                    db.commit()
            except Exception:  # noqa: BLE001 — one document must not fail the batch
                db.rollback()
    finally:
        db.close()


def get_dossier_review(db: Session, application_id: str) -> DossierReviewResponse:
    """The citizen's view of their submitted dossier: status + final decision.

    Reads the agent ``Case`` emitted by :func:`submit_application` (matched on the
    derived application number). Returns ``submitted=False`` when nothing has been
    submitted yet, so the citizen UI can show a call-to-action rather than an error.
    """
    case = db.execute(
        select(Case)
        .where(Case.application_number == f"APL-{application_id}"[:64])
        .options(
            selectinload(Case.decision),
            selectinload(Case.completeness_report),
            selectinload(Case.coherence_report).selectinload(CoherenceReport.anomalies),
        )
    ).scalar_one_or_none()

    if case is None:
        return DossierReviewResponse(submitted=False)

    decision = None
    if case.decision is not None:
        d = case.decision
        decision = DecisionView(
            outcome=d.outcome.value,
            explanation=d.explanation,
            decided_by=d.decided_by,
            decided_at=d.created_at,
        )

    coherence = None
    if case.coherence_report is not None:
        cr = case.coherence_report
        coherence = CoherenceView(
            outcome=cr.outcome.value,
            score=cr.coherence_score,
            explanation=cr.ai_explanation,
            anomalies=[
                AnomalyView(
                    severity=a.severity.value,
                    field=a.field,
                    declared_value=a.declared_value,
                    observed_value=a.observed_value,
                    message=a.message,
                )
                for a in cr.anomalies
            ],
        )

    return DossierReviewResponse(
        submitted=True,
        application_number=case.application_number,
        status=case.status.value,
        submitted_at=case.submitted_at,
        completion_rate=(
            case.completeness_report.completion_rate
            if case.completeness_report is not None
            else None
        ),
        coherence=coherence,
        decision=decision,
    )
