"""Ce qu'un tour de conversation immobilise pendant qu'il attend le modèle.

Deux ressources étaient retenues sans borne, et aucune des deux n'appartient au
chatbot seul.

1. **Un worker du pool de threads.** Le endpoint est un `def` synchrone, donc
   servi depuis un pool. Aucun délai n'était passé au SDK : une connexion ouverte
   qui ne répond jamais retenait son worker indéfiniment. Quelques-unes suffisent
   à remplir le pool, et c'est l'API entière qui cesse de répondre.

2. **Une connexion PostgreSQL.** La session venait de `Depends(get_db)`, donc
   empruntée au pool avant le premier appel au modèle et rendue après le dernier,
   alors que la base n'est touchée qu'à la toute fin, pour deux `INSERT`. Le pool
   fait 5 connexions plus 10 d'appoint : une quinzaine de conversations
   simultanées l'épuisait, et l'authentification, les dossiers et les
   notifications attendaient derrière un chatbot en train d'écouter Mistral.
"""

from __future__ import annotations

import inspect
import json

import pytest

from app.modules.chatbot import history, router, service
from app.modules.chatbot.rag import llm_client
from app.modules.chatbot.schemas import ChatbotResponseSchema


# --- 1. Le délai d'appel au modèle -------------------------------------------


def test_le_client_mistral_est_construit_avec_un_delai(monkeypatch):
    """Sans délai, un appel qui ne répond jamais retient son worker pour toujours."""
    construits = {}

    class FauxMistral:
        def __init__(self, **kwargs):
            construits.update(kwargs)

    monkeypatch.setattr(llm_client, "Mistral", FauxMistral)
    monkeypatch.setattr(llm_client, "_mistral_client", None)
    monkeypatch.setenv("MISTRAL_API_KEY", "clef-de-test")

    llm_client.get_mistral_client()

    assert construits["timeout_ms"] == int(llm_client._TIMEOUT_S * 1000)
    assert construits["timeout_ms"] > 0


def test_le_delai_est_borne_et_raisonnable():
    """Assez long pour une génération, assez court pour que le citoyen ne reste pas
    suspendu à une connexion morte."""
    assert 5 <= llm_client._TIMEOUT_S <= 60


def test_un_delai_depasse_nest_pas_confondu_avec_un_contrat_viole(monkeypatch):
    """Une panne réseau remonte telle quelle : ce n'est pas un modèle qui répond à
    côté, et elle ne doit pas déclencher la relance prévue pour le JSON malformé."""
    appels = []

    def trop_lent(**_kwargs):
        appels.append(1)
        raise TimeoutError("Read timed out")

    monkeypatch.setattr(llm_client, "call_llm", trop_lent)

    with pytest.raises(TimeoutError):
        llm_client.call_llm_structured([{"role": "user", "content": "x"}])
    assert len(appels) == 1, "un délai dépassé ne doit pas être retenté : on doublerait l'attente"


def test_un_delai_depasse_degrade_en_message_et_est_consigne(monkeypatch, capsys):
    """Le citoyen reçoit le message d'indisponibilité, l'équipe reçoit la trace."""
    class GrapheQuiExpire:
        def invoke(self, _etat):
            raise TimeoutError("Read timed out")

    monkeypatch.setattr(service, "_get_graph", lambda: GrapheQuiExpire())

    reponse = service.answer_question("quels documents ?", None, None)

    assert "momentanément indisponible" in reponse.answer
    erreurs = [
        json.loads(l) for l in capsys.readouterr().err.splitlines() if l.startswith("{")
    ]
    assert any("TimeoutError" in e["context"].get("error", "") for e in erreurs)


# --- 2. La connexion à la base -----------------------------------------------


def test_le_tour_de_conversation_ne_reserve_plus_de_connexion(monkeypatch):
    """La preuve la plus directe : l'endpoint n'a plus de dépendance de session."""
    parametres = inspect.signature(router.send_message).parameters
    assert "db" not in parametres


def test_la_lecture_de_lhistorique_garde_sa_session():
    """Elle, c'est une pure lecture : aucun appel au modèle dans ce chemin, la session
    de requête y est parfaitement adaptée."""
    assert "db" in inspect.signature(router.get_history).parameters


class _FausseSession:
    """Enregistre le cycle de vie, pour vérifier qu'il est bien court."""

    def __init__(self, journal):
        self.journal = journal

    def __enter__(self):
        self.journal.append("ouverte")
        return self

    def __exit__(self, *_exc):
        self.journal.append("fermee")
        return False

    def add(self, _obj):
        self.journal.append("add")

    def commit(self):
        self.journal.append("commit")


def _reponse():
    return ChatbotResponseSchema(answer="Voici la réponse.", sources=[])


def test_record_turn_ouvre_et_referme_sa_propre_session(monkeypatch):
    journal: list[str] = []
    monkeypatch.setattr(history, "SessionLocal", lambda: _FausseSession(journal))

    history.record_turn(user_id=1, question="quels documents ?", response=_reponse())

    assert journal == ["ouverte", "add", "add", "commit", "fermee"]


def test_la_session_est_refermee_meme_si_lecriture_echoue(monkeypatch, capsys):
    """Une panne d'écriture ne doit ni fuiter une connexion, ni casser une réponse déjà
    calculée et déjà montrée au citoyen."""
    journal: list[str] = []

    class SessionQuiEchoue(_FausseSession):
        def commit(self):
            raise RuntimeError("base indisponible")

    monkeypatch.setattr(history, "SessionLocal", lambda: SessionQuiEchoue(journal))

    history.record_turn(user_id=1, question="q", response=_reponse())  # ne lève pas

    assert journal[-1] == "fermee", "la connexion est rendue au pool"
    assert "base indisponible" in capsys.readouterr().err


def test_record_turn_ne_prend_plus_de_session_en_parametre():
    """Signature volontairement changée : personne ne doit pouvoir lui repasser la
    session longue du routeur."""
    assert "db" not in inspect.signature(history.record_turn).parameters
