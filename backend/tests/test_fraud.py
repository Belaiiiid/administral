"""Tests for the C4 metadata forensics — the deterministic rules.

These need no ExifTool and no Mistral key: they build tiny PDFs and check the
five deterministic signals fire (or don't). The LLM layer is not tested here —
it needs a key and network, and mocking the model would test the mock.
"""

from __future__ import annotations

from pathlib import Path

from app.modules.ai.fraud.metadata import extract_metadata


def _write_pdf(tmp_path: Path, name: str, *, producer: str | None, create: str | None,
               modify: str | None, extra_eof: int = 0) -> Path:
    """A minimal PDF carrying the given info-dictionary fields."""
    info = b""
    if producer is not None:
        info += b"/Producer (" + producer.encode("latin-1") + b")"
    if create is not None:
        info += b"/CreationDate (D:" + create.encode("latin-1") + b")"
    if modify is not None:
        info += b"/ModDate (D:" + modify.encode("latin-1") + b")"

    body = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog>>endobj\n"
        b"2 0 obj<<" + info + b">>endobj\n"
        b"trailer<</Root 1 0 R/Info 2 0 R>>\n"
        b"%%EOF\n"
    )
    body += b"%%EOF\n" * extra_eof

    path = tmp_path / name
    path.write_bytes(body)
    return path


def test_modification_before_creation_is_flagged(tmp_path) -> None:
    pdf = _write_pdf(
        tmp_path, "a.pdf", producer="LibreOffice",
        create="20260720090000", modify="20260601080000",
    )
    signals = extract_metadata(pdf)["signaux_a_verifier"]
    assert any("modification antérieure" in s for s in signals)


def test_suspect_software_is_flagged(tmp_path) -> None:
    pdf = _write_pdf(
        tmp_path, "b.pdf", producer="GIMP 2.10 PDF Export",
        create="20260101090000", modify="20260101090000",
    )
    signals = extract_metadata(pdf)["signaux_a_verifier"]
    assert any("logiciel d'édition graphique" in s for s in signals)


def test_purged_software_metadata_is_flagged(tmp_path) -> None:
    pdf = _write_pdf(tmp_path, "c.pdf", producer=None, create=None, modify=None)
    signals = extract_metadata(pdf)["signaux_a_verifier"]
    assert any("aucune métadonnée de logiciel" in s for s in signals)


def test_multiple_eof_is_flagged(tmp_path) -> None:
    pdf = _write_pdf(
        tmp_path, "d.pdf", producer="LibreOffice",
        create="20260101090000", modify="20260101090000", extra_eof=2,
    )
    signals = extract_metadata(pdf)["signaux_a_verifier"]
    assert any("révisions incrémentales" in s for s in signals)


def test_clean_document_has_no_deterministic_signals(tmp_path) -> None:
    """A plain PDF from a normal tool, coherent dates, single revision."""
    pdf = _write_pdf(
        tmp_path, "clean.pdf", producer="Microsoft Word",
        create="20260101090000", modify="20260101090000",
    )
    signals = extract_metadata(pdf)["signaux_a_verifier"]
    assert signals == []


def test_service_produces_risk_badge_value(tmp_path, monkeypatch) -> None:
    """Without a key, a flagged document is `À VÉRIFIER`, a clean one `FAIBLE`.

    The key is forced off so the deterministic badge value is asserted
    regardless of whether a real `MISTRAL_API_KEY` is configured.
    """
    from app.core.config import settings
    from app.modules.ai.fraud.service import analyze_document

    monkeypatch.setattr(settings, "mistral_api_key", None)

    flagged = _write_pdf(
        tmp_path, "flagged.pdf", producer="Photoshop",
        create="20260101090000", modify="20260101090000",
    )
    clean = _write_pdf(
        tmp_path, "ok.pdf", producer="Microsoft Word",
        create="20260101090000", modify="20260101090000",
    )

    assert analyze_document(str(flagged)).niveau_risque == "À VÉRIFIER"
    assert analyze_document(str(clean)).niveau_risque == "FAIBLE"


def test_image_analysis_keeps_ela_disabled_by_default(tmp_path, monkeypatch) -> None:
    """ELA is not used by default, even for JPEG files."""
    import cv2
    import numpy as np

    from app.core.config import settings
    from app.modules.ai.fraud.service import analyze_document

    monkeypatch.setattr(settings, "mistral_api_key", None)
    monkeypatch.setattr(settings, "fraud_vision_endpoint", None)
    image_path = tmp_path / "scan.jpg"
    assert cv2.imwrite(str(image_path), np.full((160, 240, 3), 255, dtype=np.uint8))

    analysis = analyze_document(str(image_path))
    assert analysis.ela_visuals == []
    assert analysis.vision_model is not None
    assert analysis.vision_model.status == "NON_CONFIGURE"


def test_duplicate_document_is_an_explicit_review_signal(tmp_path, monkeypatch) -> None:
    from app.core.config import settings
    from app.modules.ai.fraud.service import analyze_document

    monkeypatch.setattr(settings, "mistral_api_key", None)
    pdf = _write_pdf(
        tmp_path, "duplicate.pdf", producer="Microsoft Word",
        create="20260101090000", modify="20260101090000",
    )
    analysis = analyze_document(str(pdf), duplicate_count=2)

    assert analysis.integrity is not None
    assert analysis.integrity.exact_duplicate_in_dossier is True
    assert any("mÃªme empreinte" in signal for signal in analysis.signaux_a_verifier)
