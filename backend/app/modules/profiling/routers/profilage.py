from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import io
# pyrefly: ignore [missing-import]
import pdfplumber

from app.modules.profiling.services.coercion import analyser_reponse
from app.modules.profiling.services.document_extraction import extraire_profil_depuis_document
from app.modules.profiling.services.harness import LIMITE_TOURS, jouer_tour
from app.modules.profiling.services.llm import LLMError
from app.modules.profiling.repositories.session_store import session_store
from app.modules.profiling.schemas.agent import AnalyseReponse, ProchaineAction, TourAgent, TourResponse, TypeReponsePercue
from app.modules.profiling.schemas.profil import ProfilPartiel

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


@router.post("/{session_id}/profilage/upload", response_model=TourResponse)
async def upload_document(session_id: str, file: UploadFile = File(...)) -> TourResponse:
    try:
        session = session_store.obtenir(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")

    filename_lower = file.filename.lower() if file.filename else ""
    is_pdf = filename_lower.endswith(".pdf")
    is_image = any(filename_lower.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"])

    if not (is_pdf or is_image):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF et les images (JPG, PNG) sont supportés.")
    
    try:
        content = await file.read()
        from fastapi.concurrency import run_in_threadpool
        from app.modules.citizen.extraction import extract_text

        mime_type = file.content_type or ("application/pdf" if is_pdf else "image/jpeg")
        result = await run_in_threadpool(extract_text, content, mime_type)
        if result.error:
            raise HTTPException(status_code=400, detail=result.error)
        texte_extrait = result.text

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la lecture du document: {exc}")
    
    if not texte_extrait.strip():
        raise HTTPException(status_code=400, detail="Aucun texte n'a pu être extrait du document.")

    # Extraire les infos
    try:
        donnees_extraites = await extraire_profil_depuis_document(texte_extrait, session.profil)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'analyse du document: {exc}")

    if donnees_extraites:
        nouveau = session.profil.model_copy(update=donnees_extraites)
        session.profil = ProfilPartiel.model_validate(nouveau.model_dump())
        # Le contexte vient de changer, on reset la question en attente
        session.question_en_attente = None

    # Calcule le tour suivant
    try:
        tour, source = await jouer_tour(session)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"LLM indisponible: {exc}")
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    analyse = AnalyseReponse(
        type_reponse_percue=TypeReponsePercue.reponse_valide,
        valeur_extraite="Document analysé",
        message_si_clarification=None,
        repeter_meme_question=False,
    )

    return _response(session, tour, source, analyse)


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
