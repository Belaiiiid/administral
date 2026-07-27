"""Deterministic, profile-driven checklist generation — the "B1 node", by rule.

This is what `checklist.py` names as the missing piece: instead of the fixed
seven-item `APL_CHECKLIST` handed to every applicant, this derives the pieces a
*specific* citizen must provide from their structured profile (`ProfilPartiel`).

Two hard rules from the specification shape it:

- **The LLM does not decide required documents.** This module is pure Python —
  no model call, no I/O. Given the same profile it always returns the same
  checklist, and every item states *why* it is asked (its ``justification``),
  so the result is auditable and explainable end to end.
- **The profile only informs.** The LLM/profiling agent collects and explains
  the citizen's situation; the mapping from situation → documents lives here as
  transparent rules, grounded in the real APL requirements
  (service-public.fr / CAF).

The output reuses the existing :class:`ChecklistTemplate` and the existing
``item_key`` vocabulary the classifier already targets, so uploads keep matching
without any change to classification — new keys introduced here are matched
because the upload flow now classifies against the application's own items.
"""

from __future__ import annotations

from app.features.citizen.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)
from app.modules.citizen.checklist import CHECKLIST_VERSION, ChecklistTemplate
from app.modules.citizen.models import DocumentCategory

_FORMATS = ["pdf", "jpg", "png"]

#: Bumped independently of the static list's version so a personalised checklist
#: is distinguishable from the legacy fixed one at a glance.
PERSONALISED_CHECKLIST_VERSION = f"apl-perso-{CHECKLIST_VERSION}"


def _item(
    key: str,
    libelle: str,
    categorie: DocumentCategory,
    obligatoire: bool,
    justification: str,
) -> ChecklistTemplate:
    return ChecklistTemplate(key, libelle, categorie, obligatoire, justification, list(_FORMATS))


def generate_personalized_checklist(profil: ProfilPartiel) -> tuple[ChecklistTemplate, ...]:
    """Map a citizen profile to the documents their APL dossier requires.

    Deterministic and total: a blank profile yields the universal core (identity,
    proof of address, tax notice, RIB); each answered field adds exactly the
    pieces that answer implies. Items are keyed by ``item_key`` and de-duplicated,
    so two rules asking for the same piece (e.g. a livret de famille for both
    "married" and "has children") produce one entry, not two.

    The insertion order is the display order, grouped roughly by theme:
    identity → housing → resources → family → banking.
    """
    # An insertion-ordered map keyed by item_key gives free de-duplication and a
    # stable, explainable order.
    items: dict[str, ChecklistTemplate] = {}

    def add(template: ChecklistTemplate) -> None:
        # First rule to ask for a key wins its wording; a later rule does not
        # silently downgrade a required piece to optional.
        if template.item_key not in items:
            items[template.item_key] = template

    # --- Core: required of every applicant, whatever the profile ------------
    add(_item(
        "piece_identite",
        "Pièce d'identité (CNI, passeport ou titre de séjour)",
        DocumentCategory.identite,
        True,
        "Obligatoire pour tout dossier : vérification de votre identité.",
    ))
    add(_item(
        "justificatif_domicile",
        "Justificatif de domicile de moins de 3 mois",
        DocumentCategory.logement,
        True,
        "Obligatoire pour tout dossier : confirmation de votre adresse.",
    ))

    # --- Housing (situation_logement / type_location) ----------------------
    logement = profil.situation_logement
    if logement == StatutLogement.locataire:
        if profil.type_location == TypeLocation.residence_etudiante:
            add(_item(
                "attestation_residence",
                "Attestation de résidence (CROUS, résidence étudiante, foyer)",
                DocumentCategory.logement,
                True,
                "Parce que vous résidez en foyer/résidence : attestation précisant la redevance.",
            ))
        elif profil.type_location == TypeLocation.sous_location:
            add(_item(
                "contrat_sous_location",
                "Contrat de sous-location et autorisation du bailleur",
                DocumentCategory.logement,
                True,
                "Parce que vous êtes en sous-location : justification du bail et de son autorisation.",
            ))
        else:
            add(_item(
                "contrat_location",
                "Contrat de location ou bail",
                DocumentCategory.logement,
                True,
                "Parce que vous êtes locataire : justification de votre statut et du montant du loyer.",
            ))
            add(_item(
                "attestation_loyer",
                "Attestation de loyer",
                DocumentCategory.logement,
                False,
                "Recommandée si le montant du loyer ne figure pas clairement sur le bail.",
            ))
    elif logement == StatutLogement.proprietaire:
        add(_item(
            "tableau_amortissement_pret",
            "Tableau d'amortissement du prêt immobilier",
            DocumentCategory.logement,
            True,
            "Parce que vous êtes propriétaire : l'APL accession porte sur les mensualités de prêt.",
        ))
    elif logement == StatutLogement.heberge:
        add(_item(
            "attestation_hebergement",
            "Attestation d'hébergement",
            DocumentCategory.logement,
            True,
            "Parce que vous êtes hébergé : attestation établie par la personne qui vous héberge.",
        ))

    # --- Resources (statut_professionnel) ----------------------------------
    statut = profil.statut_professionnel
    if statut == StatutProfessionnel.salarie:
        add(_item(
            "bulletins_salaire_3_derniers_mois",
            "3 derniers bulletins de salaire",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes salarié : justification de vos revenus des 3 derniers mois.",
        ))
    elif statut == StatutProfessionnel.apprenti_alternant:
        add(_item(
            "contrat_apprentissage",
            "Contrat d'apprentissage ou d'alternance",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes apprenti/alternant : justification de votre contrat.",
        ))
        add(_item(
            "bulletins_salaire_3_derniers_mois",
            "3 derniers bulletins de salaire",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes apprenti/alternant : justification de vos revenus récents.",
        ))
    elif statut == StatutProfessionnel.etudiant:
        add(_item(
            "certificat_scolarite",
            "Certificat de scolarité ou carte étudiante",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes étudiant : justification de votre inscription dans l'établissement.",
        ))
        if profil.est_boursier:
            add(_item(
                "notification_bourse",
                "Notification d'attribution de bourse (CROUS)",
                DocumentCategory.ressources,
                True,
                "Parce que vous êtes boursier : justification du montant de votre bourse.",
            ))
    elif statut == StatutProfessionnel.demandeur_emploi:
        add(_item(
            "attestation_france_travail",
            "Attestation d'inscription à France Travail",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes demandeur d'emploi : justification de votre situation.",
        ))
        if profil.percoit_are:
            add(_item(
                "justificatif_are",
                "Justificatif d'allocation chômage (ARE)",
                DocumentCategory.ressources,
                True,
                "Parce que vous percevez l'ARE : justification du montant de vos allocations.",
            ))
    elif statut == StatutProfessionnel.independant:
        add(_item(
            "justificatif_revenus_independant",
            "Justificatif de revenus d'indépendant (dernier bilan ou avis SITE)",
            DocumentCategory.ressources,
            True,
            "Parce que vous êtes indépendant : justification de vos revenus d'activité.",
        ))

    # Tax notice: always required for the annual income check.
    add(_item(
        "avis_imposition",
        "Avis d'imposition ou de non-imposition",
        DocumentCategory.ressources,
        True,
        "Obligatoire pour tout dossier : vérification de vos revenus annuels.",
    ))

    # --- Family (statut_marital / children / spouse income) ----------------
    needs_livret = profil.a_des_enfants_a_charge or profil.statut_marital in (
        StatutMarital.marie,
        StatutMarital.pacse,
    )
    if needs_livret:
        add(_item(
            "livret_famille",
            "Livret de famille",
            DocumentCategory.famille,
            True,
            "Parce que votre foyer comprend un conjoint ou des enfants à charge : "
            "justification de la composition familiale.",
        ))
    if profil.a_des_enfants_a_charge and profil.percoit_pension_alimentaire:
        add(_item(
            "justificatif_pension_alimentaire",
            "Justificatif de pension alimentaire",
            DocumentCategory.famille,
            True,
            "Parce que vous percevez une pension alimentaire : elle entre dans le calcul des ressources.",
        ))
    if profil.statut_professionnel_conjoint is not None:
        add(_item(
            "justificatif_revenus_conjoint",
            "Justificatif des revenus de votre conjoint",
            DocumentCategory.ressources,
            True,
            "Parce que vous vivez en couple : les revenus de votre conjoint entrent dans le calcul.",
        ))

    # --- Banking: required of every applicant ------------------------------
    add(_item(
        "releve_identite_bancaire",
        "Relevé d'identité bancaire (RIB)",
        DocumentCategory.autre,
        True,
        "Obligatoire pour tout dossier : versement de l'aide sur votre compte.",
    ))

    return tuple(items.values())
