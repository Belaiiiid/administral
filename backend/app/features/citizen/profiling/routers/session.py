from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.features.citizen.profiling.repositories.session_store import session_store
from app.features.citizen.profiling.schemas.profil import ProfilPatch, ProfilPartiel

router = APIRouter(prefix="/session", tags=["session"])


class CreerSessionBody(BaseModel):
    mode_vocal: bool = False  # posé par A1, transmis ici pour cohérence de session


class SessionOut(BaseModel):
    session_id: str
    mode_vocal: bool
    profil_partiel: dict


@router.post("", response_model=SessionOut)
def creer_session(body: CreerSessionBody) -> SessionOut:
    session = session_store.creer(mode_vocal=body.mode_vocal)
    return SessionOut(
        session_id=session.id,
        mode_vocal=session.mode_vocal,
        profil_partiel=session.profil.model_dump(mode="json"),
    )


@router.get("/{session_id}/profil", response_model=SessionOut)
def lire_profil(session_id: str) -> SessionOut:
    try:
        session = session_store.obtenir(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")
    return SessionOut(
        session_id=session.id,
        mode_vocal=session.mode_vocal,
        profil_partiel=session.profil.model_dump(mode="json"),
    )


@router.patch("/{session_id}/profil", response_model=SessionOut)
def maj_profil(session_id: str, patch: ProfilPatch) -> SessionOut:
    """Mise à jour incrémentale : seuls les champs fournis (non None) sont écrits,
    les champs déjà renseignés ne sont jamais écrasés par une valeur absente."""
    try:
        session = session_store.obtenir(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")

    donnees = patch.model_dump(exclude_none=True)
    nouveau = session.profil.model_copy(update=donnees)
    # Revalide l'objet entier (contraintes de champ) avant de committer.
    session.profil = ProfilPartiel.model_validate(nouveau.model_dump())

    return SessionOut(
        session_id=session.id,
        mode_vocal=session.mode_vocal,
        profil_partiel=session.profil.model_dump(mode="json"),
    )
