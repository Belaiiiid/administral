"""Indicative APL benefit estimate — deliberately simplified.

This is **not** the official CAF barème (zones, plafonds and taux exacts,
revalorisés chaque année) — building that is a project of its own (see
`docs/roadmap-squads.md`, Squad A2). This module gives a citizen a rough,
transparent, order-of-magnitude figure from what their profile already
declares, so "Estimation de l'aide" has something real behind it rather than
a placeholder — while being explicit, in the API response itself, that it is
not a commitment.

Deliberately deterministic, zero LLM: an entitlement estimate must never be
a model's guess, even a rough one is a plain arithmetic formula a citizen (or
a reviewer) can re-derive by hand from the numbers shown.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.profiling.schemas.profil import ProfilPartiel, StatutMarital

AVERTISSEMENT = (
    "Estimation indicative et simplifiée, à partir d'une formule approximative — "
    "elle ne remplace pas le calcul officiel de la CAF, qui applique un barème "
    "précis par zone et n'est communiqué qu'après instruction complète du dossier."
)

#: Illustrative rent ceiling for one person; each additional household member
#: raises it. Not the real zoned CAF plafond — a single flat approximation.
_PLAFOND_BASE = 300.0
_PLAFOND_PAR_PERSONNE_SUPPLEMENTAIRE = 60.0

#: Illustrative personal-contribution rate and floor.
_TAUX_PARTICIPATION_PERSONNELLE = 0.30
_PARTICIPATION_PLANCHER = 35.0

_EN_COUPLE = frozenset({StatutMarital.marie, StatutMarital.pacse, StatutMarital.concubinage})


@dataclass
class EstimationAide:
    #: Rough monthly amount in euros, 0 when the profile does not support a
    #: positive estimate (no rent declared, contribution exceeds the ceiling…).
    montant_estime: int
    loyer_retenu: float
    participation_personnelle: float
    #: Whether the profile has enough to attempt an estimate at all — false
    #: when housing status or rent is still unknown, not when the amount is 0.
    estimation_possible: bool
    avertissement: str


def _revenu_mensuel(profil: ProfilPartiel) -> float:
    if profil.revenu_fiscal_reference is not None:
        return profil.revenu_fiscal_reference / 12
    if profil.revenus_nets_mensuels is not None:
        return profil.revenus_nets_mensuels
    return 0.0


def _taille_foyer(profil: ProfilPartiel) -> int:
    adultes = 2 if profil.statut_marital in _EN_COUPLE else 1
    enfants = profil.nombre_enfants_a_charge or 0
    return adultes + enfants


def estimer_aide(profil: ProfilPartiel) -> EstimationAide:
    """A rough, explainable monthly amount from the profile declared so far."""
    if profil.situation_logement is None or not profil.loyer_mensuel:
        return EstimationAide(
            montant_estime=0,
            loyer_retenu=0.0,
            participation_personnelle=0.0,
            estimation_possible=False,
            avertissement=AVERTISSEMENT,
        )

    taille_foyer = _taille_foyer(profil)
    plafond = _PLAFOND_BASE + max(0, taille_foyer - 1) * _PLAFOND_PAR_PERSONNE_SUPPLEMENTAIRE
    loyer_retenu = min(profil.loyer_mensuel, plafond)

    revenu_mensuel = _revenu_mensuel(profil)
    participation = max(_TAUX_PARTICIPATION_PERSONNELLE * revenu_mensuel, _PARTICIPATION_PLANCHER)

    montant = max(0, round(loyer_retenu - participation))

    return EstimationAide(
        montant_estime=int(montant),
        loyer_retenu=round(loyer_retenu, 2),
        participation_personnelle=round(participation, 2),
        estimation_possible=True,
        avertissement=AVERTISSEMENT,
    )
