"""Tests for the citizen document feature.

The pieces that don't need a database or a Mistral key: checklist generation,
completeness recomputation, and the classifier's refusal to guess. The upload
flow's storage and DB paths are exercised by the live end-to-end check, not here.
"""

from __future__ import annotations

from app.modules.citizen.checklist import APL_CHECKLIST
from app.modules.citizen.classification import _normalise, classify_document
from app.modules.citizen.extraction import _sanitize


def test_sanitize_strips_postgres_hostile_characters() -> None:
    """NUL and control bytes are removed; legitimate layout survives.

    Real PDFs' extracted text carries `\\x00` and other C0 controls that
    PostgreSQL rejects in a text column — an unsanitised extraction is a 500 at
    insert time on an ordinary utility bill. Tabs and newlines are kept.
    """
    raw = "Facture\x00 EDF\x07\ttotal\nmontant"
    clean = _sanitize(raw)

    assert "\x00" not in clean
    assert "\x07" not in clean
    assert "\t" in clean and "\n" in clean
    assert "Facture" in clean and "montant" in clean


def test_classifier_refuses_without_a_key(monkeypatch) -> None:
    """No key → `insufficient` with a stated error, never a fabricated match.

    A classifier that returned `match` when it could not actually read the
    document would let a dossier reach "complete" on unverified files. The
    degraded path must never match.

    The key is forced off so the test is deterministic regardless of whether a
    real `MISTRAL_API_KEY` is present in the environment.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "mistral_api_key", None)
    # A neutral text that the deterministic proof-of-address rule will not match.
    result = classify_document("Un texte de document quelconque.", list(APL_CHECKLIST))

    assert result.decision == "insufficient"
    assert result.matched_checklist_document_id is None
    assert result.error is not None


def test_classifier_refuses_on_empty_text() -> None:
    """No extractable text is `insufficient`, not a guess."""
    result = classify_document("   ", list(APL_CHECKLIST))

    assert result.decision == "insufficient"
    assert result.confidence == 0.0


def test_normalise_downgrades_match_to_unknown_item() -> None:
    """A `match` naming a checklist id that does not exist is not trusted.

    The model claiming a match against a piece this application never asked for
    is a hallucinated target — downgraded to `insufficient` rather than
    marking a phantom item received.
    """
    keys = {item.item_key for item in APL_CHECKLIST}
    raw = {"decision": "match", "matched_checklist_document_id": "passport_of_the_moon", "confidence": 0.9}

    result = _normalise(raw, keys)

    assert result.decision == "insufficient"
    assert result.matched_checklist_document_id is None


def test_normalise_accepts_valid_match() -> None:
    """A `match` on a real checklist id is kept."""
    keys = {item.item_key for item in APL_CHECKLIST}
    raw = {
        "decision": "match",
        "matched_checklist_document_id": "piece_identite",
        "confidence": 0.88,
        "evidence": ["Carte nationale d'identité"],
        "reason": "Document d'identité reconnu.",
    }

    result = _normalise(raw, keys)

    assert result.decision == "match"
    assert result.matched_checklist_document_id == "piece_identite"
    assert result.confidence == 0.88


def test_checklist_matches_squad_b_contract() -> None:
    """The checklist carries the Squad_B canonical ids and justifications."""
    keys = {item.item_key for item in APL_CHECKLIST}

    assert {
        "piece_identite",
        "justificatif_domicile",
        "contrat_location",
        "avis_imposition",
        "releve_identite_bancaire",
        "bulletins_salaire_3_derniers_mois",
    } <= keys
    # Every mandatory item states why it is needed — the UI shows it.
    assert all(item.justification for item in APL_CHECKLIST if item.obligatoire)


def test_deterministic_proof_of_address_matches_recent_energy_bill() -> None:
    """A recent EDF bill with an address is matched by rule, no LLM needed."""
    from datetime import UTC, datetime

    from app.modules.citizen.classification import _classify_clear_proof_of_address

    # An issue date within 90 days keeps the bill valid.
    recent = datetime.now(UTC)
    month_fr = [
        "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
        "août", "septembre", "octobre", "novembre", "décembre",
    ][recent.month - 1]
    text = (
        f"EDF Facture d'électricité échéance {recent.day} {month_fr} {recent.year} "
        "Client : 12 rue des Lilas 69003 Lyon montant 84,20 EUR"
    )

    result = _classify_clear_proof_of_address(text)

    assert result is not None
    assert result.decision == "match"
    assert result.matched_checklist_document_id == "justificatif_domicile"


def test_deterministic_rule_refuses_a_template() -> None:
    """A document marked « spécimen » is never accepted as proof, however recent."""
    from app.modules.citizen.classification import _classify_clear_proof_of_address

    text = "EDF Facture SPECIMEN échéance 1 janvier 2026 12345 Lyon"

    assert _classify_clear_proof_of_address(text) is None
