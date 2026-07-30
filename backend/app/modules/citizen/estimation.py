"""APL benefit estimate — the official formula, fed with two levels of precision.

This is **not** the official CAF barème (zones, plafonds et taux exacts,
revalorisés chaque année) — building that is a project of its own (see
`docs/roadmap-squads.md`, Squad A2). What is real here is the *structure* the
CAF publishes: APL = L + C - PP (loyer plafonné + forfait de charges -
participation personnelle) — every constant feeding it (plafonds par zone,
forfait de charges, taux de participation) is an illustrative placeholder,
clearly labelled below, standing in for the real barème until Squad A2 wires
it in.

Deliberately deterministic, zero LLM: an entitlement estimate must never be
a model's guess, even a rough one is a plain arithmetic formula a citizen (or
a reviewer) can re-derive by hand from the numbers shown.

Two callers share the exact same `_calculer_apl`, never two versions of the
formula:

- `estimer_aide` — the citizen's own exact declared profile (income to the
  euro, real postal code). Used by the authenticated `/citizen/estimation`
  read (`EstimationCard` on "Envoyer un dossier").
- `estimer_aide_indicative` — bracket inputs only (income band, rent band,
  zone, household composition), as collected turn-by-turn by the chatbot's
  `estimation` intent for a citizen who has not signed in. Returns a range,
  not a single figure: an anonymous conversation never has the citizen's
  exact numbers, so a single-euro amount would claim a precision the input
  never had. The range is genuinely computed (the formula run at both ends of
  each band), not a cosmetic ± margin around one number.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.modules.profiling.schemas.profil import ProfilPartiel, StatutMarital

AVERTISSEMENT = (
    "Estimation indicative et simplifiée, à partir d'une formule approximative — "
    "elle ne remplace pas le calcul officiel de la CAF, qui applique un barème "
    "précis par zone et n'est communiqué qu'après instruction complète du dossier."
)

AVERTISSEMENT_INDICATIF = (
    "Estimation indicative à partir de tranches, sans compte ni pièce déposée — "
    "la fourchette reflète l'imprécision des tranches choisies, pas une erreur de "
    "calcul. Connectez-vous et complétez votre dossier pour une estimation à "
    "partir de vos données exactes."
)

_EN_COUPLE = frozenset({StatutMarital.marie, StatutMarital.pacse, StatutMarital.concubinage})


# ---------------------------------------------------------------------------
# Zone — determines the rent ceiling (L). A citizen with an account states a
# postal code; an anonymous one picks the zone directly in the chatbot (they
# rarely know their INSEE zonage, but can recognise "Paris and inner suburbs").
# ---------------------------------------------------------------------------


class Zone(int, Enum):
    zone_1 = 1
    zone_2 = 2
    zone_3 = 3


LABEL_ZONE = {
    Zone.zone_1: "Zone 1 (Paris et proche banlieue)",
    Zone.zone_2: "Zone 2 (grandes agglomérations)",
    Zone.zone_3: "Zone 3 (autres communes)",
}

#: Simplified department-level heuristic, not the official commune-level
#: zonage CAF (which the real barème would look up per commune).
_DEPARTEMENTS_ZONE_1 = frozenset({"75", "92", "93", "94"})
_DEPARTEMENTS_ZONE_2 = frozenset(
    {"06", "13", "31", "33", "34", "35", "44", "59", "62", "67", "69", "76", "77", "78", "91", "95"}
)


def zone_from_code_postal(code_postal: str | None) -> Zone:
    if not code_postal or len(code_postal) < 2:
        return Zone.zone_3
    departement = code_postal[:2]
    if departement in _DEPARTEMENTS_ZONE_1:
        return Zone.zone_1
    if departement in _DEPARTEMENTS_ZONE_2:
        return Zone.zone_2
    return Zone.zone_3


# ---------------------------------------------------------------------------
# L — rent ceiling (plafond), by zone and household size. C — flat-rate
# charges, by household size. Both illustrative (see module docstring).
# ---------------------------------------------------------------------------

_PLAFOND_LOYER: dict[Zone, dict[int, float]] = {
    Zone.zone_1: {1: 300.0, 2: 363.0, 3: 389.0, 4: 411.0},
    Zone.zone_2: {1: 261.0, 2: 317.0, 3: 340.0, 4: 359.0},
    Zone.zone_3: {1: 246.0, 2: 297.0, 3: 318.0, 4: 336.0},
}
_PLAFOND_PAR_PERSONNE_SUPPLEMENTAIRE: dict[Zone, float] = {
    Zone.zone_1: 32.0,
    Zone.zone_2: 27.0,
    Zone.zone_3: 25.0,
}

_CHARGES_FORFAITAIRES = {1: 55.0, 2: 68.0, 3: 75.0}
_CHARGES_PAR_PERSONNE_SUPPLEMENTAIRE = 7.0

# Participation personnelle : PP = Po + Tp × max(0, revenu - R0).
# Po (participation minimale, proportionnelle au loyer+charges retenus), Tp
# (taux marginal appliqué au-delà d'un revenu plancher R0) et R0 lui-même sont
# tous illustratifs — calibrés pour que l'aide s'annule vers 2000-2200 €/mois
# de revenu pour une personne seule, pas avant (un Tp trop élevé, ex. 28 %,
# écrase l'aide dès ~1400 €/mois, ce qui n'est pas plausible).
_TAUX_PARTICIPATION_MINIMALE = 0.085
_TAUX_PARTICIPATION_MARGINALE = 0.15
_R0_BASE = 300.0
_R0_PAR_PERSONNE_SUPPLEMENTAIRE = 100.0


def _plafond_loyer(zone: Zone, taille_foyer: int) -> float:
    table = _PLAFOND_LOYER[zone]
    if taille_foyer <= 4:
        return table[max(1, taille_foyer)]
    return table[4] + (taille_foyer - 4) * _PLAFOND_PAR_PERSONNE_SUPPLEMENTAIRE[zone]


def _charges_forfaitaires(taille_foyer: int) -> float:
    if taille_foyer <= 3:
        return _CHARGES_FORFAITAIRES[max(1, taille_foyer)]
    return _CHARGES_FORFAITAIRES[3] + (taille_foyer - 3) * _CHARGES_PAR_PERSONNE_SUPPLEMENTAIRE


def _r0(taille_foyer: int) -> float:
    return _R0_BASE + max(0, taille_foyer - 1) * _R0_PAR_PERSONNE_SUPPLEMENTAIRE


def _calculer_apl(
    loyer_reel: float, taille_foyer: int, zone: Zone, revenu_mensuel: float
) -> tuple[int, float, float, float]:
    """APL = L + C - PP. The single formula every caller in this module runs.

    Returns ``(montant, loyer_retenu, charges_retenues, participation)``.
    """
    plafond = _plafond_loyer(zone, taille_foyer)
    loyer_retenu = min(max(0.0, loyer_reel), plafond)
    charges_retenues = _charges_forfaitaires(taille_foyer)

    participation = _TAUX_PARTICIPATION_MINIMALE * (loyer_retenu + charges_retenues) + (
        _TAUX_PARTICIPATION_MARGINALE * max(0.0, revenu_mensuel - _r0(taille_foyer))
    )

    montant = max(0, round(loyer_retenu + charges_retenues - participation))
    return int(montant), round(loyer_retenu, 2), round(charges_retenues, 2), round(participation, 2)


def _taille_foyer(profil: ProfilPartiel) -> int:
    adultes = 2 if profil.statut_marital in _EN_COUPLE else 1
    enfants = profil.nombre_enfants_a_charge or 0
    return adultes + enfants


def _revenu_mensuel(profil: ProfilPartiel) -> float:
    if profil.revenu_fiscal_reference is not None:
        return profil.revenu_fiscal_reference / 12
    if profil.revenus_nets_mensuels is not None:
        return profil.revenus_nets_mensuels
    return 0.0


# ---------------------------------------------------------------------------
# Precise mode — the citizen's own exact declared profile.
# ---------------------------------------------------------------------------


@dataclass
class EstimationAide:
    #: Rough monthly amount in euros, 0 when the profile does not support a
    #: positive estimate (no rent declared, contribution exceeds the ceiling…).
    montant_estime: int
    loyer_retenu: float
    charges_retenues: float
    participation_personnelle: float
    #: Whether the profile has enough to attempt an estimate at all — false
    #: when housing status or rent is still unknown, not when the amount is 0.
    estimation_possible: bool
    avertissement: str


def estimer_aide(profil: ProfilPartiel) -> EstimationAide:
    """A rough, explainable monthly amount from the profile declared so far."""
    if profil.situation_logement is None or not profil.loyer_mensuel:
        return EstimationAide(
            montant_estime=0,
            loyer_retenu=0.0,
            charges_retenues=0.0,
            participation_personnelle=0.0,
            estimation_possible=False,
            avertissement=AVERTISSEMENT,
        )

    taille_foyer = _taille_foyer(profil)
    zone = zone_from_code_postal(profil.code_postal)
    revenu_mensuel = _revenu_mensuel(profil)

    montant, loyer_retenu, charges_retenues, participation = _calculer_apl(
        profil.loyer_mensuel, taille_foyer, zone, revenu_mensuel
    )

    return EstimationAide(
        montant_estime=montant,
        loyer_retenu=loyer_retenu,
        charges_retenues=charges_retenues,
        participation_personnelle=participation,
        estimation_possible=True,
        avertissement=AVERTISSEMENT,
    )


# ---------------------------------------------------------------------------
# Indicative mode — bracket inputs, as collected by the chatbot's `estimation`
# intent (see `chatbot/rag/orchestrator.py`) for a citizen with no account.
# ---------------------------------------------------------------------------


class TrancheRevenu(str, Enum):
    """Net monthly household income, before tax."""

    moins_800 = "moins_800"
    de_800_a_1200 = "800_1200"
    de_1200_a_1600 = "1200_1600"
    de_1600_a_2200 = "1600_2200"
    de_2200_a_3000 = "2200_3000"
    plus_3000 = "plus_3000"


LABEL_TRANCHE_REVENU = {
    TrancheRevenu.moins_800: "Moins de 800 € par mois",
    TrancheRevenu.de_800_a_1200: "Entre 800 € et 1 200 € par mois",
    TrancheRevenu.de_1200_a_1600: "Entre 1 200 € et 1 600 € par mois",
    TrancheRevenu.de_1600_a_2200: "Entre 1 600 € et 2 200 € par mois",
    TrancheRevenu.de_2200_a_3000: "Entre 2 200 € et 3 000 € par mois",
    TrancheRevenu.plus_3000: "Plus de 3 000 € par mois",
}

#: (borne basse, borne haute) de chaque tranche — les deux bornes ouvertes
#: (`moins_800`, `plus_3000`) sont refermées sur une valeur illustrative pour
#: pouvoir calculer une fourchette.
_BORNES_REVENU: dict[TrancheRevenu, tuple[float, float]] = {
    TrancheRevenu.moins_800: (0.0, 800.0),
    TrancheRevenu.de_800_a_1200: (800.0, 1200.0),
    TrancheRevenu.de_1200_a_1600: (1200.0, 1600.0),
    TrancheRevenu.de_1600_a_2200: (1600.0, 2200.0),
    TrancheRevenu.de_2200_a_3000: (2200.0, 3000.0),
    TrancheRevenu.plus_3000: (3000.0, 4000.0),
}


class TrancheLoyer(str, Enum):
    """Monthly rent, excluding charges."""

    moins_400 = "moins_400"
    de_400_a_600 = "400_600"
    de_600_a_800 = "600_800"
    de_800_a_1000 = "800_1000"
    plus_1000 = "plus_1000"


LABEL_TRANCHE_LOYER = {
    TrancheLoyer.moins_400: "Moins de 400 € par mois",
    TrancheLoyer.de_400_a_600: "Entre 400 € et 600 € par mois",
    TrancheLoyer.de_600_a_800: "Entre 600 € et 800 € par mois",
    TrancheLoyer.de_800_a_1000: "Entre 800 € et 1 000 € par mois",
    TrancheLoyer.plus_1000: "Plus de 1 000 € par mois",
}

_BORNES_LOYER: dict[TrancheLoyer, tuple[float, float]] = {
    TrancheLoyer.moins_400: (0.0, 400.0),
    TrancheLoyer.de_400_a_600: (400.0, 600.0),
    TrancheLoyer.de_600_a_800: (600.0, 800.0),
    TrancheLoyer.de_800_a_1000: (800.0, 1000.0),
    TrancheLoyer.plus_1000: (1000.0, 1500.0),
}


class CompositionFoyer(str, Enum):
    personne_seule = "personne_seule"
    couple_sans_enfant = "couple_sans_enfant"
    monoparentale_1_enfant = "monoparentale_1_enfant"
    monoparentale_2_enfants_ou_plus = "monoparentale_2_enfants_ou_plus"
    couple_1_enfant = "couple_1_enfant"
    couple_2_enfants_ou_plus = "couple_2_enfants_ou_plus"


LABEL_COMPOSITION = {
    CompositionFoyer.personne_seule: "Une personne seule, sans enfant",
    CompositionFoyer.couple_sans_enfant: "Un couple, sans enfant",
    CompositionFoyer.monoparentale_1_enfant: "Une personne seule avec 1 enfant",
    CompositionFoyer.monoparentale_2_enfants_ou_plus: "Une personne seule avec 2 enfants ou plus",
    CompositionFoyer.couple_1_enfant: "Un couple avec 1 enfant",
    CompositionFoyer.couple_2_enfants_ou_plus: "Un couple avec 2 enfants ou plus",
}

_TAILLE_FOYER_PAR_COMPOSITION = {
    CompositionFoyer.personne_seule: 1,
    CompositionFoyer.couple_sans_enfant: 2,
    CompositionFoyer.monoparentale_1_enfant: 2,
    CompositionFoyer.monoparentale_2_enfants_ou_plus: 3,
    CompositionFoyer.couple_1_enfant: 3,
    CompositionFoyer.couple_2_enfants_ou_plus: 4,
}


@dataclass
class EstimationIndicative:
    #: Genuine bounds — the formula run at the least and most favourable ends
    #: of the chosen bands, not a cosmetic margin around one figure.
    montant_min: int
    #: The formula run at each band's midpoint — a single central figure for
    #: display alongside the range, never instead of it.
    montant_median: int
    montant_max: int
    zone: int
    estimation_possible: bool
    avertissement: str


def estimer_aide_indicative(
    tranche_revenu: TrancheRevenu,
    tranche_loyer: TrancheLoyer,
    zone: Zone,
    composition: CompositionFoyer,
) -> EstimationIndicative:
    taille_foyer = _TAILLE_FOYER_PAR_COMPOSITION[composition]
    revenu_bas, revenu_haut = _BORNES_REVENU[tranche_revenu]
    loyer_bas, loyer_haut = _BORNES_LOYER[tranche_loyer]

    # Moins favorable : le loyer le plus bas de la tranche (donc L le plus
    # petit) combiné au revenu le plus haut (donc PP le plus grand).
    montant_bas, *_ = _calculer_apl(loyer_bas, taille_foyer, zone, revenu_haut)
    # Plus favorable : l'inverse.
    montant_haut, *_ = _calculer_apl(loyer_haut, taille_foyer, zone, revenu_bas)

    montant_median, *_ = _calculer_apl(
        (loyer_bas + loyer_haut) / 2, taille_foyer, zone, (revenu_bas + revenu_haut) / 2
    )

    return EstimationIndicative(
        montant_min=min(montant_bas, montant_haut),
        montant_median=montant_median,
        montant_max=max(montant_bas, montant_haut),
        zone=int(zone),
        estimation_possible=True,
        avertissement=AVERTISSEMENT_INDICATIF,
    )
