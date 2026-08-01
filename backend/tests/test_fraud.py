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

    assert analyze_document(str(flagged)).niveau_risque == "A_VERIFIER"
    assert analyze_document(str(clean)).niveau_risque == "FAIBLE"


def test_image_analysis_keeps_ela_disabled_by_default(tmp_path, monkeypatch) -> None:
    """ELA is not used by default, even for JPEG files."""
    import cv2
    import numpy as np

    from app.core.config import settings
    from app.modules.ai.fraud.service import analyze_document

    monkeypatch.setattr(settings, "mistral_api_key", None)
    monkeypatch.setattr(settings, "fraud_vision_endpoint", None)
    monkeypatch.setattr(settings, "fraud_enable_ela", False)
    image_path = tmp_path / "scan.jpg"
    ok, encoded = cv2.imencode(".jpg", np.full((160, 240, 3), 255, dtype=np.uint8))
    assert ok
    image_path.write_bytes(encoded.tobytes())

    analysis = analyze_document(str(image_path))
    assert analysis.ela_visuals == []
    assert analysis.vision_model is not None
    assert analysis.vision_model.status == "NON_CONFIGURE"


def test_analyse_ela_detects_spliced_region(tmp_path) -> None:
    """A splice built with OpenCV must be localised by the loosened ELA filters.

    The background is repeatedly JPEG round-tripped (a stand-in for an
    original photo that already went through several recompressions and has
    therefore "stabilised") while the spliced patch is pasted in fresh,
    straight from a never-compressed array. Re-encoding the composite once
    more makes the untouched background nearly invariant across the tested
    qualities while the freshly pasted patch keeps producing a strong,
    recurring residual — the textbook double-compression signature ELA looks
    for.
    """
    import cv2
    import numpy as np

    from app.modules.ai.fraud.ela import analyse_ela

    def textured_block(height: int, width: int, seed: int, frequency: int) -> np.ndarray:
        rng = np.random.default_rng(seed)
        small = rng.integers(0, 255, (max(1, height // frequency), max(1, width // frequency), 3), dtype=np.uint8)
        return cv2.resize(small, (width, height), interpolation=cv2.INTER_CUBIC)

    size = 500
    background = textured_block(size, size, seed=101, frequency=8)
    for _ in range(10):  # simulate a photo that already went through several JPEG saves
        _, encoded = cv2.imencode(".jpg", background, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        background = cv2.imdecode(encoded, cv2.IMREAD_COLOR)

    box = 120
    offset = (size - box) // 2
    spliced_patch = textured_block(box, box, seed=4, frequency=3)
    spliced = background.copy()
    spliced[offset:offset + box, offset:offset + box] = spliced_patch

    image_path = tmp_path / "spliced.jpg"
    _, encoded_final = cv2.imencode(".jpg", spliced, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    image_path.write_bytes(encoded_final.tobytes())

    pages = analyse_ela(image_path, draw_boxes=False)
    assert pages
    assert pages[0]["is_suspicious"] is True
    assert pages[0]["regions"], "the loosened thresholds must localise the spliced region"


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
