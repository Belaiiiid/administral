"""
Règles d'exclusion APL — déterministes, jamais confiées au LLM.

⚠️ Changement par rapport à la version précédente (signalé conformément à
RULES.md §2.5/§6) : la matrice de pertinence par situation (`Situation`,
`champs_pertinents`, `instructions_pour_prompt`) a été retirée. La cascade
métier complète (statut socio-pro → famille → logement) est désormais portée
directement par le prompt système dans `app/core/llm.py`, fourni explicitement
par l'utilisateur. Ce module ne garde que ce qui DOIT rester déterministe :
les motifs d'exclusion d'éligibilité, qui permettent au harness de clore le
profilage sans dépendre du jugement du LLM (RULES.md §2.1).

**Sources consultées** (droit français, juillet 2026) — paraphrasé, aucune
reproduction verbatim :
- service-public.gouv.fr, fiche F12006 (Aide personnalisée au logement)
- service-public.gouv.fr, fiche F1563 (Aide au logement pour étudiant)
"""
from __future__ import annotations

from typing import Callable

from app.modules.profiling.schemas.profil import ProfilPartiel, StatutLogement


def _est_heberge_gratuit(p: ProfilPartiel) -> bool:
    return p.situation_logement == StatutLogement.heberge


def _est_proprietaire(p: ProfilPartiel) -> bool:
    return p.situation_logement == StatutLogement.proprietaire


def _bailleur_est_un_proche(p: ProfilPartiel) -> bool:
    return p.logement_appartient_a_un_proche is True


RegleExclusion = tuple[str, Callable[[ProfilPartiel], bool], str]

REGLES_EXCLUSION: list[RegleExclusion] = [
    (
        "heberge_gratuit",
        _est_heberge_gratuit,
        "Une personne hébergée à titre gratuit ne verse pas de loyer et n'ouvre pas droit à l'APL locative (F12006).",
    ),
    (
        "proprietaire_occupant",
        _est_proprietaire,
        "Un propriétaire occupant n'est pas éligible à l'APL locative (F12006).",
    ),
    (
        "bailleur_ascendant_descendant",
        _bailleur_est_un_proche,
        "Le bailleur ne peut pas être un ascendant ou descendant direct du demandeur ou de son conjoint (F12006).",
    ),
]


def rechercher_exclusion(profil: ProfilPartiel) -> tuple[str, str] | None:
    """Renvoie (code, message) si le profil déclenche une règle d'exclusion, sinon None."""
    for code, predicat, message in REGLES_EXCLUSION:
        if predicat(profil):
            return code, message
    return None
