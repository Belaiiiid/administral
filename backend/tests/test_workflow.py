"""Tests for the LangGraph automated document verification loop (C7)."""

from __future__ import annotations

from datetime import date, datetime, timezone
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"

from app.database.models import Base
from app.modules.agent.models import (
    Case,
    CaseDocument,
    CaseStatus,
    CompletenessReport,
    CompletenessItem,
    ReportOutcome,
    DocumentStatus,
    Citizen,
    MaritalStatus,
    OccupancyStatus,
)
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ChecklistItem,
    ApplicationStatus,
    DocumentCategory,
)
from app.modules.ai.agents.workflow import run_pipeline


@pytest.fixture
def db_session():
    """Create a clean, in-memory SQLite database session for each test."""
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_workflow_incomplete_case(db_session):
    """If the case remains incomplete, the workflow does not run coherence checks and sets status to awaiting_documents."""
    # 1. Setup citizen, application and case
    citizen = Citizen(
        id="cit-1",
        first_name="Marie",
        last_name="Dupont",
        email="marie@example.test",
        birth_date=date(1995, 1, 1),
        social_security_number="123456789",
    )
    db_session.add(citizen)

    application = Application(
        id="TEST-APP-01",
        citizen_id="cit-1",
        status=ApplicationStatus.incomplete,
        checklist_items=[
            ChecklistItem(
                item_key="piece_identite",
                libelle="Pièce d'identité",
                categorie=DocumentCategory.identite,
                obligatoire=True,
                justification="ID",
                received=False,
                position=0,
            ),
            ChecklistItem(
                item_key="contrat_location",
                libelle="Contrat de location",
                categorie=DocumentCategory.logement,
                obligatoire=True,
                justification="Bail",
                received=False,
                position=1,
            ),
        ],
    )
    db_session.add(application)

    case = Case(
        id="TEST-APP-01",
        application_number="TEST-APP-01",
        status=CaseStatus.awaiting_documents,
        submitted_at=datetime.now(timezone.utc),
        citizen_id="cit-1",
        service_id="caf",
        service_label="APL",
        marital_status=MaritalStatus.single,
        dependent_children=0,
        attached_adults=0,
        occupancy_status=OccupancyStatus.tenant,
        living_area_sqm=30,
        monthly_rent_excluding_charges=500,
        address="1 rue de la Paix",
        postal_code="75001",
        city="Paris",
        annual_income=15000,
        profile_captured_at=datetime.now(timezone.utc),
        completeness_report=CompletenessReport(
            outcome=ReportOutcome.failed,
            checked_at=datetime.now(timezone.utc),
            completion_rate=0,
            items=[
                CompletenessItem(item_key="id_card", label="Pièce d'identité", received=False, required=True),
                CompletenessItem(item_key="lease", label="Contrat de location", received=False, required=True),
            ],
        ),
    )
    db_session.add(case)
    db_session.commit()

    # 2. Simulate citizen uploading one document (Pièce d'identité)
    app_doc = ApplicationDocument(
        application_id="TEST-APP-01",
        file_name="cni.jpg",
        mime_type="image/jpeg",
        size_bytes=1024,
        stored_path="path/to/cni.jpg",
        uploaded_at=datetime.now(timezone.utc),
        status=DocumentStatus.validated,
        matched_checklist_item_id="piece_identite",
        classification={
            "decision": "match",
            "matched_checklist_document_id": "piece_identite",
            "confidence": 0.95,
        },
    )
    application.documents.append(app_doc)
    db_session.commit()

    # 3. Run the LangGraph workflow pipeline
    result = run_pipeline(db_session, "TEST-APP-01")

    # 4. Verification
    assert result["is_complete"] is False
    assert case.status == CaseStatus.awaiting_documents

    # Assert CaseDocument was synced
    case_docs = db_session.execute(select(CaseDocument).where(CaseDocument.case_id == "TEST-APP-01")).scalars().all()
    assert len(case_docs) == 1
    assert case_docs[0].requirement_id == "id_card"
    assert case_docs[0].file_name == "cni.jpg"
    assert case_docs[0].status == DocumentStatus.validated

    # Assert CompletenessReport items updated
    report_items = {item.item_key: item.received for item in case.completeness_report.items}
    assert report_items["id_card"] is True
    assert report_items["lease"] is False
    assert case.completeness_report.completion_rate == 50


def test_workflow_complete_and_coherent_case(db_session, monkeypatch):
    """If all documents are present and coherent, the workflow runs coherence check and sets status to ready_for_decision."""
    # Mock coherence analysis output to simulate a coherent dossier
    from app.modules.ai.coherence import service as coherence_svc
    from app.modules.ai.coherence.schemas import ResultatCoherence

    monkeypatch.setattr(
        coherence_svc,
        "analyser_coherence",
        lambda profil, documents: ResultatCoherence(
            coherent_global=True,
            statut_global="coherent",
            incoherences=[],
        ),
    )

    # 1. Setup citizen, application and case
    citizen = Citizen(
        id="cit-2",
        first_name="Jean",
        last_name="Martin",
        email="jean.martin@example.test",
        birth_date=date(1990, 5, 20),
        social_security_number="1900520001001",
    )
    db_session.add(citizen)

    application = Application(
        id="TEST-APP-02",
        citizen_id="cit-2",
        status=ApplicationStatus.incomplete,
        checklist_items=[
            ChecklistItem(
                item_key="piece_identite",
                libelle="Pièce d'identité",
                categorie=DocumentCategory.identite,
                obligatoire=True,
                justification="ID",
                received=False,
                position=0,
            ),
        ],
    )
    db_session.add(application)

    case = Case(
        id="TEST-APP-02",
        application_number="TEST-APP-02",
        status=CaseStatus.awaiting_documents,
        submitted_at=datetime.now(timezone.utc),
        citizen_id="cit-2",
        service_id="caf",
        service_label="APL",
        marital_status=MaritalStatus.single,
        dependent_children=0,
        attached_adults=0,
        occupancy_status=OccupancyStatus.tenant,
        living_area_sqm=30,
        monthly_rent_excluding_charges=500,
        address="1 rue de la Paix",
        postal_code="75001",
        city="Paris",
        annual_income=15000,
        profile_captured_at=datetime.now(timezone.utc),
        completeness_report=CompletenessReport(
            outcome=ReportOutcome.failed,
            checked_at=datetime.now(timezone.utc),
            completion_rate=0,
            items=[
                CompletenessItem(item_key="id_card", label="Pièce d'identité", received=False, required=True),
            ],
        ),
    )
    db_session.add(case)
    db_session.commit()

    # 2. Simulate citizen uploading the final required document
    app_doc = ApplicationDocument(
        application_id="TEST-APP-02",
        file_name="passport.pdf",
        mime_type="application/pdf",
        size_bytes=2048,
        stored_path="path/to/passport.pdf",
        uploaded_at=datetime.now(timezone.utc),
        status=DocumentStatus.validated,
        matched_checklist_item_id="piece_identite",
        classification={
            "decision": "match",
            "matched_checklist_document_id": "piece_identite",
            "confidence": 0.98,
        },
    )
    application.documents.append(app_doc)
    db_session.commit()

    # 3. Run the LangGraph workflow pipeline
    result = run_pipeline(db_session, "TEST-APP-02")

    # 4. Verification
    assert result["is_complete"] is True
    assert result["is_coherent"] is True
    assert case.status == CaseStatus.ready_for_decision
    assert case.coherence_report is not None
    assert case.coherence_report.outcome == ReportOutcome.passed
