"""
Contrat de sortie strict imposé au LLM à chaque tour de la boucle A3
(cf. Harness — Couche 03 : validation de sortie, retry auto si non conforme).
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.features.citizen.profiling.schemas.profil import CHAMPS_PROFILAGE


class ProchaineAction(str, Enum):
    poser_question = "poser_question"
    profil_complet = "profil_complet"


class TypeReponse(str, Enum):
    texte_libre = "texte_libre"
    choix_multiple = "choix_multiple"


class TypeReponsePercue(str, Enum):
    reponse_valide = "reponse_valide"
    demande_clarification = "demande_clarification"
    hors_sujet = "hors_sujet"


class AnalyseReponse(BaseModel):
    """Interprétation humaine d'une réponse libre, séparée du prochain tour."""

    type_reponse_percue: TypeReponsePercue
    valeur_extraite: Any | None = None
    message_si_clarification: str | None = None
    repeter_meme_question: bool


class TourAgent(BaseModel):
    """Sortie brute attendue du LLM à chaque tour — validée avant d'être renvoyée au front."""

    model_config = {"extra": "forbid"}

    prochaine_action: ProchaineAction
    question: Optional[str] = None
    type_reponse: Optional[TypeReponse] = None
    options: Optional[list[str]] = None
    champ_cible: Optional[str] = None
    # Justification métier de la question posée — traçabilité utile pour l'audit
    # et pour vérifier que le LLM applique bien la cascade et non une réponse
    # générique (cf. demande explicite de l'utilisateur).
    regle_justifiant_la_question: Optional[str] = None

    @model_validator(mode="after")
    def _coherence(self) -> "TourAgent":
        if self.prochaine_action is ProchaineAction.poser_question:
            if not self.question or not self.type_reponse or not self.champ_cible:
                raise ValueError(
                    "poser_question exige question, type_reponse et champ_cible"
                )
            if self.champ_cible not in CHAMPS_PROFILAGE:
                raise ValueError(f"champ_cible inconnu: {self.champ_cible}")
            if self.type_reponse is TypeReponse.choix_multiple and not self.options:
                raise ValueError("choix_multiple exige une liste options non vide")
        return self


class TourResponse(BaseModel):
    """Réponse HTTP renvoyée au frontend après un tour de la boucle."""

    session_id: str
    tour: TourAgent
    profil_partiel: dict
    nombre_tours: int
    limite_tours: int
    profil_complet: bool
    source: Literal["llm", "fallback", "deterministe"] = "deterministe"
    # Ajout rétrocompatible : absent au premier tour, présent après une réponse.
    analyse_reponse: AnalyseReponse | None = None
