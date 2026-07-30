"""
Harness — contrôle et garde-fous autour de la boucle de profilage (A3).

Le LLM ne décide JAMAIS seul d'arrêter l'interview :

1. Avant tout appel LLM, on regarde le référentiel officiel : si le profil
   déclenche une règle d'exclusion (bailleur ascendant/descendant, propriétaire
   occupant, hébergé à titre gratuit), l'interview s'arrête tout de suite —
   inutile de continuer à interroger si le dossier ne peut de toute façon pas
   aboutir à une APL locative.

2. On vérifie ensuite `evaluer_completude_profil` (A4, déterministe) : si tous
   les champs requis pour caractériser le cas sont là, on clôt.

3. On applique une limite stricte de 11 questions (le maximum réellement
   atteint par un parcours complet, cf. `evaluer_completude_profil`), comptée
   ici et non par le LLM (cf. DoD A3, RULES §2). Avec une limite à 12, le
   profil devenait toujours complet à la 11ᵉ question — le plafond n'était
   jamais atteint — et le frontend affichait "11/12" au lieu de "11/11".

Ce module est le point d'entrée unique utilisé par l'API : il compose A3 + A4
et propage la source ("llm" ou "fallback") au frontend, pour qu'on puisse
vérifier concrètement que Mistral est bien appelé (cf. brief bug n°2).
"""
from __future__ import annotations

from app.modules.profiling.services.agent_graph import executer_tour_agent
from app.modules.profiling.services.completude import evaluer_completude_profil
from app.modules.profiling.services.knowledge import rechercher_exclusion
from app.modules.profiling.models.session import Session
from app.modules.profiling.schemas.agent import ProchaineAction, TourAgent

LIMITE_TOURS = 11


async def jouer_tour(session: Session) -> tuple[TourAgent, str]:
    """Renvoie (prochain TourAgent, source) pour cette session.

    `source` vaut `"deterministe"` quand le harness a court-circuité l'appel
    LLM (exclusion, complétude atteinte, plafond de tours), `"llm"` quand
    Mistral a répondu, `"fallback"` quand le générateur de règles a répondu.
    """
    # Garde-fou n°0 (nouveau) : règle d'exclusion officielle. Inutile de
    # continuer à poser des questions si le dossier ne peut de toute façon
    # pas ouvrir de droit à l'APL locative.
    exclusion = rechercher_exclusion(session.profil)
    if exclusion is not None:
        session.profil_complet = True
        session.question_en_attente = None
        return TourAgent(prochaine_action=ProchaineAction.profil_complet), "deterministe"

    # Garde-fou n°1 : le profil est-il déjà exploitable ?
    if evaluer_completude_profil(session.profil):
        session.profil_complet = True
        session.question_en_attente = None
        return TourAgent(prochaine_action=ProchaineAction.profil_complet), "deterministe"

    # Garde-fou n°2 : plafond de tours, imposé par le harness (jamais le LLM).
    if session.nombre_tours >= LIMITE_TOURS:
        session.profil_complet = True
        session.question_en_attente = None
        return TourAgent(prochaine_action=ProchaineAction.profil_complet), "deterministe"

    # Sinon, on laisse le LLM choisir LA prochaine question (via le graphe A3).
    tour, source = await executer_tour_agent(session.profil, session.historique_questions)

    if tour.prochaine_action is ProchaineAction.profil_complet:
        session.profil_complet = True
        session.question_en_attente = None
    else:
        session.nombre_tours += 1
        session.historique_questions.append(
            {
                "champ_cible": tour.champ_cible,
                "question": tour.question,
                "type_reponse": tour.type_reponse.value if tour.type_reponse else None,
            }
        )
        session.question_en_attente = tour.model_dump(mode="json")

    return tour, source
