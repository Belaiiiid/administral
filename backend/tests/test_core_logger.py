"""Le logger applicatif, et surtout son `exception`.

Pourquoi il a fallu l'ajouter : le projet attrape des exceptions à plusieurs
endroits pour dégrader proprement plutôt que planter — c'est voulu. Mais
`error(message, context)` ne pouvait rien dire de l'exception attrapée : ni son
type, ni sa trace. Un `except Exception` restait donc opaque même quand il
écrivait une ligne, et complètement muet quand il n'en écrivait aucune (le cas
de l'assistant citoyen avant ce correctif).

Ce qui est vérifié ici tient en deux points : la trace est bien capturée, et le
type de l'exception sort dans son propre champ — c'est sur lui qu'on regroupe
des incidents, une trace complète ne se compte pas.
"""

from __future__ import annotations

import json

from app.core.logger import logger


def _ligne(capsys, flux="err") -> dict:
    capture = capsys.readouterr()
    brut = capture.err if flux == "err" else capture.out
    return json.loads(brut.strip().splitlines()[-1])


def test_exception_capture_le_type_et_la_trace(capsys) -> None:
    try:
        raise ValueError("barème introuvable")
    except ValueError:
        logger.exception("échec du calcul", {"champ": "revenu"})

    ligne = _ligne(capsys)
    assert ligne["level"] == "error"
    assert ligne["message"] == "échec du calcul"
    assert ligne["context"]["champ"] == "revenu", "le contexte fourni est conservé"
    assert ligne["context"]["error"] == "ValueError: barème introuvable"
    assert "Traceback" in ligne["context"]["traceback"]
    assert "barème introuvable" in ligne["context"]["traceback"]


def test_exception_sans_contexte(capsys) -> None:
    try:
        raise KeyError("zone")
    except KeyError:
        logger.exception("échec")
    assert _ligne(capsys)["context"]["error"].startswith("KeyError:")


def test_exception_hors_bloc_except_se_comporte_comme_error(capsys) -> None:
    """Un appel mal placé ne doit pas inventer une trace ni lever à son tour."""
    logger.exception("rien à signaler", {"a": 1})
    ligne = _ligne(capsys)
    assert ligne["level"] == "error"
    assert "traceback" not in ligne["context"]
    assert ligne["context"] == {"a": 1}


def test_exception_ne_masque_pas_lexception_en_cours(capsys) -> None:
    """Le logger ne doit jamais devenir la cause d'un incident qu'il rapporte."""
    try:
        try:
            raise RuntimeError("panne")
        except RuntimeError:
            logger.exception("attrapée")
            raise
    except RuntimeError as remontee:
        assert str(remontee) == "panne"
    assert _ligne(capsys)["context"]["error"] == "RuntimeError: panne"


def test_les_niveaux_existants_ne_changent_pas(capsys) -> None:
    logger.info("bonjour", {"a": 1})
    assert _ligne(capsys, flux="out")["level"] == "info"
    logger.warn("attention")
    assert _ligne(capsys)["level"] == "warn"
    logger.error("erreur")
    assert _ligne(capsys)["level"] == "error"
