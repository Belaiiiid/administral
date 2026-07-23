"""Development seed data.

⚠️ SYNTHETIC DATA — NOT REAL ALLOCATAIRES ⚠️

Every identity below is invented. Surnames carry a ``-Test`` suffix, e-mail
addresses use the reserved ``.test`` TLD (RFC 6761), and NIR values are
non-allocated placeholders matching no real person. Nothing here may be loaded
into an environment holding production data.

These are the same three cases as
``frontend/src/features/agent/data/fixtures.ts``, transcribed field for field on
purpose: while the frontend still renders from its mock adapter, seeding
identical data means switching a service binding from mock to HTTP changes
nothing on screen. Any difference that *does* appear is a real contract
mismatch rather than a data difference — which is what makes the swap a
meaningful test.

Idempotent: safe to re-run. Existing rows are deleted first.

Run:

    .venv/Scripts/python -m scripts.seed
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.database.session import SessionLocal
from app.modules.agent.models import (
    AnomalySeverity,
    Case,
    CaseDocument,
    CaseScoreBand,
    CaseStatus,
    Citizen,
    CoherenceAnomaly,
    CoherenceReport,
    CompletenessItem,
    CompletenessReport,
    DocumentStatus,
    MaritalStatus,
    OccupancyStatus,
    ReportOutcome,
)

CAF_SERVICE = {"service_id": "caf", "service_label": "Aide personnalisée au logement"}
SCORING_MODEL = "eligibility-scoring-v2.1"


def _dt(iso: str) -> datetime:
    """Parse an ISO-8601 instant into an aware UTC datetime."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(UTC)


def build_cases() -> list[Citizen]:
    """The three fixture citizens, each with one case."""

    # -- 2026-APL-0417 — complete, clean, ready for decision ------------------
    camille = Citizen(
        id="citizen-fixture-1",
        first_name="Camille",
        last_name="Dupont-Test",
        email="camille.dupont@example.test",
        birth_date=date(1991, 4, 12),
        social_security_number="291042500100138",
        cases=[
            Case(
                id="case-2026-0417",
                application_number="2026-APL-0417",
                status=CaseStatus.ready_for_decision,
                submitted_at=_dt("2026-07-14T09:24:00Z"),
                **CAF_SERVICE,
                score_value=87,
                score_band=CaseScoreBand.high,
                score_computed_at=_dt("2026-07-14T09:31:00Z"),
                score_model=SCORING_MODEL,
                marital_status=MaritalStatus.single,
                dependent_children=0,
                attached_adults=0,
                occupancy_status=OccupancyStatus.tenant,
                living_area_sqm=32,
                monthly_rent_excluding_charges=620,
                address="14 rue des Lilas",
                postal_code="69003",
                city="Lyon",
                annual_income=21_400,
                profile_captured_at=_dt("2026-07-14T09:24:00Z"),
                documents=[
                    CaseDocument(
                        id="doc-0417-1",
                        requirement_id="lease",
                        requirement_label="Contrat de location",
                        file_name="bail-location.pdf",
                        mime_type="application/pdf",
                        size_bytes=482_311,
                        uploaded_at=_dt("2026-07-14T09:20:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-14T09:26:00Z"),
                        # C4 forensics: nothing flagged — coherent metadata.
                        fraud_risk="FAIBLE",
                        fraud_analysis={
                            "fichier": "bail-location.pdf",
                            "typeFichier": "PDF",
                            "dateCreation": "2026-07-10T14:00:00",
                            "dateModification": "2026-07-10T14:00:00",
                            "logiciel": "Microsoft Word",
                            "auteurDeclare": "Agence Lyon Habitat",
                            "signauxAVerifier": [],
                            "analyseLlm": {
                                "niveauRisque": "FAIBLE",
                                "verdict": "Aucun signe de falsification détecté.",
                                "signauxLlm": [],
                                "analyseLlm": "Les métadonnées sont cohérentes : logiciel "
                                "bureautique standard, dates identiques et plausibles, auteur "
                                "déclaré compatible avec un contrat de location.",
                                "recommandation": "Aucune action particulière.",
                            },
                            "niveauRisque": "FAIBLE",
                            "aDesSignaux": False,
                            "erreur": None,
                        },
                    ),
                    CaseDocument(
                        id="doc-0417-2",
                        requirement_id="income_tax_notice",
                        requirement_label="Avis d’imposition",
                        file_name="avis-imposition-2025.pdf",
                        mime_type="application/pdf",
                        size_bytes=311_902,
                        uploaded_at=_dt("2026-07-14T09:21:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-14T09:27:00Z"),
                    ),
                    CaseDocument(
                        id="doc-0417-3",
                        requirement_id="id_card",
                        requirement_label="Pièce d’identité",
                        file_name="carte-identite.jpg",
                        mime_type="image/jpeg",
                        size_bytes=1_204_558,
                        uploaded_at=_dt("2026-07-14T09:22:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-14T09:28:00Z"),
                    ),
                ],
                completeness_report=CompletenessReport(
                    outcome=ReportOutcome.passed,
                    checked_at=_dt("2026-07-14T09:29:00Z"),
                    completion_rate=100,
                    items=[
                        CompletenessItem(
                            item_key="lease",
                            label="Contrat de location",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="income_tax_notice",
                            label="Avis d’imposition",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="id_card",
                            label="Pièce d’identité",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="rib",
                            label="Relevé d’identité bancaire",
                            received=True,
                            required=True,
                        ),
                    ],
                ),
                coherence_report=CoherenceReport(
                    outcome=ReportOutcome.passed,
                    checked_at=_dt("2026-07-14T09:30:00Z"),
                    anomalies=[],
                ),
            )
        ],
    )

    # -- 2026-APL-0392 — one missing document, one coherence warning ----------
    mehdi = Citizen(
        id="citizen-fixture-2",
        first_name="Mehdi",
        last_name="Baraka-Test",
        email="mehdi.baraka@example.test",
        birth_date=date(1984, 11, 30),
        social_security_number="184119300200247",
        cases=[
            Case(
                id="case-2026-0392",
                application_number="2026-APL-0392",
                status=CaseStatus.under_review,
                submitted_at=_dt("2026-07-17T14:05:00Z"),
                **CAF_SERVICE,
                score_value=54,
                score_band=CaseScoreBand.medium,
                score_computed_at=_dt("2026-07-17T14:12:00Z"),
                score_model=SCORING_MODEL,
                marital_status=MaritalStatus.married,
                dependent_children=2,
                attached_adults=0,
                occupancy_status=OccupancyStatus.tenant,
                living_area_sqm=74,
                monthly_rent_excluding_charges=1_040,
                address="8 avenue Jean Jaurès",
                postal_code="93100",
                city="Montreuil",
                annual_income=38_900,
                profile_captured_at=_dt("2026-07-17T14:05:00Z"),
                documents=[
                    CaseDocument(
                        id="doc-0392-1",
                        requirement_id="lease",
                        requirement_label="Contrat de location",
                        file_name="bail-montreuil.pdf",
                        mime_type="application/pdf",
                        size_bytes=556_120,
                        uploaded_at=_dt("2026-07-17T14:00:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-17T14:08:00Z"),
                    ),
                    CaseDocument(
                        id="doc-0392-2",
                        requirement_id="income_tax_notice",
                        requirement_label="Avis d’imposition",
                        file_name="avis-imposition-2025.pdf",
                        mime_type="application/pdf",
                        size_bytes=298_440,
                        uploaded_at=_dt("2026-07-17T14:02:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-17T14:09:00Z"),
                    ),
                ],
                completeness_report=CompletenessReport(
                    outcome=ReportOutcome.warning,
                    checked_at=_dt("2026-07-17T14:10:00Z"),
                    completion_rate=75,
                    items=[
                        CompletenessItem(
                            item_key="lease",
                            label="Contrat de location",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="income_tax_notice",
                            label="Avis d’imposition",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="id_card",
                            label="Pièce d’identité",
                            received=False,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="rib",
                            label="Relevé d’identité bancaire",
                            received=True,
                            required=True,
                        ),
                    ],
                ),
                coherence_report=CoherenceReport(
                    outcome=ReportOutcome.warning,
                    checked_at=_dt("2026-07-17T14:11:00Z"),
                    anomalies=[
                        CoherenceAnomaly(
                            severity=AnomalySeverity.warning,
                            field="Loyer mensuel hors charges",
                            declared_value="1 040 €",
                            observed_value="1 120 €",
                            message=(
                                "Le loyer déclaré diffère du montant lu sur le contrat "
                                "de location. Écart de 80 €."
                            ),
                        )
                    ],
                ),
            )
        ],
    )

    # -- 2026-APL-0355 — unreadable document, two anomalies ------------------
    lea = Citizen(
        id="citizen-fixture-3",
        first_name="Léa",
        last_name="Nguyen-Test",
        email="lea.nguyen@example.test",
        birth_date=date(1999, 2, 8),
        social_security_number="299023100300356",
        cases=[
            Case(
                id="case-2026-0355",
                application_number="2026-APL-0355",
                status=CaseStatus.awaiting_documents,
                submitted_at=_dt("2026-07-20T11:47:00Z"),
                **CAF_SERVICE,
                score_value=28,
                score_band=CaseScoreBand.low,
                score_computed_at=_dt("2026-07-20T11:52:00Z"),
                score_model=SCORING_MODEL,
                marital_status=MaritalStatus.cohabiting,
                dependent_children=0,
                attached_adults=1,
                occupancy_status=OccupancyStatus.hosted,
                living_area_sqm=18,
                monthly_rent_excluding_charges=0,
                address="3 impasse du Moulin",
                postal_code="31000",
                city="Toulouse",
                annual_income=9_600,
                profile_captured_at=_dt("2026-07-20T11:47:00Z"),
                documents=[
                    CaseDocument(
                        id="doc-0355-1",
                        requirement_id="id_card",
                        requirement_label="Pièce d’identité",
                        file_name="cni-recto-verso.pdf",
                        mime_type="application/pdf",
                        size_bytes=402_009,
                        uploaded_at=_dt("2026-07-20T11:44:00Z"),
                        status=DocumentStatus.validated,
                        extracted_at=_dt("2026-07-20T11:49:00Z"),
                        # C4 forensics flagged this identity document as likely forged.
                        fraud_risk="CRITIQUE",
                        fraud_analysis={
                            "fichier": "cni-recto-verso.pdf",
                            "typeFichier": "PDF",
                            "dateCreation": "2026-07-20T09:00:00",
                            "dateModification": "2026-06-01T08:00:00",
                            "logiciel": "GIMP 2.10 PDF Export",
                            "auteurDeclare": None,
                            "signauxAVerifier": [
                                "INCOHÉRENCE : date de modification antérieure à la date de création",
                                "SIGNAL : produit/modifié avec un logiciel d'édition graphique ou "
                                "d'édition PDF suspect (GIMP 2.10 PDF Export) plutôt qu'un outil "
                                "bureautique standard ou un scanner",
                            ],
                            "analyseLlm": {
                                "niveauRisque": "CRITIQUE",
                                "verdict": "Document très probablement falsifié : plusieurs signaux "
                                "convergent.",
                                "signauxLlm": [
                                    "Un logiciel d'édition d'images (GIMP) est incohérent avec la "
                                    "nature d'une pièce d'identité officielle",
                                    "La chronologie des dates est impossible : modification avant "
                                    "création",
                                ],
                                "analyseLlm": "La combinaison d'un producteur GIMP, d'une "
                                "chronologie de dates incohérente et de l'absence d'auteur déclaré "
                                "sur une pièce d'identité constitue un faisceau d'indices sérieux de "
                                "falsification.",
                                "recommandation": "Rejeter le document et exiger un original vérifié "
                                "en préfecture.",
                            },
                            "niveauRisque": "CRITIQUE",
                            "aDesSignaux": True,
                            "erreur": None,
                        },
                    ),
                    CaseDocument(
                        id="doc-0355-2",
                        requirement_id="proof_of_address",
                        requirement_label="Attestation d’hébergement",
                        file_name="attestation-hebergement.jpg",
                        mime_type="image/jpeg",
                        size_bytes=2_310_774,
                        uploaded_at=_dt("2026-07-20T11:46:00Z"),
                        status=DocumentStatus.rejected,
                        error_message=(
                            "Document illisible : la photo est floue et partiellement coupée."
                        ),
                    ),
                ],
                completeness_report=CompletenessReport(
                    outcome=ReportOutcome.failed,
                    checked_at=_dt("2026-07-20T11:50:00Z"),
                    completion_rate=40,
                    items=[
                        CompletenessItem(
                            item_key="id_card",
                            label="Pièce d’identité",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="proof_of_address",
                            label="Attestation d’hébergement",
                            received=False,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="income_tax_notice",
                            label="Avis d’imposition",
                            received=False,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="rib",
                            label="Relevé d’identité bancaire",
                            received=True,
                            required=True,
                        ),
                        CompletenessItem(
                            item_key="host_id",
                            label="Pièce d’identité de l’hébergeant",
                            received=False,
                            required=True,
                        ),
                    ],
                ),
                coherence_report=CoherenceReport(
                    outcome=ReportOutcome.failed,
                    checked_at=_dt("2026-07-20T11:51:00Z"),
                    anomalies=[
                        CoherenceAnomaly(
                            severity=AnomalySeverity.error,
                            field="Adresse de résidence",
                            declared_value="3 impasse du Moulin, 31000 Toulouse",
                            observed_value="Document illisible",
                            message=(
                                "L’adresse déclarée n’a pas pu être confirmée : "
                                "l’attestation d’hébergement est inexploitable."
                            ),
                        ),
                        CoherenceAnomaly(
                            severity=AnomalySeverity.warning,
                            field="Revenu annuel",
                            declared_value="9 600 €",
                            observed_value="Non vérifié",
                            message=(
                                "Aucun avis d’imposition fourni : le revenu déclaré "
                                "reste non corroboré."
                            ),
                        ),
                    ],
                ),
            )
        ],
    )

    return [camille, mehdi, lea]


def main() -> None:
    db = SessionLocal()

    try:
        # Cases first: deleting one cascades to its documents, reports and
        # decision. Only then the citizens — the case→citizen FK is RESTRICT
        # (a case must always have an applicant), so a citizen cannot be
        # removed while any case still references them.
        for case in db.query(Case).all():
            db.delete(case)
        db.commit()

        for citizen in db.query(Citizen).all():
            db.delete(citizen)
        db.commit()

        db.add_all(build_cases())
        db.commit()

        citizens = db.query(Citizen).count()
        cases = db.query(Case).count()
        print(f"Seed terminé : {citizens} citoyen(s), {cases} dossier(s).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
