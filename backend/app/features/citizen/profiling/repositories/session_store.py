"""
Store de session en mémoire, TTL 30 min — reproduit le contrat de Redis 7
(Couche 07 de l'architecture cible) sans dépendance externe, pour que le
projet tourne "out of the box". Remplacer par un vrai client Redis revient à
ré-implémenter cette classe avec la même interface.
"""
from __future__ import annotations

import time
import uuid
from threading import Lock

from app.features.citizen.profiling.models.session import SESSION_TTL_SECONDS, Session


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = Lock()

    def creer(self, mode_vocal: bool = False) -> Session:
        self._purger_expirees()
        session = Session(id=str(uuid.uuid4()), mode_vocal=mode_vocal)
        with self._lock:
            self._sessions[session.id] = session
        return session

    def obtenir(self, session_id: str) -> Session:
        self._purger_expirees()
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise KeyError(session_id)
        session.derniere_activite = time.time()
        return session

    def _purger_expirees(self) -> None:
        maintenant = time.time()
        with self._lock:
            expirees = [
                sid
                for sid, s in self._sessions.items()
                if maintenant - s.derniere_activite > SESSION_TTL_SECONDS
            ]
            for sid in expirees:
                del self._sessions[sid]


# Singleton applicatif — un seul process, comme un pool Redis partagé.
session_store = SessionStore()
