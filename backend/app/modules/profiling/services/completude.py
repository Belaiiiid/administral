"""
A4 — evaluer_completude_profil(profil) -> bool

Seul outil du LLM de l'agent A3. Fonction PURE et déterministe : aucun appel
LLM ici (RULES.md §2.1). Détermine si le profil permet d'identifier sans
ambiguïté le cas de figure du citoyen, pour ne jamais laisser le LLM seul
décider d'arrêter l'interview.

Reflète exactement la même cascade que le prompt système (app/core/llm.py) et
le fallback déterministe : statut socio-professionnel → famille → logement.
Les cas d'exclusion (propriétaire occupant, hébergé à titre gratuit, bailleur
proche) sont gérés en amont par le harness via `knowledge.rechercher_exclusion`
et court-circuitent l'interview avant même d'appeler cette fonction — mais
elle reste testable de façon autonome sur ces profils (cf. DoD : au moins 5
profils vide/partiel/complet/ambigu/contradictoire).
"""
from __future__ import annotations

from app.modules.profiling.schemas.profil import ProfilPartiel, StatutLogement, StatutMarital, StatutProfessionnel

_EN_COUPLE = (StatutMarital.marie, StatutMarital.pacse, StatutMarital.concubinage)
_TYPE_LOCATION_CLASSIQUE = {"vide", "meublee", "chambre", "colocation"}


def _manquants_logement(profil: ProfilPartiel) -> list[str]:
    if profil.situation_logement is None:
        return ["situation_logement"]

    if profil.situation_logement != StatutLogement.locataire:
        # Propriétaire / hébergé : rien de plus à collecter côté logement
        # (le harness aura de toute façon déjà clos via une règle d'exclusion).
        return []

    manquants: list[str] = []
    if profil.type_location is None:
        return ["type_location"]
    if profil.logement_appartient_a_un_proche is None:
        manquants.append("logement_appartient_a_un_proche")

    valeur = profil.type_location.value
    if valeur in _TYPE_LOCATION_CLASSIQUE:
        if profil.loyer_mensuel is None:
            manquants.append("loyer_mensuel")
        if valeur != "colocation" and profil.logement_conventionne is None:
            manquants.append("logement_conventionne")
    elif valeur == "sous_location":
        if profil.moins_de_30_ans is None:
            manquants.append("moins_de_30_ans")
        if profil.sous_location_declaree is None:
            manquants.append("sous_location_declaree")
    elif valeur == "residence_etudiante":
        if profil.type_residence_detail is None:
            manquants.append("type_residence_detail")
        if profil.redevance_mensuelle is None:
            manquants.append("redevance_mensuelle")

    return manquants


def _manquants_famille(profil: ProfilPartiel) -> list[str]:
    manquants: list[str] = []
    if profil.statut_marital is None:
        return ["statut_marital"]

    if profil.statut_marital in _EN_COUPLE:
        if profil.statut_professionnel_conjoint is None:
            manquants.append("statut_professionnel_conjoint")
        if profil.revenus_conjoint_mensuels is None:
            manquants.append("revenus_conjoint_mensuels")

    if profil.a_des_enfants_a_charge is None:
        manquants.append("a_des_enfants_a_charge")
        return manquants

    if profil.a_des_enfants_a_charge and profil.nombre_enfants_a_charge is None:
        manquants.append("nombre_enfants_a_charge")
        return manquants

    if profil.a_des_enfants_a_charge and (profil.nombre_enfants_a_charge or 0) > 0:
        if profil.ages_enfants is None:
            manquants.append("ages_enfants")
        if profil.percoit_pension_alimentaire is None:
            manquants.append("percoit_pension_alimentaire")
        elif profil.percoit_pension_alimentaire and profil.montant_pension_alimentaire is None:
            manquants.append("montant_pension_alimentaire")

    return manquants


def _manquants_ressources(profil: ProfilPartiel) -> list[str]:
    if profil.statut_professionnel is None:
        return ["statut_professionnel"]

    manquants: list[str] = []
    statut = profil.statut_professionnel

    if statut == StatutProfessionnel.etudiant:
        if profil.est_boursier is None:
            manquants.append("est_boursier")
        elif profil.est_boursier and profil.montant_bourse is None:
            manquants.append("montant_bourse")
    elif statut in (StatutProfessionnel.salarie, StatutProfessionnel.apprenti_alternant):
        if profil.revenus_nets_mensuels is None:
            manquants.append("revenus_nets_mensuels")
        if profil.type_contrat is None:
            manquants.append("type_contrat")
    elif statut == StatutProfessionnel.demandeur_emploi:
        if profil.percoit_are is None:
            manquants.append("percoit_are")
        elif profil.percoit_are and profil.montant_are_mensuel is None:
            manquants.append("montant_are_mensuel")
    elif statut == StatutProfessionnel.independant:
        if profil.chiffre_affaires_annuel is None:
            manquants.append("chiffre_affaires_annuel")

    return manquants


def champs_manquants(profil: ProfilPartiel) -> list[str]:
    """Liste tous les champs qui bloquent encore la complétude, cascade par cascade."""
    manquants: list[str] = []
    manquants += _manquants_ressources(profil)
    manquants += _manquants_famille(profil)
    manquants += _manquants_logement(profil)
    if profil.ville is None:
        manquants.append("ville")
    return manquants


def evaluer_completude_profil(profil: ProfilPartiel) -> bool:
    return len(champs_manquants(profil)) == 0
