"""L'entretien de profilage « documents nécessaires » (`rag.profilage_documents`).

Ce que ces tests verrouillent avant tout : **l'entretien se termine**. La version
précédente confiait au modèle le soin de compter ses propres questions en
relisant l'historique — un historique que le client tronque aux 6 derniers
messages. Passé la troisième question, le modèle voyait en permanence deux ou
trois de ses questions, en concluait qu'il lui restait de la marge, et pouvait
continuer indéfiniment. Le plafond n'était pas seulement mal respecté : il était
invisible.

Le plafond est maintenant une propriété du parcours, pas une consigne. Le test
qui compte est donc `test_lentretien_sarrete_toujours...` : il épuise toutes les
combinaisons de réponses possibles et vérifie qu'aucune ne dépasse quatre
questions. Aucun appel réseau — ce module ne parle à aucun modèle.
"""

from __future__ import annotations

import itertools

import pytest

from app.modules.chatbot.checklist_answer import PROFILE_FIELDS as pd_champs_utiles
from app.modules.chatbot.rag.profilage_documents import (
    CHAMPS_BASE,
    QUESTIONS,
    decoder_etat,
    encoder_etat,
    enregistrer,
    options,
    prochain_champ,
    profil_declare,
    reconnaitre,
)

#: Le plafond promis au citoyen : trois questions de base plus une relance.
PLAFOND = 4


def _mener(reponses_citoyen: list[str | None]) -> tuple[list[str], dict]:
    """Déroule l'entretien avec les réponses données (None = question passée)."""
    etat: dict = {}
    posees: list[str] = []
    for message in reponses_citoyen:
        champ = prochain_champ(etat)
        if champ is None:
            break
        posees.append(champ)
        etat = enregistrer(etat, champ, reconnaitre(champ, message) if message else None)
    return posees, etat


# --- Le plafond ---------------------------------------------------------------


def test_lentretien_sarrete_toujours_en_quatre_questions_au_plus():
    """La régression H3, prise à la racine : on épuise TOUTES les combinaisons de
    réponses aux trois questions de base, et aucune ne peut dépasser le plafond."""
    combinaisons = itertools.product(
        *[[choix.libelle for choix in QUESTIONS[champ].choix] + [None] for champ in CHAMPS_BASE]
    )
    for reponses in combinaisons:
        # Vingt tours : largement de quoi révéler une boucle si le plafond fuyait.
        posees, _ = _mener(list(reponses) + [None] * 20)
        assert len(posees) <= PLAFOND, f"{len(posees)} questions pour {reponses}"


def test_une_seule_relance_est_posee():
    """Un locataire étudiant coche deux relances possibles ; une seule est posée."""
    posees, _ = _mener(["Je suis locataire", "Étudiant(e)", "Seul(e), sans enfant à charge", None])
    assert posees == ["logement", "activite", "foyer", "type_location"]


def test_sans_relance_applicable_lentretien_tient_en_trois_questions():
    """Propriétaire, indépendant, seul : aucune relance n'a d'objet."""
    posees, etat = _mener(
        ["Je suis propriétaire", "Indépendant(e)", "Seul(e), sans enfant à charge", None, None]
    )
    assert posees == list(CHAMPS_BASE)
    assert prochain_champ(etat) is None


@pytest.mark.parametrize(
    ("logement", "activite", "foyer", "relance"),
    [
        ("Je suis locataire", "Salarié(e)", "Seul(e), sans enfant à charge", "type_location"),
        ("Je suis propriétaire", "Étudiant(e)", "Seul(e), sans enfant à charge", "est_boursier"),
        ("Je suis hébergé(e)", "Demandeur d'emploi", "Seul(e), sans enfant à charge", "percoit_are"),
        ("Je suis propriétaire", "Salarié(e)", "En couple, sans enfant à charge",
         "statut_professionnel_conjoint"),
    ],
)
def test_la_relance_depend_des_reponses_precedentes(logement, activite, foyer, relance):
    posees, _ = _mener([logement, activite, foyer, None])
    assert posees[3] == relance


# --- Passer une question ------------------------------------------------------


def test_une_question_passee_nest_jamais_reposee():
    _, etat = _mener([None])
    assert prochain_champ(etat) == "activite"


def test_passer_toutes_les_questions_termine_lentretien():
    posees, etat = _mener([None, None, None, None, None])
    assert posees == list(CHAMPS_BASE)
    assert prochain_champ(etat) is None
    assert profil_declare(etat) == {}


# --- Reconnaître la réponse ---------------------------------------------------


def test_le_libelle_exact_est_reconnu():
    """Le cas normal : le citoyen a cliqué sur un bouton."""
    assert reconnaitre("logement", "Je suis locataire").profil == {"situation_logement": "locataire"}


@pytest.mark.parametrize(
    ("dictee", "attendu"),
    [
        ("je suis locataire en fait", "locataire"),
        ("LOCATAIRE", "locataire"),
        ("je paie un loyer", "locataire"),
        ("propriétaire", "proprietaire"),
        ("je suis hébergé chez mes parents", "heberge"),
    ],
)
def test_une_reponse_tapee_ou_dictee_est_reconnue(dictee, attendu):
    """L'assistant vocal renvoie une transcription, jamais le libellé du bouton."""
    assert reconnaitre("logement", dictee).profil == {"situation_logement": attendu}


@pytest.mark.parametrize("message", ["bla bla", "", "   ", "je ne sais pas trop"])
def test_une_reponse_non_reconnue_ne_devine_rien(message):
    """Deviner fausserait la liste des pièces : on préfère reposer la question."""
    assert reconnaitre("logement", message) is None


# --- Le profil déclaré --------------------------------------------------------


def test_le_profil_assemble_toutes_les_reponses():
    # Propriétaire et salarié : ni `type_location` ni `est_boursier` n'ont lieu d'être,
    # la relance sur le conjoint est donc la quatrième question.
    _, etat = _mener(["Je suis propriétaire", "Salarié(e)",
                      "En couple, avec un ou des enfants à charge", "Étudiant(e)"])
    profil = profil_declare(etat)
    assert profil["situation_logement"] == "proprietaire"
    assert profil["statut_professionnel"] == "salarie"
    assert profil["a_des_enfants_a_charge"] is True
    assert profil["statut_professionnel_conjoint"] == "etudiant"


def test_une_question_passee_nécrit_aucun_champ():
    _, etat = _mener([None, "Salarié(e)", None])
    assert profil_declare(etat) == {"statut_professionnel": "salarie"}


def test_une_seule_reponse_peut_renseigner_deux_champs():
    profil = reconnaitre("foyer", "Seul(e), avec un ou des enfants à charge").profil
    assert profil == {"statut_marital": "celibataire", "a_des_enfants_a_charge": True}


# --- L'état qui fait l'aller-retour par le client -----------------------------


def test_letat_survit_a_lallerretour():
    _, etat = _mener(["Je suis locataire", "Salarié(e)"])
    pending = {"original_question": encoder_etat(etat), "intent": "documents_necessaires"}
    assert decoder_etat(pending) == etat


@pytest.mark.parametrize(
    "pending",
    [
        None,
        {},
        {"original_question": "une vraie question, pas de l'état"},
        {"original_question": '{"autre_chose": 1}'},
        {"original_question": '{"documents_reponses": "pas un dict"}'},
    ],
)
def test_un_etat_illisible_repart_de_zero(pending):
    assert decoder_etat(pending) == {}


def test_un_champ_inconnu_venu_du_client_est_ignore():
    """L'état vient du client : une clé inventée ne doit pas piloter l'entretien."""
    pending = {"original_question": '{"documents_reponses": {"champ_pirate": {"x": 1}}}'}
    assert decoder_etat(pending) == {}


# --- Les options affichées ----------------------------------------------------


@pytest.mark.parametrize("champ", list(QUESTIONS))
def test_chaque_question_propose_entre_deux_et_cinq_choix(champ):
    assert 2 <= len(options(champ)) <= 5


@pytest.mark.parametrize("champ", list(QUESTIONS))
def test_chaque_question_a_son_explication(champ):
    """« Je ne comprends pas » doit avoir une réponse pour CHAQUE question."""
    assert len(QUESTIONS[champ].explication) > 40


@pytest.mark.parametrize("champ", list(QUESTIONS))
def test_chaque_choix_est_reconnaissable_par_son_propre_libelle(champ):
    """Garde-fou : deux choix dont les mots-clés se recouvrent se voleraient les
    réponses. On vérifie que chaque libellé retombe bien sur son propre choix."""
    for choix in QUESTIONS[champ].choix:
        assert reconnaitre(champ, choix.libelle) is choix


def test_seuls_les_champs_utiles_a_la_checklist_sont_demandes():
    """L'entretien ne doit remplir que des champs dont les règles se servent : demander
    autre chose allongerait la conversation sans changer une seule pièce."""
    demandes = {
        cle
        for question in QUESTIONS.values()
        for choix in question.choix
        for cle in choix.profil
    }
    assert demandes <= set(pd_champs_utiles)
