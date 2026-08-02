"""Le contrat JSON des appels LLM de l'assistant (`llm_client.call_llm_structured`).

Ce que ces tests protègent : une réponse illisible du modèle ne doit JAMAIS
ressortir comme une réponse au citoyen. L'ancien repli renvoyait
`{"type": "answer", "text": <texte brut>}`, indistinguable d'une vraie réponse
pour les appelants — un JSON tronqué finissait affiché tel quel, et sur la
branche RAG avec des sources officielles épinglées dessous. Une erreur qui a
l'air d'une réponse sourcée est le pire des résultats possibles ici.

Aucun appel réseau : `call_llm` est remplacé par une fonction qui rend le texte
brut voulu. Ce qui est testé est la frontière entre « le modèle a tenu le
contrat » et « il ne l'a pas tenu », rien d'autre.
"""

from __future__ import annotations

import pytest

from app.modules.chatbot.rag import llm_client
from app.modules.chatbot.rag.llm_client import (
    EXPLAIN_OPTION,
    SKIP_OPTION,
    LlmContractError,
    call_llm_structured,
)

MESSAGES = [{"role": "user", "content": "peu importe"}]


@pytest.fixture
def reponses_llm(monkeypatch):
    """Fait rendre au modèle les textes bruts donnés, dans l'ordre, et compte les appels."""

    def _installer(*bruts: str | None):
        appels: list[int] = []

        def faux_call_llm(**_kwargs):
            appels.append(1)
            return bruts[min(len(appels) - 1, len(bruts) - 1)]

        monkeypatch.setattr(llm_client, "call_llm", faux_call_llm)
        return appels

    return _installer


# --- Le contrat est tenu -----------------------------------------------------


def test_reponse_valide_est_rendue(reponses_llm):
    appels = reponses_llm('{"type": "answer", "text": "Voici la réponse", "repondu": true}')
    resultat = call_llm_structured(MESSAGES)
    assert resultat["type"] == "answer"
    assert resultat["text"] == "Voici la réponse"
    assert resultat["repondu"] is True
    assert len(appels) == 1, "une réponse valide ne doit pas déclencher de relance"


def test_clarification_recoit_les_options_standard(reponses_llm):
    """Le code garantit « expliquez-moi » et « passer », quoi qu'ait produit le modèle."""
    reponses_llm('{"type": "clarification", "text": "Locataire ?", "options": ["Oui", "Non"]}')
    resultat = call_llm_structured(MESSAGES)
    assert resultat["options"] == ["Oui", "Non", EXPLAIN_OPTION, SKIP_OPTION]


def test_clarification_a_reponse_libre_na_pas_doptions(reponses_llm):
    reponses_llm('{"type": "clarification", "text": "Quel loyer ?", "options": null}')
    assert call_llm_structured(MESSAGES)["options"] is None


# --- Le contrat n'est pas tenu -----------------------------------------------


ILLISIBLES = [
    pytest.param('{"type": "answer", "text": "Voici ce que j\'ai comp', id="json_tronque"),
    pytest.param("Je pense que vous avez droit à l'APL.", id="prose_au_lieu_de_json"),
    pytest.param('{"type": "answer"}', id="text_manquant"),
    pytest.param('{"type": "answer", "text": ""}', id="text_vide"),
    pytest.param('{"type": "autre_chose", "text": "..."}', id="type_inconnu"),
    pytest.param('["pas", "un", "objet"]', id="json_valide_mais_pas_un_objet"),
    pytest.param("", id="reponse_vide"),
    pytest.param(None, id="rien_du_tout"),
]


@pytest.mark.parametrize("brut", ILLISIBLES)
def test_reponse_illisible_leve(reponses_llm, brut):
    reponses_llm(brut)
    with pytest.raises(LlmContractError):
        call_llm_structured(MESSAGES)


def test_le_texte_brut_ne_devient_jamais_une_reponse(reponses_llm):
    """La régression exacte que ce correctif visait."""
    brut = '{"type": "answer", "text": "Voici ce que j\'ai compris", "profil": {"situation'
    reponses_llm(brut)
    with pytest.raises(LlmContractError):
        call_llm_structured(MESSAGES)


def test_une_seule_relance_avant_dabandonner(reponses_llm):
    appels = reponses_llm("pas du json")
    with pytest.raises(LlmContractError):
        call_llm_structured(MESSAGES)
    assert len(appels) == 2, "on relance une fois, pas davantage"


def test_la_relance_rattrape_un_accident(reponses_llm):
    """Le cas courant : le premier jet est mal formé, le second passe."""
    appels = reponses_llm("pas du json", '{"type": "answer", "text": "Réponse", "repondu": true}')
    resultat = call_llm_structured(MESSAGES)
    assert resultat["text"] == "Réponse"
    assert len(appels) == 2


def test_le_message_derreur_ne_sert_quau_diagnostic(reponses_llm):
    """Le texte brut est gardé pour le journal, tronqué — jamais rendu à l'appelant."""
    reponses_llm("x" * 500)
    with pytest.raises(LlmContractError) as capture:
        call_llm_structured(MESSAGES)
    assert "x" * 200 in str(capture.value)
    assert "x" * 300 not in str(capture.value)


def test_une_panne_dapi_nest_pas_une_erreur_de_contrat(monkeypatch):
    """Un modèle injoignable et un modèle qui répond à côté ne se traitent pas pareil :
    le premier remonte tel quel vers le filet de `service.answer_question`."""

    def api_en_panne(**_kwargs):
        raise RuntimeError("503 Service Unavailable")

    monkeypatch.setattr(llm_client, "call_llm", api_en_panne)
    with pytest.raises(RuntimeError) as capture:
        call_llm_structured(MESSAGES)
    assert not isinstance(capture.value, LlmContractError)
