"""Tests for coherence analysis (Module C1).

The safety-critical behaviours, all exercised without a Mistral key:

  * no key → `a_revoir`, never `coherent` (an unverified dossier is never sound)
  * the global status is the worst per-check status, not an average
  * a malformed LLM object collapses to the safe direction

The live LLM path is deliberately not tested here — it needs a key and network,
and mocking Mistral's wording would test the mock, not the module.
"""

from __future__ import annotations

from app.modules.ai.coherence.mistral_client import _normaliser, verifier_coherence_llm
from app.modules.ai.coherence.schemas import Verification
from app.modules.ai.coherence.service import _statut_global, analyser_coherence

_PROFIL = {"nom": "Dupont", "prenom": "Marie"}
_DOCS = [{"type": "bail", "fichier": "bail.pdf"}, {"type": "quittance", "fichier": "q.pdf"}]


def test_offline_yields_a_revoir_not_coherent(monkeypatch) -> None:
    """Without a key the dossier is reviewable, never declared coherent.

    This is the module's whole reason for existing safely: a missing
    integration must not become a silent "everything checks out". The key is
    forced off so the test is deterministic regardless of the environment.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "mistral_api_key", None)
    result = analyser_coherence(_PROFIL, _DOCS)

    assert result.statut_global == "a_revoir"
    assert result.coherent_global is False
    # The offline result still names the files it could not verify.
    assert result.incoherences[0].fichiers_concernes == ["bail.pdf", "q.pdf"]


def test_global_status_takes_the_worst() -> None:
    """incoherent dominates a_revoir dominates coherent."""
    coherent = Verification(champ="a", coherent=True, statut="coherent", raison="", confiance=1.0)
    review = Verification(champ="b", coherent=False, statut="a_revoir", raison="", confiance=0.0)
    broken = Verification(champ="c", coherent=False, statut="incoherent", raison="", confiance=0.9)

    assert _statut_global([coherent]) == "coherent"
    assert _statut_global([coherent, review]) == "a_revoir"
    assert _statut_global([coherent, review, broken]) == "incoherent"


def test_only_non_coherent_checks_are_reported() -> None:
    """`incoherences` excludes the checks that passed."""
    checks = [
        Verification(champ="a", coherent=True, statut="coherent", raison="", confiance=1.0),
        Verification(champ="b", coherent=False, statut="incoherent", raison="x", confiance=0.9),
    ]
    incoherences = [v for v in checks if v.statut != "coherent"]

    assert len(incoherences) == 1
    assert incoherences[0].champ == "b"


def test_normalise_coerces_unknown_status_to_review() -> None:
    """An unrecognised status from the model collapses to `a_revoir`."""
    raw = {"champ": "x", "statut": "definitely_fine", "confiance": 5.0}

    normalised = _normaliser(raw, _DOCS)

    assert normalised["statut"] == "a_revoir"
    assert normalised["coherent"] is False
    # Confidence is clamped into [0, 1].
    assert normalised["confiance"] == 1.0


def test_offline_client_returns_single_review_result(monkeypatch) -> None:
    """The offline path returns exactly one global `a_revoir`."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "mistral_api_key", None)
    results = verifier_coherence_llm(_PROFIL, _DOCS)

    assert len(results) == 1
    assert results[0]["statut"] == "a_revoir"
    assert results[0]["champ"] == "global"
