"""2D-Doc (ANTS) decoding and cryptographic verification.

Many French administrative documents (avis d'imposition, justificatif de
domicile, bulletin de salaire, carte d'identité) carry a 2D-Doc Data Matrix:
a barcode whose payload is digitally signed by an ANTS-accredited authority.
Unlike every other detector in this module, this one can produce genuine
*positive* evidence of authenticity — a signature that verifies against the
real ANTS trust list is close to a cryptographic guarantee that the encoded
fields were issued by that authority and not altered since.

The realistic fraud pattern this catches is broader than "is the signature
valid": a forger who edits the visible/printed text but leaves a genuine
barcode in place (their own from an earlier document, or one lifted from
someone else's) produces a document whose barcode verifies perfectly while
its *content* no longer matches what is printed on the page. So both checks
matter here: does the signature verify, and does the encoded data actually
show up in the extracted text.

Uses the `fr_2ddoc_parser` library (DINUM/betagouv), which embeds the real
ANTS Trusted Service List — no certificate management needed here. Data
Matrix decoding is `pylibdmtx`, not `pyzbar`: `pyzbar` (ZBar) could not
decode a real Data Matrix in testing, while `pylibdmtx` (libdmtx, built for
this symbology) did.
"""

from __future__ import annotations

import warnings
from pathlib import Path

from fr_2ddoc_parser.api import decode_2d_doc
from fr_2ddoc_parser.exception.exceptions import TwoDDocError
from pylibdmtx.pylibdmtx import decode as decode_datamatrix

from app.modules.ai.fraud.ela import _pages, _resize
from app.modules.ai.fraud.fusion import DetectorEvidence

# A handful of ANTS TSL certificates trip cryptography's stricter X.509
# SubjectKeyIdentifier length check on newer `cryptography` releases; the
# library still loads them correctly, so this is noise, not a real problem.
warnings.filterwarnings("ignore", message=r"Attribute's length must be", module="fr_2ddoc_parser.*")

_MIN_MATCHABLE_FIELD_LENGTH = 4


def _datamatrix_strings(path: Path) -> list[str]:
    """Decode every Data Matrix payload found on any page/image."""
    strings: list[str] = []
    for page in _pages(path):
        # 2D-Doc codes are dense (often 1000+ bytes payload); the 1024px cap
        # used for the pixel-forensics detectors is too coarse to decode one.
        image = _resize(page, maximum=2200)
        for result in decode_datamatrix(image):
            try:
                strings.append(result.data.decode("utf-8"))
            except UnicodeDecodeError:
                continue
    return strings


def _flatten_values(value: object, out: list[str]) -> None:
    if isinstance(value, dict):
        for item in value.values():
            _flatten_values(item, out)
    elif value is not None:
        text = str(value).strip()
        if len(text) >= _MIN_MATCHABLE_FIELD_LENGTH:
            out.append(text)


def _content_match_ratio(typed: object, extracted_text: str) -> tuple[int, int]:
    """How many of the 2D-Doc's own fields are findable in the OCR'd text.

    A genuine document's visible fields should mostly reappear in its own
    barcode; a barcode copied from a different document — a lazier forgery
    than fabricating a signature outright — will not match.
    """
    values: list[str] = []
    _flatten_values(typed.model_dump(mode="json"), values)
    haystack = "".join(extracted_text.split()).upper()
    matched = sum(1 for v in values if "".join(v.split()).upper() in haystack)
    return matched, len(values)


def analyse_2ddoc(path: Path, extracted_text: str | None) -> DetectorEvidence:
    if path.suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
        return DetectorEvidence("twodoc", "NON_APPLICABLE", None, 0.0, "Format non pris en charge pour la lecture 2D-Doc.")

    decoded = []
    for raw in _datamatrix_strings(path):
        try:
            decoded.append(decode_2d_doc(raw))
        except TwoDDocError:
            continue  # a Data Matrix on the page that isn't a 2D-Doc payload

    if not decoded:
        return DetectorEvidence("twodoc", "NON_APPLICABLE", None, 0.0, "Aucun code 2D-Doc détecté sur le document.")

    reasons: list[str] = []
    score = 0.0
    for result in decoded:
        doc_label = result.header.doc_type
        if not result.is_valid:
            score = 1.0
            reasons.append(f"signature 2D-Doc invalide ou émetteur non reconnu par l'ANTS (type {doc_label}).")
            continue
        if extracted_text:
            matched, total = _content_match_ratio(result.typed, extracted_text)
            if total and matched / total < 0.5:
                score = max(score, 0.85)
                reasons.append(
                    f"signature 2D-Doc valide mais son contenu ({matched}/{total} champs) ne correspond pas au "
                    f"texte visible du document (type {doc_label}) — code potentiellement issu d'un autre document."
                )
            else:
                reasons.append(f"2D-Doc vérifié cryptographiquement par l'ANTS et cohérent avec le contenu visible (type {doc_label}).")
        else:
            reasons.append(f"2D-Doc vérifié cryptographiquement par l'ANTS (type {doc_label}) ; contenu non recoupé (texte OCR indisponible).")

    confidence = 0.95 if extracted_text else 0.80
    return DetectorEvidence(
        "twodoc", "APPLICABLE", score, confidence,
        " ".join(reasons),
        limitations=[] if extracted_text else ["Le contenu du 2D-Doc n'a pas pu être recoupé avec le texte visible (OCR non fourni)."],
    )
