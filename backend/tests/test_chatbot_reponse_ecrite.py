"""Répondre en écrivant, ou en dictant, plutôt qu'en cliquant.

`profilage_documents.reconnaitre()` accepte des mots-clés précisément pour qu'une
réponse ÉCRITE ou DICTÉE fonctionne : sa docstring le dit indispensable, parce que
l'assistant vocal rend une transcription (« je suis locataire ») qui ne sera jamais
égale au libellé d'un bouton.

Ce chemin était inatteignable. L'UI décidait elle-même si un message répondait à la
question, sur le seul indice dont elle dispose — des boutons sont-ils affichés ? Les
questions de l'entretien en affichant toujours, tout texte tapé était classé
« changement de sujet », repartait au classifieur, et n'atteignait jamais
`reconnaitre`. Pire : si le classifieur tombait sur une autre intention, ce nœud-là
effaçait `pending_clarification` et l'entretien recommençait de zéro.

Le contrat porte donc maintenant un FAIT (clic ou saisie) au lieu d'un VERDICT
(« ceci est une réponse »), et c'est le moteur qui tranche — lui seul connaît le
vocabulaire attendu de chaque question.
"""

from __future__ import annotations

import pytest

from app.modules.chatbot.rag import orchestrator as o


def _etat(message, pending=None, reply=None):
    return {
        "message": message, "conversation_history": [], "citizen_profile": None,
        "intent": None, "response": None, "response_options": None,
        "pending_clarification": pending, "clarification_reply": reply,
        "user_role": "citizen", "answer": None, "sources": None,
        "collected_profile": None, "date_reference": None, "date_asked": False,
    }


def _pending(intent="documents_necessaires", etat_encode=None):
    return {
        "original_question": etat_encode
        if etat_encode is not None
        else o.profilage_documents.encoder_etat({}),
        "intent": intent,
    }


# --- Le routage : à qui le message est confié --------------------------------


def test_un_clic_repart_toujours_au_noeud_qui_a_pose_la_question():
    """Un clic ne s'interprète pas : le citoyen a choisi parmi ce qu'on lui montrait."""
    for intent in ("documents_necessaires", "estimation", "rag_general", "fondement_juridique"):
        etat = _etat("Je suis locataire", _pending(intent), reply="option")
        assert o.orchestrator_node(etat)["intent"] == intent


@pytest.mark.parametrize(
    "intent", ["documents_necessaires", "estimation", "fondement_juridique"]
)
def test_une_saisie_est_confiee_aux_noeuds_qui_savent_la_reconnaitre(intent):
    """La correction : ces nœuds ont le vocabulaire de leurs questions, on leur confie
    le texte plutôt que de le renvoyer au classifieur."""
    etat = _etat("je suis locataire", _pending(intent), reply="text")
    assert o.orchestrator_node(etat)["intent"] == intent


def test_une_saisie_pendant_une_question_de_rag_general_reste_un_changement_de_sujet(
    monkeypatch,
):
    """Volontairement exclu : les clarifications de `rag_general` sont écrites par le
    modèle, il n'a aucun vocabulaire attendu et prendrait n'importe quel texte pour une
    réponse. On garde donc l'ancien comportement pour cette branche-là."""
    monkeypatch.setattr(o, "route_intent_llm", lambda _s: "estimation")
    etat = _etat("combien je vais toucher ?", _pending("rag_general"), reply="text")
    assert o.orchestrator_node(etat)["intent"] == "estimation"


def test_un_message_spontane_passe_par_le_classifieur(monkeypatch):
    monkeypatch.setattr(o, "route_intent_llm", lambda _s: "rag_general")
    assert o.orchestrator_node(_etat("comment ça marche ?"))["intent"] == "rag_general"


def test_sans_clarification_en_attente_le_champ_ne_court_circuite_rien(monkeypatch):
    """Un client qui prétend répondre alors que rien n'est en attente ne doit pas
    pouvoir sauter la classification."""
    monkeypatch.setattr(o, "route_intent_llm", lambda _s: "fallback")
    etat = _etat("n'importe quoi", pending=None, reply="option")
    assert o.orchestrator_node(etat)["intent"] == "fallback"


# --- L'entretien avance vraiment ---------------------------------------------


def test_une_reponse_ecrite_fait_avancer_lentretien():
    """Le cas d'usage complet : on tape au lieu de cliquer, l'entretien progresse."""
    depart = o.documents_necessaires_node(_etat("quels documents pour l'APL ?"))
    assert "situation de logement" in depart["answer"]

    suite = o.documents_necessaires_node(
        _etat("je suis locataire", depart["pending_clarification"], reply="text")
    )

    assert "situation professionnelle" in suite["answer"], "on est passé à la question 2"
    etat = o.profilage_documents.decoder_etat(suite["pending_clarification"])
    assert etat["logement"] == {"situation_logement": "locataire"}


def test_une_dictee_vocale_fait_avancer_lentretien():
    """La transcription ne sera jamais égale au libellé du bouton — c'est le cas pour
    lequel `reconnaitre` a été écrit."""
    depart = o.documents_necessaires_node(_etat("quels documents ?"))
    suite = o.documents_necessaires_node(
        _etat("euh je paie un loyer tous les mois", depart["pending_clarification"], reply="text")
    )
    etat = o.profilage_documents.decoder_etat(suite["pending_clarification"])
    assert etat["logement"] == {"situation_logement": "locataire"}


def test_une_saisie_non_reconnue_repose_la_question_sans_rien_perdre():
    """La règle à préserver : ne jamais deviner. Et surtout ne pas perdre l'entretien —
    c'était le pire effet du défaut, le citoyen recommençait à zéro."""
    depart = o.documents_necessaires_node(_etat("quels documents ?"))
    suite = o.documents_necessaires_node(
        _etat("je ne sais pas trop", depart["pending_clarification"], reply="text")
    )

    assert "situation de logement" in suite["answer"], "la même question est reposée"
    assert suite["pending_clarification"] is not None, "l'entretien n'est pas perdu"
    assert o.profilage_documents.decoder_etat(suite["pending_clarification"]) == {}


def test_lentretien_survit_a_une_reponse_non_reconnue_en_cours_de_route():
    """Deux questions déjà répondues, une saisie incomprise : rien n'est effacé."""
    tour = o.documents_necessaires_node(_etat("quels documents ?"))
    tour = o.documents_necessaires_node(
        _etat("locataire", tour["pending_clarification"], reply="text")
    )
    tour = o.documents_necessaires_node(
        _etat("étudiant", tour["pending_clarification"], reply="text")
    )
    avant = o.profilage_documents.decoder_etat(tour["pending_clarification"])

    tour = o.documents_necessaires_node(
        _etat("bla bla bla", tour["pending_clarification"], reply="text")
    )

    assert o.profilage_documents.decoder_etat(tour["pending_clarification"]) == avant
    assert len(avant) == 2, "les deux réponses déjà données sont toujours là"


def test_un_clic_continue_de_fonctionner_comme_avant():
    """Non-régression du chemin normal."""
    depart = o.documents_necessaires_node(_etat("quels documents ?"))
    libelle = depart["response_options"][0]
    suite = o.documents_necessaires_node(
        _etat(libelle, depart["pending_clarification"], reply="option")
    )
    assert o.profilage_documents.decoder_etat(suite["pending_clarification"])["logement"]
