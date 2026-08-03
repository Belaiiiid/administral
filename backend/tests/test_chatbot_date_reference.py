"""`dateReference` — le champ du contrat qui décide QUELLE loi s'applique.

Le citoyen qui conteste une décision de 2022 doit recevoir le droit de 2022 :
c'est toute la raison d'être de la branche `fondement_juridique`. Cette date est
donc l'entrée la plus lourde de conséquences du contrat, et c'était une chaîne
libre.

Deux défauts en découlaient. Une valeur non ISO traversait la validation, allait
lever dans `date.fromisoformat` au fond du moteur, et ressortait en **200 OK**
« l'assistant est momentanément indisponible » — pour ce qui est une requête
invalide, donc un 422. Et `parse_date_fr` refuse le futur et l'avant-1990 quand
le citoyen ÉCRIT une date, mais un client renseignant le champ directement
échappait à ce contrôle : la borne existait sur un chemin et pas sur l'autre.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.modules.chatbot.rag.orchestrator import parse_date_fr
from app.modules.chatbot.schemas import (
    DATE_DECISION_MIN,
    ChatbotContextSchema,
    ChatbotResponseSchema,
)


def _contexte(valeur):
    return ChatbotContextSchema(dateReference=valeur)


# --- Ce qui doit être refusé --------------------------------------------------


@pytest.mark.parametrize(
    "valeur",
    ["pas-une-date", "12/03/2024", "2024-13-01", "2024-02-30", "hier", "", "2024"],
)
def test_une_date_illisible_est_refusee(valeur):
    """Refusée à la frontière, au lieu d'aller lever au fond du moteur."""
    with pytest.raises(ValidationError):
        _contexte(valeur)


def test_une_date_future_est_refusee():
    """Une décision déjà reçue ne peut pas porter une date à venir."""
    with pytest.raises(ValidationError):
        _contexte((date.today() + timedelta(days=1)).isoformat())


def test_une_date_trop_ancienne_est_refusee():
    with pytest.raises(ValidationError):
        _contexte("1989-12-31")


# --- Ce qui doit passer -------------------------------------------------------


def test_une_date_iso_valide_est_acceptee_et_typee():
    ctx = _contexte("2022-03-12")
    assert ctx.date_reference == date(2022, 3, 12)


def test_les_bornes_elles_memes_sont_acceptees():
    assert _contexte(DATE_DECISION_MIN.isoformat()).date_reference == DATE_DECISION_MIN
    assert _contexte(date.today().isoformat()).date_reference == date.today()


def test_labsence_de_date_reste_valide():
    """Pas de date = droit en vigueur aujourd'hui. C'est le cas courant."""
    assert _contexte(None).date_reference is None
    assert ChatbotContextSchema().date_reference is None


# --- Cohérence avec l'autre chemin --------------------------------------------


@pytest.mark.parametrize(
    "ecrit_par_le_citoyen",
    ["12/03/2024", "mars 2024", "2024-03-12", "12 mars 2024"],
)
def test_ce_que_parse_date_fr_accepte_passe_aussi_par_le_contrat(ecrit_par_le_citoyen):
    """Les deux chemins doivent s'accorder : ce que le dialogue accepte de la plume du
    citoyen doit pouvoir revenir par le champ au tour suivant."""
    valeur = parse_date_fr(ecrit_par_le_citoyen)
    assert valeur is not None
    assert _contexte(valeur.isoformat()).date_reference == valeur


@pytest.mark.parametrize("hors_bornes", ["2050-01-01", "1980-06-15"])
def test_les_deux_chemins_refusent_les_memes_dates(hors_bornes):
    """La borne 1990-aujourd'hui existait sur le chemin écrit et pas sur le champ ;
    c'était le contournement."""
    assert parse_date_fr(hors_bornes) is None
    with pytest.raises(ValidationError):
        _contexte(hors_bornes)


# --- Le retour ----------------------------------------------------------------


def test_la_reponse_transporte_la_date_sans_la_revalider():
    """Elle sort du moteur, déjà bornée par `parse_date_fr` : la revalider ferait d'une
    anomalie interne un 500 au lieu d'une réponse."""
    reponse = ChatbotResponseSchema(answer="x", sources=[], dateReference="2022-03-12")
    assert reponse.date_reference == date(2022, 3, 12)


def test_la_date_repart_en_iso_vers_le_client():
    """Le client la renvoie telle quelle au tour suivant : la forme sérialisée doit
    rester celle que le contrat accepte en entrée."""
    reponse = ChatbotResponseSchema(answer="x", sources=[], dateReference="2022-03-12")
    serialise = reponse.model_dump(by_alias=True, mode="json")["dateReference"]
    assert serialise == "2022-03-12"
    assert _contexte(serialise).date_reference == date(2022, 3, 12)
