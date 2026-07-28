"""
Modèle de session de profilage.

Structure de données en mémoire décrivant l'état d'une interview APL : le
profil partiel en cours de construction, l'historique des questions, la
question restée en attente de réponse et les compteurs du harness. Persistée
par le `SessionStore` (couche repositories) — ici on ne décrit que la forme.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.modules.profiling.schemas.profil import ProfilPartiel

SESSION_TTL_SECONDS = 30 * 60


@dataclass
class Session:
    id: str
    profil: ProfilPartiel = field(default_factory=ProfilPartiel)
    historique_questions: list[dict] = field(default_factory=list)
    # Question en cours : indispensable pour ne pas avancer lorsqu'une réponse
    # libre demande une clarification ou est hors sujet.
    question_en_attente: dict | None = None
    nombre_tours: int = 0
    mode_vocal: bool = False
    profil_complet: bool = False
    derniere_activite: float = field(default_factory=time.time)
