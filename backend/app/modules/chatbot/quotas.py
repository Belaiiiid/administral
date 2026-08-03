"""Combien de questions un appelant peut poser, et à qui on les compte.

La mécanique est dans `core.rate_limit` ; ce module ne porte que la POLITIQUE,
qui est propre à l'assistant : c'est le seul endpoint public du projet dont
chaque appel coûte de l'argent à un tiers.

QUI EST L'APPELANT. Un compte quand il y en a un, l'adresse IP sinon. Le compte
est la meilleure clé disponible : il survit à un changement de réseau et il est
plus coûteux à multiplier qu'une adresse. L'IP est un pis-aller assumé — derrière
un partage de connexion, tout un foyer, un campus ou une médiathèque compte pour
un seul appelant. Le quota anonyme est donc fixé large exprès : il vise le script,
pas la famille qui se passe l'ordinateur.
"""

from __future__ import annotations

import os

from fastapi import Request

from app.core.logger import logger
from app.core.rate_limit import LimiteurMemoire, Quota
from app.modules.auth.models import User


def _entier(nom: str, defaut: int) -> int:
    try:
        return max(1, int(os.environ.get(nom, defaut)))
    except (TypeError, ValueError):
        return defaut


#: Anonyme : de quoi mener plusieurs conversations complètes dans la journée —
#: un entretien « documents » fait à lui seul cinq tours — sans laisser un script
#: consommer le budget.
QUOTA_ANONYME = Quota(
    par_minute=_entier("CHATBOT_ANON_PAR_MINUTE", 10),
    par_jour=_entier("CHATBOT_ANON_PAR_JOUR", 100),
)
#: Connecté : plus large, parce que la clé est plus fiable et l'appelant
#: identifiable si quelque chose tourne mal.
QUOTA_CONNECTE = Quota(
    par_minute=_entier("CHATBOT_AUTH_PAR_MINUTE", 30),
    par_jour=_entier("CHATBOT_AUTH_PAR_JOUR", 500),
)

#: `X-Forwarded-For` n'est qu'un en-tête : n'importe qui peut l'écrire. Le croire
#: sans reverse proxy devant, c'est offrir un quota neuf à chaque requête. Ne pas
#: le croire ALORS QU'il y en a un est l'erreur inverse et tout aussi visible :
#: toutes les requêtes portent alors l'IP du proxy, se comptent ensemble, et les
#: citoyens se bloquent mutuellement. D'où un réglage explicite, sans valeur
#: implicite : c'est le déploiement qui sait, pas le code.
_DERRIERE_UN_PROXY = os.environ.get("TRUST_PROXY_HEADERS", "0").lower() in ("1", "true", "yes")

_limiteur = LimiteurMemoire()


def _adresse(request: Request) -> str:
    if _DERRIERE_UN_PROXY:
        transmise = request.headers.get("x-forwarded-for")
        if transmise:
            # Premier maillon = le client d'origine ; les suivants sont les proxies.
            return transmise.split(",")[0].strip()
    return request.client.host if request.client else "inconnu"


def appelant(request: Request, user: User | None) -> tuple[str, Quota]:
    if user is not None:
        return f"compte:{user.id}", QUOTA_CONNECTE
    return f"ip:{_adresse(request)}", QUOTA_ANONYME


def verifier(request: Request, user: User | None) -> None:
    """Lève `RateLimitExceeded` (429) avant tout appel au modèle.

    Placé en dépendance du endpoint, donc AVANT le service : une requête refusée
    ne doit rien coûter, ni un appel facturé ni un worker occupé plusieurs
    secondes."""
    cle, quota = appelant(request, user)
    try:
        _limiteur.verifier(cle, quota)
    except Exception:
        # Consigné en `warn`, pas en `error` : un quota atteint est le système qui
        # fait son travail. C'est la FRÉQUENCE qui informe — un abus, ou un client
        # qui boucle, ou des limites trop serrées pour l'usage réel.
        logger.warn(
            "chatbot: quota atteint",
            {"appelant": cle, "par_minute": quota.par_minute, "par_jour": quota.par_jour},
        )
        raise


def reinitialiser() -> None:
    """Pour les tests."""
    _limiteur.reinitialiser()
