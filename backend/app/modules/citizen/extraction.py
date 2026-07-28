"""Text extraction from an uploaded document.

Aligned with the Squad_B backend (`uploads/main.py`, `extract_document`):

  * `native_pdf` — pdfplumber reads a PDF's text layer. Kept only when it yields
    at least `_NATIVE_MIN_CHARS`; below that the PDF is treated as a scan and
    sent to OCR. A near-empty native extraction is worse than none — it looks
    like a blank document instead of triggering the fallback.
  * `mistral_ocr` — Mistral's OCR endpoint reads a scan or image, from a base64
    data URL. This closes the gap the first version left as a stub.

Degrades honestly: no key, or an OCR failure, yields empty text with a reason,
never fabricated content.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import httpx
import pdfplumber

from app.core.config import settings
from app.core.logger import logger
from app.modules.citizen.models import ExtractionMethod

#: The preview shown in the UI is capped — the full text can be large and the
#: panel only needs enough to reassure the citizen the right document was read.
PREVIEW_CHARS = 500

#: Below this many characters, a "native" PDF extraction is treated as failure
#: and OCR takes over. Matches Squad_B's threshold.
_NATIVE_MIN_CHARS = 40

_OCR_TIMEOUT_S = 60.0


def _sanitize(text: str) -> str:
    """Strip characters PostgreSQL cannot store in a text/JSONB column.

    Real PDFs' extracted text routinely contains a NUL byte (`\\x00`) and other
    C0 control characters — artifacts of font encodings and layout. PostgreSQL
    rejects NUL in text outright (and JSONB rejects `\\u0000`), so an unsanitised
    extraction turns a perfectly ordinary utility bill into a 500 at insert time.

    Tabs, newlines and carriage returns are kept — legitimate layout that reads
    better in the preview. Everything else below 0x20 is dropped.
    """
    return "".join(ch for ch in text if ch >= " " or ch in "\t\n\r")


@dataclass
class ExtractionResult:
    method: ExtractionMethod | None
    text: str
    error: str | None = None

    @property
    def preview(self) -> str | None:
        if not self.text:
            return None
        return self.text[:PREVIEW_CHARS]


def _extract_native_pdf(data: bytes) -> str:
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
        return _sanitize(text)
    except Exception as exc:  # noqa: BLE001 — a corrupt PDF is a data problem, not a crash
        logger.warn("Lecture PDF impossible", {"error": str(exc)})
        return ""


def _extract_with_mistral_ocr(data: bytes, mime_type: str) -> str:
    """Mistral OCR on a scan or image. Raises on failure; the caller degrades.

    Ported from Squad_B's `extract_with_mistral_ocr`: the file is sent as a
    base64 data URL to the dedicated OCR model, and the page markdown is joined.
    """
    if not settings.mistral_api_key:
        raise RuntimeError("OCR requis, mais MISTRAL_API_KEY est absente.")

    encoded = base64.b64encode(data).decode("ascii")
    response = httpx.post(
        settings.mistral_ocr_url,
        headers={
            "Authorization": f"Bearer {settings.mistral_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.mistral_ocr_model,
            "document": {
                "type": "document_url",
                "document_url": f"data:{mime_type};base64,{encoded}",
            },
        },
        timeout=_OCR_TIMEOUT_S,
    )
    response.raise_for_status()
    pages = response.json().get("pages", [])
    return _sanitize("\n".join(page.get("markdown", "") for page in pages).strip())


def extract_text(data: bytes, mime_type: str) -> ExtractionResult:
    """Pull text from an upload, choosing the method by content.

    A PDF with a usable text layer never touches the network. A scan, an image,
    or a text-less PDF falls through to OCR — and only when a key is configured.
    """
    if mime_type == "application/pdf":
        native = _extract_native_pdf(data)
        if len(native) >= _NATIVE_MIN_CHARS:
            return ExtractionResult(method=ExtractionMethod.native_pdf, text=native)
        # Too little text — treat as a scan and fall through to OCR.

    try:
        text = _extract_with_mistral_ocr(data, mime_type)
    except Exception as exc:  # noqa: BLE001 — OCR failure degrades, never crashes upload
        logger.warn("OCR indisponible", {"error": str(exc)})
        return ExtractionResult(method=None, text="", error=f"OCR indisponible : {exc}")

    if not text:
        return ExtractionResult(
            method=ExtractionMethod.mistral_ocr,
            text="",
            error="L'OCR n'a retourné aucun contenu exploitable.",
        )

    return ExtractionResult(method=ExtractionMethod.mistral_ocr, text=text)
