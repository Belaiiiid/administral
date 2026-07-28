"""
Tests unitaires — DoD A2/A3/A4 + non-régression sur la cascade métier étendue
(statut socio-professionnel → famille → logement) fournie par l'utilisateur.

Ces tests tournent SANS clé Mistral : ils vérifient la logique déterministe
(A4, harness, fallback de règles qui reflète la même cascade que le prompt).

Exécution : `cd backend && pytest -q`
"""
from __future__ import annotations

import asyncio

import pytest

from app.modules.profiling.services.completude import champs_manquants, evaluer_completude_profil
from app.modules.profiling.services.coercion import analyser_reponse
from app.modules.profiling.services.harness import LIMITE_TOURS, jouer_tour
from app.modules.profiling.services.knowledge import rechercher_exclusion
from app.modules.profiling.services.llm import prochain_champ_attendu
from app.modules.profiling.repositories.session_store import SessionStore
from app.modules.profiling.schemas.agent import ProchaineAction, TypeReponse
from app.modules.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)
import app.modules.profiling.services.llm as _llm

# Ces tests tournent SANS clé Mistral : on force le fallback déterministe (règles)
# quelle que soit la configuration `.env` de l'environnement, exactement comme la
# suite d'origine qui s'exécutait sans clé (APL_ALLOW_FALLBACK=true).
_llm.MISTRAL_API_KEY = None
_llm.ALLOW_FALLBACK = True


# ---------------------------------------------------------------------------
# A4 — DoD : testée sur 5 profils (vide, partiel, complet, ambigu, contradictoire).
# ---------------------------------------------------------------------------

def test_a4_profil_vide_incomplet():
    assert evaluer_completude_profil(ProfilPartiel()) is False


def test_a4_profil_partiel_incomplet():
    p = ProfilPartiel(situation_logement=StatutLogement.locataire)
    assert evaluer_completude_profil(p) is False


def test_a4_profil_complet_salarie_celibataire_sans_enfant():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=800,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.celibataire,
        a_des_enfants_a_charge=False,
        nombre_enfants_a_charge=0,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2100,
        ville="Lyon",
    )
    assert evaluer_completude_profil(p) is True


def test_a4_profil_complet_etudiant_boursier():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.residence_etudiante,
        type_residence_detail="CROUS",
        redevance_mensuelle=250,
        logement_appartient_a_un_proche=False,
        statut_marital=StatutMarital.celibataire,
        a_des_enfants_a_charge=False,
        nombre_enfants_a_charge=0,
        statut_professionnel=StatutProfessionnel.etudiant,
        est_boursier=True,
        montant_bourse=450,
        ville="Rennes",
    )
    assert evaluer_completude_profil(p) is True


def test_a4_profil_ambigu_manque_statut_professionnel():
    # Logement et famille renseignés, mais aucune indication du statut
    # socio-professionnel → impossible de savoir quelles ressources demander.
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.meublee,
        loyer_mensuel=650,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.celibataire,
        nombre_enfants_a_charge=0,
        ville="Nantes",
    )
    assert evaluer_completude_profil(p) is False
    assert "statut_professionnel" in champs_manquants(p)


def test_a4_profil_contradictoire_etudiant_sans_statut_boursier():
    # Contradiction : étudiant renseigné + RFR fourni à tort, mais le statut
    # boursier (seul champ pertinent pour un étudiant) manque toujours.
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.meublee,
        loyer_mensuel=650,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.celibataire,
        nombre_enfants_a_charge=0,
        statut_professionnel=StatutProfessionnel.etudiant,
        revenu_fiscal_reference=8000,  # renseigné à tort, non pertinent pour un étudiant
        ville="Lille",
    )
    assert evaluer_completude_profil(p) is False
    assert "est_boursier" in champs_manquants(p)


# ---------------------------------------------------------------------------
# Cascade "en couple" et "enfants à charge" (nouveaux champs).
# ---------------------------------------------------------------------------

def test_a4_couple_exige_statut_et_revenus_du_conjoint():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=900,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.marie,
        nombre_enfants_a_charge=0,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2000,
        ville="Paris",
    )
    assert evaluer_completude_profil(p) is False
    manquants = champs_manquants(p)
    assert "statut_professionnel_conjoint" in manquants
    assert "revenus_conjoint_mensuels" in manquants


def test_a4_enfants_a_charge_exige_age_et_pension():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=900,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.celibataire,
        a_des_enfants_a_charge=True,
        nombre_enfants_a_charge=2,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2000,
        ville="Paris",
    )
    manquants = champs_manquants(p)
    assert "ages_enfants" in manquants
    assert "percoit_pension_alimentaire" in manquants


def test_a4_zero_enfant_ne_demande_pas_age_ni_pension():
    """Non-régression : un profil sans enfant ne doit jamais réclamer ages_enfants."""
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=900,
        logement_appartient_a_un_proche=False,
        logement_conventionne=False,
        statut_marital=StatutMarital.celibataire,
        a_des_enfants_a_charge=False,
        nombre_enfants_a_charge=0,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2000,
        ville="Paris",
    )
    manquants = champs_manquants(p)
    assert "ages_enfants" not in manquants
    assert "percoit_pension_alimentaire" not in manquants


# ---------------------------------------------------------------------------
# Cascade logement (sous-location, foyer/résidence).
# ---------------------------------------------------------------------------

def test_a4_sous_location_exige_age_et_declaration():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.sous_location,
    )
    manquants = champs_manquants(p)
    assert "moins_de_30_ans" in manquants
    assert "sous_location_declaree" in manquants
    # Le loyer/conventionnement classique ne doit PAS être demandé pour une sous-location.
    assert "loyer_mensuel" not in manquants
    assert "logement_conventionne" not in manquants


def test_a4_residence_exige_detail_et_redevance_pas_loyer():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.residence_etudiante,
    )
    manquants = champs_manquants(p)
    assert "type_residence_detail" in manquants
    assert "redevance_mensuelle" in manquants
    assert "loyer_mensuel" not in manquants


# ---------------------------------------------------------------------------
# Référentiel officiel — exclusions déterministes (harness).
# ---------------------------------------------------------------------------

def test_reference_exclusion_bailleur_proche():
    p = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        logement_appartient_a_un_proche=True,
    )
    result = rechercher_exclusion(p)
    assert result is not None
    code, _ = result
    assert code == "bailleur_ascendant_descendant"


def test_reference_exclusion_proprietaire():
    p = ProfilPartiel(situation_logement=StatutLogement.proprietaire)
    result = rechercher_exclusion(p)
    assert result is not None and result[0] == "proprietaire_occupant"


def test_reference_exclusion_heberge_gratuit():
    p = ProfilPartiel(situation_logement=StatutLogement.heberge)
    result = rechercher_exclusion(p)
    assert result is not None and result[0] == "heberge_gratuit"


# ---------------------------------------------------------------------------
# A3 — DoD : profil ambigu → arrêt au 12e tour ; profil simple → convergence.
# Plus non-régression : la cascade respecte l'ordre logique des dépendances.
# ---------------------------------------------------------------------------

@pytest.fixture
def store() -> SessionStore:
    return SessionStore()


def _lancer(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_a3_boucle_s_arrete_au_12e_tour_sur_profil_ambigu(store):
    """Le harness impose 12 tours max, même si le LLM/fallback ne clôt jamais."""
    session = store.creer()
    session.nombre_tours = LIMITE_TOURS
    tour, source = _lancer(jouer_tour(session))
    assert tour.prochaine_action is ProchaineAction.profil_complet
    assert source == "deterministe"
    assert session.profil_complet is True


def test_a3_convergence_rapide_sur_profil_deja_exploitable(store):
    """Un profil déjà complet doit être détecté par A4, sans appel LLM."""
    session = store.creer()
    session.profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=700,
        logement_appartient_a_un_proche=False,
        logement_conventionne=True,
        statut_marital=StatutMarital.marie,
        a_des_enfants_a_charge=True,
        nombre_enfants_a_charge=2,
        ages_enfants="4 et 7 ans",
        percoit_pension_alimentaire=False,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2400,
        statut_professionnel_conjoint=StatutProfessionnel.salarie,
        revenus_conjoint_mensuels=1900,
        ville="Toulouse",
    )
    tour, source = _lancer(jouer_tour(session))
    assert tour.prochaine_action is ProchaineAction.profil_complet
    assert source == "deterministe"


def test_a3_couple_ne_demande_conjoint_que_si_en_couple(store):
    """Non-régression : un célibataire ne doit jamais se voir poser de question
    sur un conjoint — la cascade ne s'active que si statut_marital est en_couple."""
    session = store.creer()
    session.profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=700,
        logement_appartient_a_un_proche=False,
        logement_conventionne=True,
        statut_marital=StatutMarital.celibataire,
    )
    tour, _ = _lancer(jouer_tour(session))
    assert tour.champ_cible not in ("statut_professionnel_conjoint", "revenus_conjoint_mensuels")


def test_a3_couple_demande_bien_le_conjoint(store):
    """Cascade positive : un profil en couple doit se voir demander le statut
    du conjoint avant de passer aux enfants ou aux ressources personnelles."""
    session = store.creer()
    session.profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        type_location=TypeLocation.vide,
        loyer_mensuel=700,
        logement_appartient_a_un_proche=False,
        logement_conventionne=True,
        statut_marital=StatutMarital.marie,
        statut_professionnel=StatutProfessionnel.salarie,
        type_contrat="CDI",
        revenus_nets_mensuels=2000,
    )
    tour, _ = _lancer(jouer_tour(session))
    assert tour.champ_cible == "statut_professionnel_conjoint"


def test_a3_repose_un_champ_non_repondu_meme_s_il_est_dans_l_historique(store):
    """Une question sans réponse reste en attente : l'historique ne doit pas
    faire sauter ce champ, sinon un gate pourrait être contourné."""
    session = store.creer()
    session.profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        statut_professionnel=StatutProfessionnel.etudiant,
        est_boursier=False,
        statut_marital=StatutMarital.celibataire,
        a_des_enfants_a_charge=False,
    )
    session.historique_questions = [{"champ_cible": "type_location", "question": "..."}]
    tour, _ = _lancer(jouer_tour(session))
    assert tour.champ_cible == "type_location"


def test_a3_exclusion_bailleur_proche_court_circuite_la_boucle(store):
    session = store.creer()
    session.profil = ProfilPartiel(
        situation_logement=StatutLogement.locataire,
        logement_appartient_a_un_proche=True,
    )
    tour, source = _lancer(jouer_tour(session))
    assert tour.prochaine_action is ProchaineAction.profil_complet
    assert source == "deterministe"


def test_a3_format_json_respecte_sur_parcours_complet_etudiant_celibataire(store):
    """DoD A3 : le format JSON strict est respecté à chaque tour, sur un
    parcours complet (étudiant célibataire — branche la plus courte de la
    cascade, converge bien avant la limite de 12 tours)."""
    session = store.creer()
    for _ in range(LIMITE_TOURS):
        if session.profil_complet:
            break
        tour, _ = _lancer(jouer_tour(session))
        if tour.prochaine_action is ProchaineAction.poser_question:
            assert tour.question is not None
            assert tour.type_reponse in (TypeReponse.texte_libre, TypeReponse.choix_multiple)
            assert tour.champ_cible is not None
            if tour.type_reponse is TypeReponse.choix_multiple:
                assert tour.options and len(tour.options) > 0
            session.profil = session.profil.model_copy(
                update={tour.champ_cible: _valeur_test_pour_etudiant(tour.champ_cible)}
            )
    assert session.profil_complet is True


def _valeur_test_pour_etudiant(champ: str):
    mapping = {
        "situation_logement": StatutLogement.locataire,
        "type_location": TypeLocation.residence_etudiante,
        "type_residence_detail": "CROUS",
        "redevance_mensuelle": 250.0,
        "logement_appartient_a_un_proche": False,
        "statut_marital": StatutMarital.celibataire,
        "a_des_enfants_a_charge": False,
        "nombre_enfants_a_charge": 0,
        "statut_professionnel": StatutProfessionnel.etudiant,
        "est_boursier": False,
        "ville": "Grenoble",
    }
    return mapping.get(champ, "reponse_test")


def test_a3_profil_complexe_couple_avec_enfants_peut_atteindre_la_limite_de_12(store):
    """⚠️ Compromis explicitement documenté (à signaler à l'utilisateur, RULES.md
    §3) : la cascade étendue (couple + enfants + salarié) compte jusqu'à 15
    champs à collecter, soit PLUS que la limite stricte de 12 questions. Le
    harness doit alors clore sur `profil_complet` (déterministe) sans jamais
    dépasser 12 tours, MÊME si le profil réel n'est pas entièrement caractérisé.
    C'est le comportement voulu par le plafond (RULES.md §2.1) : mieux vaut
    clore prématurément que boucler indéfiniment sur un profil ambigu.
    """
    session = store.creer()
    for _ in range(LIMITE_TOURS + 2):  # marge de sécurité pour prouver qu'on ne dépasse jamais 12
        if session.profil_complet:
            break
        tour, _ = _lancer(jouer_tour(session))
        if tour.prochaine_action is ProchaineAction.poser_question:
            session.profil = session.profil.model_copy(
                update={tour.champ_cible: _valeur_test_pour(tour.champ_cible)}
            )
    assert session.nombre_tours <= LIMITE_TOURS
    assert session.profil_complet is True  # clos par le plafond, pas par A4


def _valeur_test_pour(champ: str):
    """Valeur plausible pour faire avancer la boucle — force un parcours
    'couple avec enfants et salarié' pour exercer un maximum de branches."""
    mapping = {
        "situation_logement": StatutLogement.locataire,
        "type_location": TypeLocation.vide,
        "loyer_mensuel": 900.0,
        "logement_appartient_a_un_proche": False,
        "logement_conventionne": True,
        "statut_marital": StatutMarital.marie,
        "statut_professionnel_conjoint": StatutProfessionnel.salarie,
        "revenus_conjoint_mensuels": 1800.0,
        "a_des_enfants_a_charge": True,
        "nombre_enfants_a_charge": 1,
        "ages_enfants": "6 ans",
        "percoit_pension_alimentaire": False,
        "statut_professionnel": StatutProfessionnel.salarie,
        "type_contrat": "CDI",
        "revenus_nets_mensuels": 2200.0,
        "ville": "Bordeaux",
    }
    return mapping.get(champ, "reponse_test")


def test_a3_gate_enfants_precède_nombre_et_détails():
    profil = ProfilPartiel(
        statut_professionnel=StatutProfessionnel.etudiant,
        est_boursier=False,
        statut_marital=StatutMarital.celibataire,
    )
    assert prochain_champ_attendu(profil)["champ_cible"] == "a_des_enfants_a_charge"

    profil = profil.model_copy(update={"a_des_enfants_a_charge": True})
    assert prochain_champ_attendu(profil)["champ_cible"] == "nombre_enfants_a_charge"

    profil = profil.model_copy(update={"nombre_enfants_a_charge": 2})
    assert prochain_champ_attendu(profil)["champ_cible"] == "ages_enfants"


def test_a3_interprete_texte_libre_et_ne_retourne_pas_erreur_technique():
    valide = analyser_reponse("situation_logement", "Je suis locataire d’un F2")
    assert valide.type_reponse_percue.value == "reponse_valide"
    assert valide.valeur_extraite == "locataire"

    clarification = analyser_reponse("logement_conventionne", "C’est quoi un logement conventionné ?")
    assert clarification.type_reponse_percue.value == "demande_clarification"
    assert clarification.repeter_meme_question is True
    assert clarification.message_si_clarification

    hors_sujet = analyser_reponse("est_boursier", "Quel temps fera-t-il demain ?")
    assert hors_sujet.type_reponse_percue.value == "hors_sujet"
    assert hors_sujet.repeter_meme_question is True
