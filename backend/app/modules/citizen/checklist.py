"""The APL checklist.

The seven items, ids, labels and justifications are taken verbatim from the
Squad_B backend (`Backend/Squad_B/uploads/main.py`, `TEST_CHECKLIST`) so the
classifier, the checklist and the frontend all speak the same document ids. In
that codebase this is the stand-in for the B1 node, which generates a checklist
tailored to the citizen's profile with an LLM (`checklist_b1/`); until that node
is wired, this canonical list is the contract every downstream stage matches.

The ids matter: the classifier returns one of these as
`matched_checklist_document_id`, and a match flips the item to `received`. If
this list and the classifier's target ids ever diverge, matches silently stop
counting — which is exactly the bug the earlier, invented ids caused.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.citizen.models import DocumentCategory

_FORMATS = ["pdf", "jpg", "png"]


@dataclass(frozen=True)
class ChecklistTemplate:
    item_key: str
    libelle: str
    categorie: DocumentCategory
    obligatoire: bool
    justification: str
    formats_acceptes: list[str]


APL_CHECKLIST: tuple[ChecklistTemplate, ...] = (
    ChecklistTemplate(
        "piece_identite",
        "Pièce d'identité (CNI, passeport ou titre de séjour)",
        DocumentCategory.identite,
        True,
        "Vérification de votre identité.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "justificatif_domicile",
        "Justificatif de domicile de moins de 3 mois",
        DocumentCategory.logement,
        True,
        "Confirmation de votre adresse.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "contrat_location",
        "Contrat de location ou bail",
        DocumentCategory.logement,
        True,
        "Justification du statut et du loyer.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "attestation_loyer",
        "Attestation de loyer",
        DocumentCategory.logement,
        False,
        "Recommandée si le loyer n'est pas dans le bail.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "bulletins_salaire_3_derniers_mois",
        "3 derniers bulletins de salaire",
        DocumentCategory.ressources,
        True,
        "Justification des revenus salariaux.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "avis_imposition",
        "Avis d'imposition ou de non-imposition",
        DocumentCategory.ressources,
        True,
        "Vérification des revenus annuels.",
        _FORMATS,
    ),
    ChecklistTemplate(
        "releve_identite_bancaire",
        "Relevé d'identité bancaire (RIB)",
        DocumentCategory.autre,
        True,
        "Versement des aides.",
        _FORMATS,
    ),
)

#: Matches the Squad_B `version_checklist`. Bump when APL_CHECKLIST changes.
CHECKLIST_VERSION = "1.0"
