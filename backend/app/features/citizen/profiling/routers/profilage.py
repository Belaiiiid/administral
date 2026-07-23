from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.features.citizen.profiling.services.coercion import analyser_reponse
from app.features.citizen.profiling.services.harness import LIMITE_TOURS, jouer_tour
from app.features.citizen.profiling.services.llm import LLMError
from app.features.citizen.profiling.repositories.session_store import session_store
from app.features.citizen.profiling.schemas.agent import AnalyseReponse, ProchaineAction, TourAgent, TourResponse, TypeReponsePercue
from app.features.citizen.profiling.schemas.profil import ProfilPartiel

router = APIRouter(prefix="/session", tags=["profilage"])


class TourBody(BaseModel):
    """Réponse du citoyen à la question précédente (absente pour le tout premier tour)."""

    champ_cible: str | None = None
    valeur: str | None = None


@router.post("/{session_id}/profilage/tour", response_model=TourResponse)
async def tour_profilage(session_id: str, body: TourBody) -> TourResponse:
    try:
        session = session_store.obtenir(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")

    # 1. Interprète la réponse au tour précédent. Une clarification ou une
    # réponse hors sujet ne doit jamais produire une erreur technique : on
    # conserve le même tour et le profil reste inchangé.
    if body.champ_cible is not None:
        if body.valeur is None:
            raise HTTPException(status_code=422, detail="`valeur` requise avec `champ_cible`")

        attente = session.question_en_attente
        if attente is None or body.champ_cible != attente.get("champ_cible"):
            analyse = AnalyseReponse(
                type_reponse_percue=TypeReponsePercue.hors_sujet,
                valeur_extraite=None,
                message_si_clarification=None,
                repeter_meme_question=True,
            )
            tour = TourAgent.model_validate(attente) if attente else TourAgent(
                prochaine_action=ProchaineAction.profil_complet
            )
            return _response(session, _reformuler_question(tour), "deterministe", analyse)

        analyse = analyser_reponse(body.champ_cible, body.valeur)
        if analyse.type_reponse_percue is not TypeReponsePercue.reponse_valide:
            return _response(session, TourAgent.model_validate(attente), "deterministe", analyse)

        try:
            nouveau = session.profil.model_copy(
                update={body.champ_cible: analyse.valeur_extraite}
            )
            session.profil = ProfilPartiel.model_validate(nouveau.model_dump())
        except Exception:
            analyse = AnalyseReponse(
                type_reponse_percue=TypeReponsePercue.hors_sujet,
                valeur_extraite=None,
                message_si_clarification=None,
                repeter_meme_question=True,
            )
            return _response(
                session,
                _reformuler_question(TourAgent.model_validate(attente)),
                "deterministe",
                analyse,
            )
        session.question_en_attente = None

    # 2. Calcule le tour suivant via le harness (garde-fous + LLM/A3).
    try:
        tour, source = await jouer_tour(session)
    except LLMError as exc:
        # Fallback interdit (APL_ALLOW_FALLBACK=false) et Mistral inatteignable :
        # on remonte l'erreur telle quelle plutôt que de servir une réponse bidon.
        raise HTTPException(status_code=502, detail=f"LLM indisponible: {exc}")
    except ValueError as exc:
        # Le LLM n'a pas produit de sortie conforme après retries -> 502.
        raise HTTPException(status_code=502, detail=str(exc))

    return _response(session, tour, source, analyse if body.champ_cible is not None else None)


def _response(
    session, tour: TourAgent, source: str, analyse: AnalyseReponse | None = None
) -> TourResponse:
    return TourResponse(
        session_id=session.id,
        tour=tour,
        profil_partiel=session.profil.model_dump(mode="json"),
        nombre_tours=session.nombre_tours,
        limite_tours=LIMITE_TOURS,
        profil_complet=tour.prochaine_action is ProchaineAction.profil_complet,
        source=source,  # type: ignore[arg-type]
        analyse_reponse=analyse,
    )


def _reformuler_question(tour: TourAgent) -> TourAgent:
    """Garde le même champ mais reformule sans jamais exposer une erreur brute."""
    if tour.question is None:
        return tour
    return tour.model_copy(
        update={"question": f"Pour vous aider, répondez simplement à ceci : {tour.question}"}
    )
