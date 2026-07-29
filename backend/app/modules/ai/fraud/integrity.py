"""Structural checks for administrative documents.

These controls make no authenticity claim.  They expose verifiable facts for
the human reviewer: an exact duplicate in the same dossier, an embedded QR
code, an MRZ checksum, and the presence (not validity) of a PDF signature.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import cv2
import fitz
import numpy as np


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


def _pdf_signature_state(path: Path) -> str:
    if path.suffix.lower() != ".pdf":
        return "NON_APPLICABLE"
    try:
        document = fitz.open(path)
        try:
            has_signature = document.get_sigflags() > 0
        finally:
            document.close()
        if has_signature:
            return "PRESENT_A_VERIFIER"
        return "ABSENTE"
    except Exception:
        return "ILLISIBLE"


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
    signature_state = _pdf_signature_state(path)
    signals: list[str] = []
    if duplicate_count > 1:
        signals.append(
            f"SIGNAL D'INTÃ‰GRITÃ‰ : ce fichier est dÃ©posÃ© {duplicate_count} fois dans ce dossier (mÃªme empreinte SHA-256)."
        )
    if mrz_detected and mrz_checksum_valid is False:
        signals.append("SIGNAL MRZ : une zone lisible Ã  la machine a Ã©tÃ© dÃ©tectÃ©e, mais son checksum est invalide.")
    if signature_state == "PRESENT_A_VERIFIER":
        signals.append("INFORMATION : le PDF contient un champ de signature ; sa validitÃ© cryptographique doit Ãªtre vÃ©rifiÃ©e auprÃ¨s de l'Ã©metteur.")

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
