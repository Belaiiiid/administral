"""Tests for the C4 metadata forensics — the deterministic rules.

These need no external binary and no Mistral key: they build tiny PDFs and
check the deterministic signals fire (or don't). The LLM layer is not tested
here — it needs a key and network, and mocking the model would test the mock.
"""

from __future__ import annotations

import datetime
import io
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
    assert any("même empreinte" in signal for signal in analysis.signaux_a_verifier)


def _sign_pdf(tmp_path: Path, name: str) -> Path:
    """Build a minimal PDF and sign it with a throwaway self-signed EC cert.

    Used only to exercise pyHanko's integrity check: a real deployment has no
    accredited trust root configured, so this never claims `trusted`, only
    `intact`/`valid` — which is exactly what these tests assert on.
    """
    import fitz
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers
    from pyhanko.sign.fields import SigFieldSpec, append_signature_field

    document = fitz.open()
    document.new_page().insert_text((72, 72), "Attestation de test.")
    source_bytes = document.tobytes()
    document.close()

    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test Signer")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject).issuer_name(subject).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    key_path, cert_path = tmp_path / "key.pem", tmp_path / "cert.pem"
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    signer = signers.SimpleSigner.load(key_file=str(key_path), cert_file=str(cert_path), key_passphrase=None, ca_chain_files=None)

    writer = IncrementalPdfFileWriter(io.BytesIO(source_bytes))
    append_signature_field(writer, SigFieldSpec(sig_field_name="Signature1"))
    output = io.BytesIO()
    signers.sign_pdf(writer, signers.PdfSignatureMetadata(field_name="Signature1"), signer=signer, output=output)

    path = tmp_path / name
    path.write_bytes(output.getvalue())
    return path


def test_intact_pdf_signature_is_reported_as_cryptographically_valid(tmp_path) -> None:
    from app.modules.ai.fraud.integrity import analyse_integrity

    signed = _sign_pdf(tmp_path, "signed.pdf")
    result = analyse_integrity(signed)

    assert result["pdf_signature_state"] == "SIGNEE_INTEGRE"
    assert any("cryptographiquement intègre" in s for s in result["signals"])


def test_pdf_altered_after_signing_is_flagged(tmp_path) -> None:
    from app.modules.ai.fraud.integrity import analyse_integrity
    from app.modules.ai.fraud.service import _integrity_evidence

    signed = _sign_pdf(tmp_path, "signed.pdf")
    tampered_bytes = bytearray(signed.read_bytes())
    marker = tampered_bytes.find(b"stream")
    assert marker != -1
    tampered_bytes[marker + 20] ^= 0xFF
    tampered = tmp_path / "tampered.pdf"
    tampered.write_bytes(bytes(tampered_bytes))

    result = analyse_integrity(tampered)

    assert result["pdf_signature_state"] == "SIGNEE_ALTEREE"
    assert any("modifié après signature" in s for s in result["signals"])

    evidence = _integrity_evidence(result, extracted_text=None)
    assert evidence.raw_score == 1.0


# A real 2D-Doc string (from the fr_2ddoc_parser project's own test suite):
# well-formed and correctly signed in *format*, but issued under a test
# certificate authority ("FR00") absent from the real ANTS trust list — so it
# is expected, and correct, for signature verification to fail on it. That is
# exactly the behaviour these tests rely on: it proves the check is actually
# validating against ANTS, not rubber-stamping any well-formed code.
_SAMPLE_2D_DOC = (
    "DC04FR000001000F23DC2801FR432,75\x1d44227801234567845202146RETI PATRICK\x1d4A310720224Y1"
    "45 RUE JULLIARD/ZASPECIMEN/78320/LEVIS STNOM\x1d4163198\x1d47300112345678948RETISOPHIE"
    "\x1d4907019877654324V3542\x1d4W182\x1d4X3724\x1d"
    "\x1f6W76EBC3I2LWHBVGNNYTL34SC6V32S2GDCIQQZLZNMTKCHNVEUISJYUQH5WE3AJJICBNG3YMQ2NXXHP5ZHVOQE332R6TUJDHNOHQ6BI"
)


def _write_2ddoc_image(tmp_path: Path, name: str, payload: str) -> Path:
    from pylibdmtx.pylibdmtx import encode as dmtx_encode
    from PIL import Image

    encoded = dmtx_encode(payload.encode("utf-8"))
    image = Image.frombytes("RGB", (encoded.width, encoded.height), encoded.pixels)
    # libdmtx's native encoding resolution is far smaller than a real printed
    # code photographed at document scale; upscale so the detector's own
    # resize step has something realistic to decode.
    image = image.resize((encoded.width * 6, encoded.height * 6), Image.NEAREST)
    path = tmp_path / name
    image.save(path)
    return path


def test_2ddoc_with_untrusted_authority_is_flagged_invalid(tmp_path) -> None:
    from app.modules.ai.fraud.twodoc import analyse_2ddoc

    image = _write_2ddoc_image(tmp_path, "avis.png", _SAMPLE_2D_DOC)
    evidence = analyse_2ddoc(image, extracted_text=None)

    assert evidence.detector == "twodoc"
    assert evidence.status == "APPLICABLE"
    assert evidence.raw_score == 1.0
    assert "signature 2D-Doc invalide" in evidence.explanation


def test_2ddoc_absent_is_non_applicable(tmp_path) -> None:
    from app.modules.ai.fraud.twodoc import analyse_2ddoc

    plain = tmp_path / "plain.png"
    from PIL import Image

    Image.new("RGB", (80, 60), "white").save(plain)

    evidence = analyse_2ddoc(plain, extracted_text=None)

    assert evidence.status == "NON_APPLICABLE"
    assert evidence.raw_score is None
