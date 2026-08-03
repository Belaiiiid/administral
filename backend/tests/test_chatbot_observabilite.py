"""Ce que l'assistant écrit quand il dégrade, et à chaque tour.

Le défaut corrigé : `answer_question` enveloppait tout le moteur dans un
`except Exception` qui renvoyait « momentanément indisponible » sans écrire une
seule ligne. Le citoyen voyait une panne, l'équipe ne voyait rien — ni la cause,
ni le nombre de fois. Les autres branches n'étaient guère mieux : elles
faisaient `print`, ce qui se perd dès que personne ne regarde la console.

Ces tests portent donc sur une exigence d'exploitation, pas sur une réponse :
une dégradation doit laisser une trace, et un tour normal doit laisser de quoi
suivre la santé du service. Ils vérifient aussi ce qui NE doit PAS être écrit —
le message du citoyen n'a rien à faire dans une ligne de métrique.
"""

from __future__ import annotations

import json

import pytest

from app.modules.chatbot import service
from app.modules.chatbot.rag import orchestrator


QUESTION = "quels sont mes droits ?"


def _lignes(capsys) -> list[dict]:
    capture = capsys.readouterr()
    lignes = []
    for flux in (capture.out, capture.err):
        for brut in flux.splitlines():
            brut = brut.strip()
            if brut.startswith("{"):
                try:
                    lignes.append(json.loads(brut))
                except json.JSONDecodeError:
                    pass
    return lignes


@pytest.fixture
def moteur(monkeypatch):
    """Remplace le graphe compilé par un double : ni LLM, ni index."""
    def _installer(resultat):
        class FauxGraphe:
            def invoke(self, _etat):
                if isinstance(resultat, Exception):
                    raise resultat
                return resultat

        monkeypatch.setattr(service, "_get_graph", lambda: FauxGraphe())
    return _installer


def _etat_repondu(**extra):
    return {
        "intent": "rag_general", "answer": "Voici la réponse.", "response": None,
        "sources": [{"title": "CAF", "category": "demarche", "url": "https://caf.fr"}],
        "response_options": None, "pending_clarification": None,
        "collected_profile": None, "date_reference": None, "date_asked": False,
        **extra,
    }


# --- Une panne laisse une trace ----------------------------------------------


def test_une_panne_du_moteur_est_consignee(moteur, capsys):
    moteur(RuntimeError("Mistral injoignable"))

    reponse = service.answer_question(QUESTION, None, None)

    assert "momentanément indisponible" in reponse.answer, "le citoyen garde son message"
    incidents = [l for l in _lignes(capsys) if l["level"] == "error"]
    assert len(incidents) == 1, "la panne doit être écrite, une fois"
    contexte = incidents[0]["context"]
    assert contexte["error"] == "RuntimeError: Mistral injoignable"
    assert "Traceback" in contexte["traceback"]
    assert contexte["etape"] == "graph"


def test_une_panne_de_checklist_est_consignee_a_part(moteur, capsys, monkeypatch):
    """L'autre `except` silencieux : distinguer les deux étapes évite de chercher la
    panne dans le moteur alors qu'elle est dans le rendu."""
    moteur(_etat_repondu(intent="documents_necessaires",
                         collected_profile={"situation_logement": "locataire"}))
    def _casse(*_a, **_k):
        raise ValueError("règle absente")
    monkeypatch.setattr(service, "render_checklist", _casse)

    reponse = service.answer_question(QUESTION, None, None)

    assert "momentanément indisponible" in reponse.answer
    incidents = [l for l in _lignes(capsys) if l["level"] == "error"]
    assert incidents[0]["context"]["etape"] == "checklist"
    assert incidents[0]["context"]["error"] == "ValueError: règle absente"


# --- Un tour normal laisse de quoi suivre le service --------------------------


def test_chaque_tour_ecrit_ses_metriques(moteur, capsys):
    moteur(_etat_repondu())

    service.answer_question(QUESTION, None, None)

    tours = [l for l in _lignes(capsys) if l["message"] == "chatbot: tour traité"]
    assert len(tours) == 1
    contexte = tours[0]["context"]
    assert contexte["intent"] == "rag_general"
    assert contexte["sources"] == 1
    assert contexte["clarification"] is False
    assert contexte["role"] == "citizen"
    assert isinstance(contexte["duree_ms"], int)


def test_le_mode_de_recherche_est_remonte_a_chaque_tour(moteur, capsys):
    """Une bascule durable en BM25 seul ne se voit nulle part ailleurs : sans ça, elle
    ne se remarque qu'à la qualité des réponses, des semaines plus tard."""
    moteur(_etat_repondu())
    service.answer_question(QUESTION, None, None)
    tour = [l for l in _lignes(capsys) if l["message"] == "chatbot: tour traité"][0]
    assert tour["context"]["mode_recherche"] in ("hybride", "bm25_seul", "non_initialise")


def test_le_message_du_citoyen_nest_pas_dans_les_metriques(moteur, capsys):
    """Le contenu n'a qu'un endroit légitime, le journal des questions sans réponse.
    Une ligne de métrique est une donnée d'exploitation, pas une archive."""
    moteur(_etat_repondu())
    service.answer_question("je m'appelle Amine et je gagne 1200 euros", None, None)

    for ligne in _lignes(capsys):
        écrit = json.dumps(ligne, ensure_ascii=False)
        assert "Amine" not in écrit
        assert "1200" not in écrit


# --- Le mode de recherche ne doit rien déclencher -----------------------------


def test_mode_recherche_ne_construit_jamais_le_pipeline(monkeypatch):
    """Appelé à chaque tour, y compris sur une politesse : s'il construisait le
    pipeline, écrire une ligne de log coûterait le chargement complet des index."""
    monkeypatch.setattr(orchestrator, "_rag_pipeline_instance", None)
    def _interdit():
        raise AssertionError("le pipeline ne doit pas être construit pour un log")
    monkeypatch.setattr(orchestrator.rag_pipeline, "RagPipeline", _interdit)

    assert orchestrator.mode_recherche() == "non_initialise"


@pytest.mark.parametrize(("semantique", "attendu"), [(True, "hybride"), (False, "bm25_seul")])
def test_mode_recherche_reflete_letat_du_pipeline(monkeypatch, semantique, attendu):
    class FauxPipeline:
        semantic_available = semantique

    monkeypatch.setattr(orchestrator, "_rag_pipeline_instance", FauxPipeline())
    assert orchestrator.mode_recherche() == attendu
