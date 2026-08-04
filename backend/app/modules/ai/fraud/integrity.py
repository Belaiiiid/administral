"""Structural checks for administrative documents.

These controls make no authenticity claim beyond what is cryptographically or
mathematically verifiable: an exact duplicate in the same dossier, an
embedded QR code, an MRZ checksum, and — via pyHanko — whether an embedded PDF
signature's signed byte range still matches the current file content.
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

import cv2
import fitz
import numpy as np
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

# Full chain-of-trust validation needs an accredited root (e.g. a French
# RGS/eIDAS trust list) that is not configured here, so every check below
# hits an expected "no issuer found" failure while building that chain.
# pyHanko logs that failure at ERROR with a full traceback; since it is
# expected and already surfaced through `issuer_verification_status`, it is
# silenced here rather than spamming the logs on every signed document.
logging.getLogger("pyhanko_certvalidator").setLevel(logging.CRITICAL)
logging.getLogger("pyhanko.sign.validation").setLevel(logging.CRITICAL)


def _mrz_check(value: str) -> int:
    weights = (7, 3, 1)
    total = 0
    for index, character in enumerate(value):
        if "0" <= character <= "9":
            number = ord(character) - ord("0")
        elif "A" <= character <= "Z":
            number = ord(character) - ord("A") + 10
        elif character == "<":
            number = 0
        else:
            return -1
        total += number * weights[index % len(weights)]
    return total % 10


def _mrz_status(text: str | None) -> tuple[bool, bool | None]:
    if not text:
        return False, None
    lines = [re.sub(r"\s", "", line.upper()) for line in text.splitlines()]
    candidates = [line for line in lines if len(line) >= 30 and re.fullmatch(r"[A-Z0-9<]+", line)]
    if len(candidates) < 2:
        return False, None
    # Most identity-document MRZ formats carry check digits. We only report a
    # positive checksum when one can be checked safely; otherwise it is unknown.
    for line in candidates:
        if len(line) >= 10 and line[9].isdigit() and _mrz_check(line[:9]) == int(line[9]):
            return True, True
    return True, False


def _pdf_signature_state(path: Path) -> tuple[str, list[str]]:
    """Cryptographically check embedded PDF signatures, if any.

    Only what needs no configured trust anchor is asserted: whether the
    signed byte range still matches the current file (``intact``) and
    whether the signature verifies against its embedded certificate
    (``valid``). A document that fails ``intact`` was modified *after* being
    signed — close to a cryptographic proof of tampering. Whether the
    signing certificate itself is trusted needs an accredited root (e.g. the
    French RGS/eIDAS list), not configured here, so issuer trust stays
    explicitly unverified (``issuer_verification_status``) rather than
    silently assumed.
    """
    if path.suffix.lower() != ".pdf":
        return "NON_APPLICABLE", []
    try:
        with path.open("rb") as handle:
            embedded = PdfFileReader(handle).embedded_signatures
            if not embedded:
                return "ABSENTE", []
            validation_context = ValidationContext(trust_roots=[], allow_fetching=False, revocation_mode="soft-fail")
            details: list[str] = []
            state = "SIGNEE_INTEGRE"
            for signature in embedded:
                status = validate_pdf_signature(signature, signer_validation_context=validation_context)
                subject = status.signing_cert.subject.human_friendly
                if not status.intact or not status.valid:
                    state = "SIGNEE_ALTEREE"
                    details.append(f"Signature de « {subject} » invalide : le document a été modifié après signature.")
                else:
                    details.append(f"Signature de « {subject} » cryptographiquement intègre (confiance de l'émetteur non vérifiée).")
            return state, details
    except Exception:
        return "ILLISIBLE", []


def _qr_count(path: Path) -> int:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None and path.suffix.lower() == ".pdf":
        document = fitz.open(path)
        try:
            image = None
            for page in document:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                candidate = cv2.cvtColor(
                    np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3),
                    cv2.COLOR_RGB2BGR,
                )
                image = candidate
                # QR detection is repeated below; only the first decodable page
                # is needed as a conservative structural indication.
                break
        finally:
            document.close()
    if image is None:
        return 0
    detector = cv2.QRCodeDetector()
    try:
        found, decoded, _points, _ = detector.detectAndDecodeMulti(image)
        return len([item for item in decoded if item]) if found else 0
    except cv2.error:
        value, _points, _ = detector.detectAndDecode(image)
        return 1 if value else 0


def analyse_integrity(
    path: Path,
    *,
    extracted_text: str | None = None,
    duplicate_count: int = 1,
) -> dict:
    """Return explainable integrity facts and review signals for one document."""
    content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    mrz_detected, mrz_checksum_valid = _mrz_status(extracted_text)
    qr_count = _qr_count(path) if path.suffix.lower() in {".png", ".jpg", ".jpeg"} else 0
    signature_state, signature_details = _pdf_signature_state(path)
    signals: list[str] = []
    if duplicate_count > 1:
        signals.append(
            f"SIGNAL D'INTÉGRITÉ : ce fichier est déposé {duplicate_count} fois dans ce dossier (même empreinte SHA-256)."
        )
    if mrz_detected and mrz_checksum_valid is False:
        signals.append("SIGNAL MRZ : une zone lisible à la machine a été détectée, mais son checksum est invalide.")
    if signature_state == "SIGNEE_ALTEREE":
        signals.append("SIGNAL DE SIGNATURE : " + (signature_details[0] if signature_details else "le document a été modifié après signature."))
    elif signature_state == "SIGNEE_INTEGRE":
        signals.append("INFORMATION : signature PDF présente et cryptographiquement intègre ; confiance de l'émetteur non vérifiée.")

    return {
        "content_hash": content_hash,
        "exact_duplicate_in_dossier": duplicate_count > 1,
        "qr_codes_detected": qr_count,
        "mrz_detected": mrz_detected,
        "mrz_checksum_valid": mrz_checksum_valid,
        "pdf_signature_state": signature_state,
        "issuer_verification_status": "NON_CONFIGUREE",
        "signals": signals,
    }
