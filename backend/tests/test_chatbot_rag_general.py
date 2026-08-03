"""Le dialogue de clarification de la branche `rag_general`.

DEUX DÉFAUTS SONT VERROUILLÉS ICI, observés en conversation réelle.

1. **Les réponses étaient perdues.** La requête valait « question d'origine +
   dernier message », et la question d'origine ne bougeait jamais. Un citoyen qui
   répondait « Oui » puis « Oui » produisait donc deux fois exactement la même
   requête, d'où les mêmes extraits et la même question reposée mot pour mot. Il
   ne s'en sortait qu'en tapant une phrase plus longue, qui changeait enfin la
   requête. C'est le scénario de `test_les_reponses_saccumulent...`.

2. **Le plafond n'existait pas.** Le prompt demandait au modèle de ne pas
   dépasser quatre clarifications en comptant les siennes dans l'historique — un
   historique que le client tronque aux 6 derniers messages. Le modèle n'a jamais
   pu voir son propre plafond.

Aucun appel réseau : le pipeline est remplacé par un double qui enregistre ce
qu'on lui demande et rend les réponses prévues.
"""

from __future__ import annotations

import pytest

from app.modules.chatbot.rag import orchestrator as o
from app.modules.chatbot.rag.llm_client import EXPLAIN_OPTION, SKIP_OPTION, LlmContractError
from app.modules.chatbot.rag.unanswered_log import (
    RAISON_EXTRAITS_INSUFFISANTS,
    RAISON_REPONSE_ILLISIBLE,
    RAISON_TROP_DE_CLARIFICATIONS,
    REDIRECTION_OFFICIELLE,
)

CHUNK = {"source_url": "https://caf.fr/apl", "source_title": "APL", "category": "demarche"}


def _clarification(texte="Êtes-vous locataire ?"):
    return {"type": "clarification", "text": texte, "options": ["Oui", "Non"]}


def _reponse(texte="Voici la réponse.", repondu=True):
    return {"type": "answer", "text": texte, "repondu": repondu,
            "sources": [CHUNK["source_url"]], "retrieved_chunks": [(CHUNK, 1.0)]}


class FauxPipeline:
    """Double du pipeline : enregistre chaque appel, rend les réponses prévues."""

    def __init__(self, *reponses):
        self.reponses = list(reponses)
        self.appels: list[dict] = []

    def answer(self, query, category=None, conversation_history=None,
               requete_recherche=None, consigne_finale=None):
        self.appels.append({
            "query": query,
            "requete_recherche": requete_recherche,
            "consigne_finale": consigne_finale,
        })
        if isinstance(self.reponses[0], Exception):
            raise self.reponses[0]
        return self.reponses.pop(0) if len(self.reponses) > 1 else self.reponses[0]


@pytest.fixture
def pipeline(monkeypatch):
    """Installe le double, et empêche l'écriture du journal sur disque."""
    def _installer(*reponses):
        faux = FauxPipeline(*reponses)
        monkeypatch.setattr(o, "get_rag_pipeline", lambda: faux)
        return faux
    return _installer


@pytest.fixture
def journal(monkeypatch):
    entrees: list[tuple] = []
    monkeypatch.setattr(
        o, "log_unanswered",
        lambda question, intent, raison, **k: entrees.append((intent, raison)),
    )
    return entrees


def _etat(message, pending=None, reply=None):
    return {
        "message": message, "conversation_history": [], "citizen_profile": None,
        "intent": None, "response": None, "response_options": None,
        "pending_clarification": pending, "clarification_reply": reply,
        "user_role": "citizen", "answer": None, "sources": None,
        "collected_profile": None, "date_reference": None, "date_asked": False,
    }


def _repondre(message, precedent):
    """Le tour suivant, tel que le client le renverrait (clic sur un des choix)."""
    return o.rag_general_node(
        _etat(message, precedent["pending_clarification"], reply="option")
    )


# --- 1. Les réponses s'accumulent --------------------------------------------


def test_les_reponses_saccumulent_dans_la_requete(pipeline, journal):
    """La régression observée : deux « Oui » ne doivent pas produire deux requêtes
    identiques, sinon le modèle repose la même question à l'identique."""
    faux = pipeline(_clarification("Êtes-vous étudiant ?"),
                    _clarification("Êtes-vous locataire ?"),
                    _reponse())

    tour = o.rag_general_node(_etat("est-ce que je peux bénéficier de l'apl ?"))
    tour = _repondre("Oui", tour)
    tour = _repondre("Oui", tour)

    recherches = [appel["requete_recherche"] for appel in faux.appels]
    assert recherches[0] == "est-ce que je peux bénéficier de l'apl ?"
    assert recherches[1] == "est-ce que je peux bénéficier de l'apl ? Oui"
    assert recherches[2] == "est-ce que je peux bénéficier de l'apl ? Oui Oui"
    assert len(set(recherches)) == 3, "chaque tour doit chercher autre chose que le précédent"


def test_la_question_dorigine_est_conservee(pipeline, journal):
    faux = pipeline(_clarification(), _reponse())
    tour = o.rag_general_node(_etat("comment est calculée l'APL ?"))
    _repondre("Je suis locataire", tour)
    assert faux.appels[1]["requete_recherche"].startswith("comment est calculée l'APL ?")


def test_expliquez_moi_ne_pollue_pas_la_recherche(pipeline, journal):
    """« Je ne comprends pas » est une action, pas une information : le modèle doit la
    voir, la recherche lexicale n'a rien à en tirer."""
    faux = pipeline(_clarification(), _clarification(), _reponse())
    tour = o.rag_general_node(_etat("quel est le délai ?"))
    tour = _repondre(EXPLAIN_OPTION, tour)

    assert EXPLAIN_OPTION not in faux.appels[1]["requete_recherche"]
    assert EXPLAIN_OPTION in faux.appels[1]["query"], "le modèle doit voir la demande"


def test_passer_la_question_ne_pollue_pas_la_recherche(pipeline, journal):
    faux = pipeline(_clarification(), _clarification(), _reponse())
    tour = o.rag_general_node(_etat("quel est le délai ?"))
    _repondre(SKIP_OPTION, tour)
    assert SKIP_OPTION not in faux.appels[1]["requete_recherche"]


# --- 2. Le plafond ------------------------------------------------------------


def test_le_dialogue_ne_peut_pas_tourner_indefiniment(pipeline, journal):
    """Un modèle qui ne pose QUE des questions doit être arrêté par le code."""
    pipeline(_clarification())

    tour = o.rag_general_node(_etat("est-ce que j'y ai droit ?"))
    for _ in range(o.RAG_CLARIFICATIONS_MAX + 5):
        if tour["pending_clarification"] is None:
            break
        tour = _repondre("Oui", tour)

    assert tour["pending_clarification"] is None, "le dialogue doit s'arrêter"
    assert tour["answer"] == REDIRECTION_OFFICIELLE
    assert tour["sources"] == []
    assert ("rag_general", RAISON_TROP_DE_CLARIFICATIONS) in journal


def test_le_modele_est_prevenu_avant_dtre_coupe(pipeline, journal):
    """Au dernier tour, on lui demande de conclure — le couperet n'est que le recours."""
    faux = pipeline(_clarification())
    tour = o.rag_general_node(_etat("est-ce que j'y ai droit ?"))
    for _ in range(o.RAG_CLARIFICATIONS_MAX):
        if tour["pending_clarification"] is None:
            break
        tour = _repondre("Oui", tour)

    consignes = [appel["consigne_finale"] for appel in faux.appels]
    assert consignes[0] is None, "aucune consigne au premier tour"
    assert consignes[-1] == o.CONSIGNE_REPONSE_OBLIGATOIRE


def test_une_reponse_avant_le_plafond_passe_normalement(pipeline, journal):
    faux = pipeline(_clarification(), _reponse("Le délai est de deux mois."))
    tour = o.rag_general_node(_etat("quel est le délai ?"))
    tour = _repondre("Je suis locataire", tour)

    assert tour["answer"] == "Le délai est de deux mois."
    assert tour["sources"] == [{"title": "APL", "category": "demarche", "url": CHUNK["source_url"]}]
    assert tour["pending_clarification"] is None
    assert journal == []


# --- L'état qui fait l'aller-retour ------------------------------------------


def test_letat_nest_jamais_la_question_brute(pipeline, journal):
    """Ce champ portait la question du citoyen ; il porte maintenant l'état du dialogue.
    Le client ne l'affiche pas, mais il ne doit pas non plus être pris pour du texte."""
    pipeline(_clarification())
    tour = o.rag_general_node(_etat("comment est calculée l'APL ?"))
    etat = o._decoder_etat_rag(tour["pending_clarification"])
    assert etat["question"] == "comment est calculée l'APL ?"
    assert etat["posees"] == 1


@pytest.mark.parametrize(
    "pending",
    [
        {"original_question": "une vraie question, pas de l'état", "intent": "rag_general"},
        {"original_question": '{"rag_clarification": {"question": ""}}', "intent": "rag_general"},
        {"original_question": '{"rag_clarification": "pas un dict"}', "intent": "rag_general"},
        {"original_question": "", "intent": "rag_general"},
    ],
)
def test_un_etat_illisible_repart_de_la_question_posee(pipeline, journal, pending):
    faux = pipeline(_reponse())
    o.rag_general_node(_etat("quel est le délai ?", pending, reply="option"))
    assert faux.appels[0]["requete_recherche"] == "quel est le délai ?"


def test_un_compteur_bidonne_ne_donne_pas_un_dialogue_infini(pipeline, journal):
    """L'état vient du client. Un compteur négatif ou absurde retombe sur zéro, et le
    plafond continue de s'appliquer à partir de là."""
    pipeline(_clarification())
    pending = {
        "original_question": '{"rag_clarification": {"question": "q", "reponses": [], "posees": -99}}',
        "intent": "rag_general",
    }
    tour = o.rag_general_node(_etat("Oui", pending, reply="option"))
    assert o._decoder_etat_rag(tour["pending_clarification"])["posees"] == 1


def test_letat_dun_autre_noeud_nest_pas_lu(pipeline, journal):
    """Une estimation en cours ne doit pas être prise pour un dialogue rag_general."""
    faux = pipeline(_reponse())
    pending = {"original_question": '{"estimation_reponses": {"zone": "Zone 1"}}',
               "intent": "estimation"}
    o.rag_general_node(_etat("quel est le délai ?", pending, reply="option"))
    assert faux.appels[0]["requete_recherche"] == "quel est le délai ?"


# --- Les dégradations déjà en place ne bougent pas ----------------------------


def test_une_reponse_illisible_renvoie_au_canal_officiel(pipeline, journal):
    pipeline(LlmContractError("simulé"))
    tour = o.rag_general_node(_etat("quel est le délai ?"))
    assert tour["answer"] == REDIRECTION_OFFICIELLE
    assert tour["sources"] == []
    assert ("rag_general", RAISON_REPONSE_ILLISIBLE) in journal


def test_repondu_absent_vaut_non_repondu(pipeline, journal):
    pipeline(_reponse(repondu=None) | {"repondu": None})
    tour = o.rag_general_node(_etat("quel est le délai ?"))
    assert tour["answer"] == REDIRECTION_OFFICIELLE
    assert tour["sources"] == []
    assert ("rag_general", RAISON_EXTRAITS_INSUFFISANTS) in journal
