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

from app.modules.profiling.services.completude import champs_manquants
from app.modules.profiling.services.llm import generer_tour, prochain_champ_attendu
from app.modules.profiling.schemas.agent import ProchaineAction, TourAgent
from app.modules.profiling.schemas.profil import ProfilPartiel

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

    # Tant qu'il reste des champs à collecter, le LLM DOIT poser une question,
    # et le champ visé doit appartenir à la frontière des champs réellement en
    # attente dans la cascade (`champs_manquants` applique déjà les conditions de
    # branche + exclusions). On laisse ainsi le LLM choisir l'ORDRE entre les
    # branches encore ouvertes (conformément à l'intention du harness — « on
    # laisse le LLM choisir LA prochaine question »), tout en interdisant qu'il
    # invente un champ hors cascade ou clôture prématurément. La complétude (A4)
    # et le plafond de 12 tours restent, eux, du seul ressort du harness.
    champs_valides = set(champs_manquants(etat["profil"]))
    if champs_valides and (
        tour.prochaine_action.value != "poser_question"
        or tour.champ_cible not in champs_valides
    ):
        etat["tentative"] += 1
        etat["erreur"] = (
            f"Cascade non respectée : attendu l'un de {sorted(champs_valides)}, "
            f"reçu {tour.champ_cible} ({tour.prochaine_action.value})"
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

    `source` vaut `"llm"` si Mistral a répondu et respecté la cascade, sinon
    `"deterministe"` : le LLM est interrogé à CHAQUE tour, mais s'il ne produit
    pas de question conforme après MAX_RETRY tentatives (il clôt trop tôt ou
    saute un champ « traînard » — ville, contrôle bailleur-proche…), on ne
    renvoie pas une 502 qui bloquerait l'entretien : on retombe sur LA question
    déterministe suivante (`prochain_champ_attendu`), garantie valide par
    construction. Le LLM reste le pilote dès qu'il redevient cohérent ; les
    garde-fous (complétude A4, plafond de 12 tours, exclusions) demeurent au
    seul ressort du harness — jamais du LLM.
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
        secours = prochain_champ_attendu(profil)
        if secours is not None:
            return TourAgent.model_validate(secours), "deterministe"
        return TourAgent(prochaine_action=ProchaineAction.profil_complet), "deterministe"
    return resultat["sortie"], resultat["source"] or "inconnu"
