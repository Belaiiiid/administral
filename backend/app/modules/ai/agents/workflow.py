"""LangGraph workflow for automated document verification (completeness and coherence loops)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, TypedDict

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from langgraph.graph import StateGraph, END

from app.modules.agent.models import (
    Case,
    CaseDocument,
    CaseStatus,
    CompletenessReport,
    CompletenessItem,
    ReportOutcome,
    DocumentStatus,
)
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ChecklistItem,
)
from app.modules.ai.coherence.service import generer_et_persister_rapport

MAP_CHECKLIST_TO_REQUIREMENT = {
    "piece_identite": "id_card",
    "justificatif_domicile": "proof_of_address",
    "contrat_location": "lease",
    "avis_imposition": "income_tax_notice",
    "releve_identite_bancaire": "rib",
}

MAP_REQUIREMENT_TO_CHECKLIST = {v: k for k, v in MAP_CHECKLIST_TO_REQUIREMENT.items()}


class PipelineState(TypedDict):
    db: Session
    application_id: str
    is_complete: bool
    is_coherent: bool


def completeness_check(state: PipelineState) -> dict:
    db = state["db"]
    app_id = state["application_id"]

    # 1. Sync Application documents to Case Documents if a Case exists
    case = db.execute(
        select(Case).where(or_(Case.id == app_id, Case.application_number == app_id))
    ).scalar_one_or_none()

    if not case:
        return {"is_complete": False, "is_coherent": False}

    application = db.execute(
        select(Application).where(Application.id == app_id)
    ).scalar_one_or_none()

    if application:
        # Sync each validated application document to the case documents
        for app_doc in application.documents:
            if app_doc.status != DocumentStatus.validated or not app_doc.matched_checklist_item_id:
                continue

            requirement_id = MAP_CHECKLIST_TO_REQUIREMENT.get(
                app_doc.matched_checklist_item_id, app_doc.matched_checklist_item_id
            )

            # Find matching CaseDocument
            case_doc = next(
                (d for d in case.documents if d.requirement_id == requirement_id),
                None,
            )

            if case_doc:
                # Update with the new file details
                case_doc.file_name = app_doc.file_name
                case_doc.mime_type = app_doc.mime_type
                case_doc.size_bytes = app_doc.size_bytes
                case_doc.uploaded_at = app_doc.uploaded_at
                case_doc.status = DocumentStatus.validated
                case_doc.error_message = None
                case_doc.extracted_at = datetime.now(timezone.utc)
            else:
                # Get the label from the checklist
                chk_item = next(
                    (i for i in application.checklist_items if i.item_key == app_doc.matched_checklist_item_id),
                    None,
                )
                label = chk_item.libelle if chk_item else app_doc.file_name

                new_case_doc = CaseDocument(
                    case_id=case.id,
                    requirement_id=requirement_id,
                    requirement_label=label,
                    file_name=app_doc.file_name,
                    mime_type=app_doc.mime_type,
                    size_bytes=app_doc.size_bytes,
                    uploaded_at=app_doc.uploaded_at,
                    status=DocumentStatus.validated,
                    extracted_at=datetime.now(timezone.utc),
                )
                case.documents.append(new_case_doc)

        db.flush()

    # 2. Update the completeness report
    report = case.completeness_report
    if not report:
        report = CompletenessReport(
            case_id=case.id,
            outcome=ReportOutcome.failed,
            checked_at=datetime.now(timezone.utc),
            completion_rate=0,
            items=[],
        )
        case.completeness_report = report
        db.add(report)
        db.flush()

    # Sync CompletenessItems from APL_CHECKLIST/Application ChecklistItems
    checklist_items = application.checklist_items if application else []
    
    # Pre-populate map of existing items
    existing_items = {item.item_key: item for item in report.items}

    for item in checklist_items:
        req_id = MAP_CHECKLIST_TO_REQUIREMENT.get(item.item_key, item.item_key)
        
        # Check if case has a validated document for this requirement
        received = any(
            d.requirement_id == req_id and d.status == DocumentStatus.validated
            for d in case.documents
        )

        completeness_item = existing_items.get(req_id)
        if completeness_item:
            completeness_item.received = received
            completeness_item.required = item.obligatoire
        else:
            new_item = CompletenessItem(
                report_id=report.id,
                item_key=req_id,
                label=item.libelle,
                received=received,
                required=item.obligatoire,
            )
            report.items.append(new_item)

    db.flush()

    # Recalculate completion rate
    required_items = [i for i in report.items if i.required]
    received_required = [i for i in required_items if i.received]
    rate = int((len(received_required) / len(required_items)) * 100) if required_items else 100

    report.completion_rate = rate
    report.checked_at = datetime.now(timezone.utc)
    report.outcome = ReportOutcome.passed if rate == 100 else ReportOutcome.failed

    db.commit()

    return {"is_complete": report.outcome == ReportOutcome.passed}


def coherence_check(state: PipelineState) -> dict:
    db = state["db"]
    app_id = state["application_id"]

    case = db.execute(
        select(Case).where(or_(Case.id == app_id, Case.application_number == app_id))
    ).scalar_one_or_none()

    if not case:
        return {"is_coherent": False}

    application = db.execute(
        select(Application).where(Application.id == app_id)
    ).scalar_one_or_none()

    # Re-run C1 analysis
    profil = {
        "nom": case.citizen.last_name,
        "prenom": case.citizen.first_name,
        "date_naissance": case.citizen.birth_date.isoformat() if case.citizen.birth_date else None,
        "situation_familiale": case.marital_status.value if case.marital_status else None,
        "enfants_a_charge": case.dependent_children,
        "adultes_rattaches": case.attached_adults,
        "statut_occupation": case.occupancy_status.value if case.occupancy_status else None,
        "surface_m2": case.living_area_sqm,
        "loyer_hors_charges": case.monthly_rent_excluding_charges,
        "adresse": case.address,
        "code_postal": case.postal_code,
        "ville": case.city,
        "revenu_annuel": case.annual_income,
    }

    documents_extraits = []
    for doc in case.documents:
        if doc.status != DocumentStatus.validated:
            continue

        # Find the text preview in application documents
        text = ""
        if application:
            app_doc = next((d for d in application.documents if d.file_name == doc.file_name), None)
            if app_doc:
                text = app_doc.extracted_text_preview or ""

        documents_extraits.append({
            "type": doc.requirement_id,
            "fichier": doc.file_name,
            "texte": text,
        })

    # Call coherence service orchestration
    coherence_report = generer_et_persister_rapport(
        db,
        case=case,
        profil=profil,
        documents=documents_extraits,
    )

    db.commit()

    return {"is_coherent": coherence_report.outcome == ReportOutcome.passed}


def status_update(state: PipelineState) -> dict:
    db = state["db"]
    app_id = state["application_id"]

    case = db.execute(
        select(Case).where(or_(Case.id == app_id, Case.application_number == app_id))
    ).scalar_one_or_none()

    if not case:
        return {}

    if not state.get("is_complete", False):
        case.status = CaseStatus.awaiting_documents
    elif not state.get("is_coherent", False):
        case.status = CaseStatus.under_review
    else:
        case.status = CaseStatus.ready_for_decision

    db.commit()
    return {}


def route_after_completeness(state: PipelineState) -> str:
    if state.get("is_complete", False):
        return "coherence_check"
    return "status_update"


# Build the workflow graph
workflow = StateGraph(PipelineState)

# Add nodes
workflow.add_node("completeness_check", completeness_check)
workflow.add_node("coherence_check", coherence_check)
workflow.add_node("status_update", status_update)

# Add entry point
workflow.set_entry_point("completeness_check")

# Add conditional edge
workflow.add_conditional_edges(
    "completeness_check",
    route_after_completeness,
    {
        "coherence_check": "coherence_check",
        "status_update": "status_update",
    },
)

# Connect nodes to end
workflow.add_edge("coherence_check", "status_update")
workflow.add_edge("status_update", END)

# Compile
app_workflow = workflow.compile()


def run_pipeline(db: Session, application_id: str) -> dict:
    """Execute the automated verification pipeline."""
    initial_state = PipelineState(
        db=db,
        application_id=application_id,
        is_complete=False,
        is_coherent=False,
    )
    return app_workflow.invoke(initial_state)
