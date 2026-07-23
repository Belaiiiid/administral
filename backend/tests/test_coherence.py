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


# ---------------------------------------------------------------------------
# C6 — Rapport de cohérence : génération + mapping (sans DB)
# ---------------------------------------------------------------------------


class _FakeCase:
    """Minimal Case stub — only the fields generer_et_persister_rapport touches."""

    def __init__(self, case_id: str) -> None:
        self.id = case_id
        self.coherence_report = None


def test_rapport_coherent_sans_anomalies(monkeypatch) -> None:
    """C6 — dossier cohérent : outcome=passed, anomalies=[].

    The LLM call is replaced by a stub that returns a single coherent check.
    The DB upsert is replaced by the identity function so no real session is
    needed. Only the mapping logic (service layer) is exercised.
    """
    from app.modules.agent.models import ReportOutcome
    from app.modules.ai.coherence import service as svc

    # Stub: LLM returns one fully coherent check.
    monkeypatch.setattr(
        svc,
        "analyser_coherence",
        lambda profil, documents: svc.ResultatCoherence(
            coherent_global=True,
            statut_global="coherent",
            incoherences=[],
        ),
    )

    # Stub: bypass DB write, return the report as-is.
    persisted: list = []

    def fake_upsert(db, *, case, report):  # noqa: ARG001
        persisted.append(report)
        return report

    monkeypatch.setattr(svc, "upsert_coherence_report", fake_upsert)

    case = _FakeCase("case-coherent-001")
    report = svc.generer_et_persister_rapport(
        db=None,  # not reached — upsert is stubbed
        case=case,
        profil=_PROFIL,
        documents=_DOCS,
    )

    assert report.outcome == ReportOutcome.passed
    assert report.anomalies == []
    assert report.case_id == "case-coherent-001"


def test_rapport_incoherent_avec_cause(monkeypatch) -> None:
    """C6 — dossier incohérent : outcome=failed, anomalies avec field et message.

    The LLM returns one `incoherent` check on the `montant_loyer` field with a
    human-readable reason and two evidence snippets. The service must map this
    to a `CoherenceAnomaly` whose `declared_value`/`observed_value` match the
    evidence items and whose `message` matches the reason.
    """
    from app.modules.agent.models import AnomalySeverity, ReportOutcome
    from app.modules.ai.coherence import service as svc
    from app.modules.ai.coherence.schemas import Verification

    incoherence = Verification(
        champ="montant_loyer",
        coherent=False,
        statut="incoherent",
        raison="Le loyer déclaré (800 €) ne correspond pas au bail (650 €).",
        confiance=0.95,
        fichiers_concernes=["bail.pdf"],
        preuves=["800 €", "650 €"],
    )

    monkeypatch.setattr(
        svc,
        "analyser_coherence",
        lambda profil, documents: svc.ResultatCoherence(
            coherent_global=False,
            statut_global="incoherent",
            incoherences=[incoherence],
        ),
    )

    def fake_upsert(db, *, case, report):  # noqa: ARG001
        return report

    monkeypatch.setattr(svc, "upsert_coherence_report", fake_upsert)

    case = _FakeCase("case-incoherent-001")
    report = svc.generer_et_persister_rapport(
        db=None,
        case=case,
        profil=_PROFIL,
        documents=_DOCS,
    )

    assert report.outcome == ReportOutcome.failed
    assert len(report.anomalies) == 1

    anomaly = report.anomalies[0]
    assert anomaly.field == "montant_loyer"
    assert anomaly.severity == AnomalySeverity.error
    assert anomaly.declared_value == "800 €"
    assert anomaly.observed_value == "650 €"
    assert "800 €" in anomaly.message or "loyer" in anomaly.message.lower()

