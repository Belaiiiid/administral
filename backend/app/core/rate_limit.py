"""Limitation de débit par appelant, en mémoire.

POURQUOI. `POST /citizen/chatbot/message` est public par choix produit — un
citoyen doit pouvoir poser sa question sans créer de compte — et chaque tour
déclenche un ou deux appels facturés à Mistral. Rien ne bornait le débit. Un
script pouvait donc vider le budget du projet, et comme chaque requête occupe
plusieurs secondes un worker du pool de threads, le même script suffisait à
rendre TOUTE l'API muette. Non authentifié, non compté, et payant : c'est la
combinaison à ne pas laisser en production.

EN MÉMOIRE, ET C'EST COHÉRENT. Des compteurs en mémoire ne sont exacts que dans
un seul processus. Ce n'est pas une limite acceptée ici par facilité : le
déploiement est DÉJÀ contraint à un seul worker par le magasin vectoriel
embarqué, qui verrouille son dossier (voir `rag_pipeline`). Le limiteur a donc
exactement la même portée que le reste du moteur. Le jour où Qdrant passera en
mode serveur et où l'on montera à plusieurs workers, ces compteurs devront
déménager dans Redis LE MÊME JOUR — sinon la limite sera silencieusement
multipliée par le nombre de processus.

FENÊTRE GLISSANTE, pas fenêtre fixe : une fenêtre fixe autorise deux fois le
quota à cheval sur sa frontière (dix requêtes à 10h00:59, dix à 10h01:00). On
garde donc l'horodatage de chaque requête, ce qui reste peu coûteux : quelques
centaines d'entrées par appelant au maximum, purgées au passage.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from app.core.exceptions import DomainError

_MINUTE = 60.0
_JOUR = 24 * 60 * 60.0


class RateLimitExceeded(DomainError):
    """Trop de requêtes pour cet appelant.

    429 et non 503 : le service va bien, c'est CET appelant qui doit ralentir.
    La distinction compte pour qui lit les logs — un pic de 429 est un abus ou un
    client qui boucle, un pic de 503 est une panne."""

    status_code = 429
    code = "RATE_LIMIT_EXCEEDED"


@dataclass(frozen=True)
class Quota:
    """Deux bornes, pour deux abus différents.

    La borne par minute arrête le script qui martèle ; la borne par jour arrête
    celui qui s'installe à un rythme discret. L'une sans l'autre laisse passer
    la moitié du problème."""

    par_minute: int
    par_jour: int


#: Au-delà, on purge les appelants inactifs. Sans ce ménage, un dictionnaire
#: indexé par IP grossit indéfiniment sous un balayage d'adresses — la limite
#: deviendrait elle-même le moyen d'épuiser la mémoire.
_MAX_APPELANTS = 10_000


class LimiteurMemoire:
    """Compteur par appelant, protégé par un verrou.

    Le verrou n'est pas décoratif : le endpoint est servi depuis un pool de
    threads, donc plusieurs requêtes du même appelant peuvent se compter
    simultanément. Sans lui, deux requêtes lisant le même compteur avant que
    l'une n'écrive passeraient toutes les deux."""

    def __init__(self) -> None:
        self._appels: dict[str, deque[float]] = {}
        self._verrou = threading.Lock()

    def verifier(self, cle: str, quota: Quota, *, maintenant: float | None = None) -> None:
        """Enregistre un appel, ou lève `RateLimitExceeded`.

        Un appel refusé n'est PAS enregistré : sinon un client qui insiste
        repousserait indéfiniment sa propre fenêtre et resterait bloqué bien
        au-delà de la minute — une punition que le quota n'a jamais annoncée."""
        instant = time.monotonic() if maintenant is None else maintenant

        with self._verrou:
            historique = self._appels.setdefault(cle, deque())
            while historique and instant - historique[0] > _JOUR:
                historique.popleft()

            if len(historique) >= quota.par_jour:
                raise RateLimitExceeded(
                    "Vous avez atteint le nombre de questions autorisées pour aujourd'hui. "
                    "Réessayez demain, ou connectez-vous à votre compte."
                )

            recents = sum(1 for t in historique if instant - t <= _MINUTE)
            if recents >= quota.par_minute:
                raise RateLimitExceeded(
                    "Vous envoyez trop de messages à la suite. "
                    "Patientez une minute avant de réessayer."
                )

            historique.append(instant)
            if len(self._appels) > _MAX_APPELANTS:
                self._purger(instant)

    def _purger(self, instant: float) -> None:
        """Oublie les appelants sans aucun appel depuis 24 h. Appelé sous verrou."""
        inactifs = [
            cle
            for cle, historique in self._appels.items()
            if not historique or instant - historique[-1] > _JOUR
        ]
        for cle in inactifs:
            del self._appels[cle]

    def reinitialiser(self) -> None:
        """Pour les tests : repartir d'un compteur vierge."""
        with self._verrou:
            self._appels.clear()
