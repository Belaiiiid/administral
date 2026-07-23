"""
A3 — Agent de profilage adaptatif, orchestré par un graphe LangGraph.

Chaque appel HTTP correspond à UN tour de la boucle (le "bouclage" réel se
fait côté citoyen : question -> réponse -> nouvelle question -> ...).
Ce module encapsule ce qui se passe *à l'intérieur* d'un tour :

    générer_tour (LLM ou règles) --invalide--> retry (max 2) --invalide--> erreur
                                  --valide--> fin du tour

La limite de 12 questions et l'appel à evaluer_completude_profil (A4) restent
du ressort du harness (app/core/harness.py), PAS de ce graphe : le LLM ne
décide jamais seul d'arrêter l'interview.
"""
from __future__ import annotations

from typing import Optional, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from app.features.citizen.profiling.services.llm import generer_tour, prochain_champ_attendu
from app.features.citizen.profiling.schemas.agent import TourAgent
from app.features.citizen.profiling.schemas.profil import ProfilPartiel

MAX_RETRY = 2  # cf Harness Couche 03 : "retry auto si non conforme (max 2)"


class EtatTour(TypedDict):
    profil: ProfilPartiel
    historique: list[dict]
    tentative: int
    sortie: Optional[TourAgent]
    source: Optional[str]
    erreur: Optional[str]


async def _noeud_generer(etat: EtatTour) -> EtatTour:
    brut, source = await generer_tour(etat["profil"], etat["historique"])
    etat["source"] = source
    try:
        tour = TourAgent.model_validate(brut)
    except ValidationError as exc:
        etat["tentative"] += 1
        etat["erreur"] = str(exc)
        etat["sortie"] = None
        return etat

    attendu = prochain_champ_attendu(etat["profil"])
    if attendu is not None and (
        tour.prochaine_action.value != "poser_question"
        or tour.champ_cible != attendu["champ_cible"]
    ):
        etat["tentative"] += 1
        etat["erreur"] = (
            f"Cascade non respectée : attendu {attendu['champ_cible']}, "
            f"reçu {tour.champ_cible}"
        )
        etat["sortie"] = None
        return etat

    etat["sortie"] = tour
    etat["erreur"] = None
    return etat


def _routage(etat: EtatTour) -> str:
    if etat["sortie"] is not None:
        return END
    if etat["tentative"] > MAX_RETRY:
        return END
    return "generer"


def _construire_graphe():
    graphe = StateGraph(EtatTour)
    graphe.add_node("generer", _noeud_generer)
    graphe.set_entry_point("generer")
    graphe.add_conditional_edges("generer", _routage, {"generer": "generer", END: END})
    return graphe.compile()


_GRAPHE = _construire_graphe()


async def executer_tour_agent(
    profil: ProfilPartiel, historique: list[dict]
) -> tuple[TourAgent, str]:
    """Exécute un tour complet (avec retry interne) et renvoie (TourAgent validé, source).

    `source` vaut `"llm"` si Mistral a répondu, `"fallback"` si le générateur
    déterministe a été utilisé (autorisé uniquement par APL_ALLOW_FALLBACK).

    Lève ValueError si le LLM ne produit toujours pas de sortie conforme après
    MAX_RETRY tentatives — le harness (couche API) doit alors renvoyer une 502
    plutôt que de transmettre une sortie non garantie au frontend.
    """
    etat_initial: EtatTour = {
        "profil": profil,
        "historique": historique,
        "tentative": 0,
        "sortie": None,
        "source": None,
        "erreur": None,
    }
    resultat = await _GRAPHE.ainvoke(etat_initial)
    if resultat["sortie"] is None:
        raise ValueError(
            f"Sortie LLM non conforme après {MAX_RETRY} tentatives: {resultat['erreur']}"
        )
    return resultat["sortie"], resultat["source"] or "inconnu"
