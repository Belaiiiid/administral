"""Ce que l'assistant a consommé aujourd'hui, et le disjoncteur qui l'arrête.

La limitation par appelant (`chatbot.quotas`) borne ce qu'UNE personne peut
demander. Elle ne borne pas le total : mille appelants dans leur droit coûtent
mille fois le quota. Il faut donc une seconde borne, globale celle-là, qui ne
regarde plus qui appelle mais combien on a déjà dépensé.

CE QUE FAIT LE DISJONCTEUR. Passé le budget du jour, on cesse d'appeler le
modèle et le citoyen reçoit le message d'indisponibilité — le même que pour une
panne, parce que de son point de vue c'en est une. Le service reste debout : les
branches déterministes (checklist, estimation, politesse) ne consomment aucun
jeton et continuent de répondre.

Refuser d'appeler est le comportement voulu, pas un pis-aller. Sans borne, une
journée anormale se lit sur la facture à la fin du mois, quand il est trop tard
pour décider quoi que ce soit.

LA COMPTABILITÉ EST APPROXIMATIVE PAR CONSTRUCTION, et cela suffit. Elle est en
mémoire, donc remise à zéro par un redémarrage, et un tour déjà commencé va
jusqu'au bout même s'il franchit la limite en cours de route. Un garde-fou de
dépense n'a pas besoin d'être exact : il a besoin d'exister et de se voir.
"""

from __future__ import annotations

import os
import threading
from datetime import date

from app.core.logger import logger


def _entier(nom: str, defaut: int) -> int:
    try:
        return max(0, int(os.environ.get(nom, defaut)))
    except (TypeError, ValueError):
        return defaut


#: Jetons autorisés par jour, toutes branches et tous appelants confondus.
#: 0 = pas de disjoncteur (défaut : on n'arrête pas un service sur une valeur que
#: personne n'a choisie — la borne doit être un choix de déploiement).
BUDGET_JETONS_PAR_JOUR = _entier("CHATBOT_BUDGET_JETONS_PAR_JOUR", 0)

_verrou = threading.Lock()
_jour = date.today()
_jetons = 0
_appels = 0
_ouvert_signale = False


def enregistrer(jetons_entree: int, jetons_sortie: int, modele: str) -> None:
    """Comptabilise un appel au modèle. Ne lève jamais.

    Appelé depuis `llm_client`, le point de passage unique : compter ailleurs
    reviendrait à oublier une branche au premier ajout."""
    global _jour, _jetons, _appels, _ouvert_signale

    total = max(0, jetons_entree) + max(0, jetons_sortie)
    with _verrou:
        aujourdhui = date.today()
        if aujourdhui != _jour:
            _jour, _jetons, _appels, _ouvert_signale = aujourdhui, 0, 0, False
        _jetons += total
        _appels += 1
        cumul, appels = _jetons, _appels

    # Une ligne par appel : c'est la seule façon de savoir ce que coûte réellement
    # un tour, et de fixer un budget sur des chiffres plutôt qu'au jugé.
    logger.info(
        "chatbot: appel au modèle",
        {
            "modele": modele,
            "jetons_entree": jetons_entree,
            "jetons_sortie": jetons_sortie,
            "jetons_jour": cumul,
            "appels_jour": appels,
        },
    )


def depasse() -> bool:
    """Le budget du jour est-il épuisé ?

    Consigné une seule fois par jour au moment où la limite est franchie : à
    chaque requête, l'incident se noierait dans son propre bruit."""
    global _ouvert_signale

    if BUDGET_JETONS_PAR_JOUR <= 0:
        return False

    with _verrou:
        if date.today() != _jour:
            return False
        atteint = _jetons >= BUDGET_JETONS_PAR_JOUR
        premier = atteint and not _ouvert_signale
        if premier:
            _ouvert_signale = True
        cumul = _jetons

    if premier:
        logger.error(
            "chatbot: budget de jetons épuisé, appels au modèle suspendus",
            {"jetons_jour": cumul, "budget": BUDGET_JETONS_PAR_JOUR},
        )
    return atteint


def etat() -> dict:
    """Pour le point de santé : ce qui a été consommé, et si le disjoncteur a sauté."""
    with _verrou:
        return {
            "jetons_jour": _jetons,
            "appels_jour": _appels,
            "budget": BUDGET_JETONS_PAR_JOUR or None,
            "suspendu": bool(BUDGET_JETONS_PAR_JOUR) and _jetons >= BUDGET_JETONS_PAR_JOUR,
        }


def reinitialiser() -> None:
    """Pour les tests."""
    global _jour, _jetons, _appels, _ouvert_signale
    with _verrou:
        _jour, _jetons, _appels, _ouvert_signale = date.today(), 0, 0, False
