"""Deterministic document metadata forensics — Agent C4, Layer 1.

Ported from the `metadata-extractor` contribution (`metadata_extractor_exiftool.py`).
Extracts a document's metadata and applies five explicit forgery-signal rules —
no AI, always on. The signals are *à vérifier* (to be verified), not verdicts:
each is a reason a human or the LLM layer should look closer.

Two extraction backends, exactly as the original:
  * **ExifTool** if the binary is on PATH — 150+ formats.
  * **Pure-Python PDF parser** otherwise — PDFs only, no dependency.

The 27 MB bundled ExifTool from the contribution is deliberately *not* vendored;
the module detects a system ExifTool and falls back to the Python parser for
PDFs, which covers the common case.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from app.core.logger import logger

# Field names vary by format (PDF vs Office vs image); checked in preference order.
_CREATION_FIELDS = ("CreateDate", "DateTimeOriginal", "CreationDate")
_MODIFICATION_FIELDS = ("ModifyDate", "ModDate", "FileModifyDate")
_SOFTWARE_FIELDS = ("Producer", "Creator", "Software", "Application", "CreatorTool")

#: Graphics editors and online PDF tools — a proof produced with one of these
#: was not produced by a scanner or an office suite, which is the signal.
_SUSPECT_SOFTWARE = (
    "photoshop", "gimp", "paint.net", "paint", "canva", "inkscape", "photopea",
    "pixlr", "pdfescape", "smallpdf", "ilovepdf", "pdf2go", "sejda", "fotor",
)


def exiftool_available() -> bool:
    return shutil.which("exiftool") is not None or shutil.which("exiftool.exe") is not None


def _first_present(raw: dict, fields: tuple[str, ...]) -> tuple[str | None, str | None]:
    for field in fields:
        if raw.get(field):
            return raw[field], field
    return None, None


def _parse_exif_date(value: str | None) -> str | None:
    """ExifTool dates are `YYYY:MM:DD HH:MM:SS[+TZ]`; normalise to ISO."""
    if not value:
        return None
    date_part = str(value).strip().split("+")[0].split("Z")[0].strip()
    try:
        return datetime.strptime(date_part[:19], "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        return str(value)


def _extract_with_exiftool(path: Path) -> dict | None:
    try:
        proc = subprocess.run(
            ["exiftool", "-j", "-a", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode != 0:
            return None
        return json.loads(proc.stdout)[0]
    except (subprocess.SubprocessError, json.JSONDecodeError, IndexError, OSError) as exc:
        logger.warn("ExifTool indisponible ou illisible", {"error": str(exc)})
        return None


def _parse_pdf_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    if date_str.startswith("D:"):
        date_str = date_str[2:]
    digits = re.findall(r"\d+", date_str)
    if digits and len(digits[0]) >= 14:
        d = digits[0]
        return f"{d[0:4]}:{d[4:6]}:{d[6:8]} {d[8:10]}:{d[10:12]}:{d[12:14]}"
    return date_str


def _extract_pdf_fallback(path: Path) -> dict:
    """Pure-Python PDF metadata parser, used when ExifTool is absent."""
    try:
        content = path.read_bytes().decode("latin-1")
    except OSError as exc:
        return {"erreur": f"Impossible de lire le fichier : {exc}"}

    metadata: dict[str, str] = {}
    for key, val in re.findall(r"/([A-Za-z]+)\s*\(([^)]*)\)", content):
        unescaped = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), val)
        metadata[key] = unescaped

    raw: dict[str, str] = {"FileType": "PDF", "FileSize": f"{path.stat().st_size} bytes"}
    for src, dst in (("Producer", "Producer"), ("Creator", "Creator"), ("Author", "Author"), ("Title", "Title")):
        if src in metadata:
            raw[dst] = metadata[src]
    if "CreationDate" in metadata:
        raw["CreateDate"] = _parse_pdf_date(metadata["CreationDate"])
    if "ModDate" in metadata:
        raw["ModifyDate"] = _parse_pdf_date(metadata["ModDate"])
    return raw


def _deterministic_signals(raw: dict, date_creation: str | None, date_modification: str | None,
                           logiciel: str | None, path: Path) -> list[str]:
    """The five explicit forgery-signal rules."""
    flags: list[str] = []

    # 1. Modification recorded before creation.
    if date_creation and date_modification:
        try:
            if datetime.fromisoformat(date_modification) < datetime.fromisoformat(date_creation):
                flags.append("INCOHÉRENCE : date de modification antérieure à la date de création")
        except ValueError:
            pass

    # 2. A date in the future — a tampered clock.
    now = datetime.now()
    for value, label in ((date_creation, "création"), (date_modification, "modification")):
        if value:
            try:
                if datetime.fromisoformat(value) > now:
                    flags.append(
                        f"INCOHÉRENCE : date de {label} ({value}) dans le futur par rapport à "
                        "l'heure système actuelle"
                    )
            except ValueError:
                pass

    # 3. Produced with a graphics editor or online PDF tool.
    if logiciel and any(s in str(logiciel).lower() for s in _SUSPECT_SOFTWARE):
        flags.append(
            f"SIGNAL : produit/modifié avec un logiciel d'édition graphique ou d'édition PDF "
            f"suspect ({logiciel}) plutôt qu'un outil bureautique standard ou un scanner"
        )

    # 4. All software metadata purged.
    if not raw.get("Producer") and not raw.get("Creator") and not raw.get("Software"):
        flags.append(
            "SIGNAL : aucune métadonnée de logiciel présente — a pu être supprimée intentionnellement"
        )

    # 5. Multiple incremental revisions (PDF-specific).
    if path.suffix.lower() == ".pdf":
        try:
            eof_count = len(re.findall(b"%%EOF", path.read_bytes()))
            if eof_count > 1:
                flags.append(
                    f"SIGNAL : Le document PDF contient des révisions incrémentales multiples "
                    f"({eof_count} blocs %%EOF détectés), ce qui indique qu'il a été édité ou "
                    "ré-enregistré après sa création initiale."
                )
        except OSError:
            pass

    return flags


def extract_metadata(path: Path) -> dict:
    """Extract metadata and compute deterministic forgery signals for one file.

    Returns a dict with the parsed fields, the raw metadata, and
    `signaux_a_verifier`. On an unreadable/unsupported file, returns `{erreur: …}`.
    """
    if not path.exists():
        return {"erreur": f"Fichier introuvable : {path}"}

    raw = _extract_with_exiftool(path) if exiftool_available() else None
    if raw is None:
        if path.suffix.lower() == ".pdf":
            raw = _extract_pdf_fallback(path)
            if "erreur" in raw:
                return raw
        else:
            return {
                "erreur": (
                    f"ExifTool requis pour ce format ({path.suffix}). "
                    "Installez ExifTool pour analyser ce type de fichier."
                ),
                "signaux_a_verifier": [],
            }

    date_creation_raw, champ_creation = _first_present(raw, _CREATION_FIELDS)
    date_modif_raw, champ_modif = _first_present(raw, _MODIFICATION_FIELDS)
    logiciel, champ_logiciel = _first_present(raw, _SOFTWARE_FIELDS)

    date_creation = _parse_exif_date(date_creation_raw)
    date_modification = _parse_exif_date(date_modif_raw)

    return {
        "fichier": path.name,
        "type_fichier": raw.get("FileType") or raw.get("MIMEType"),
        "date_creation": date_creation,
        "date_modification": date_modification,
        "logiciel": logiciel,
        "auteur_declare": raw.get("Author") or raw.get("Creator"),
        "metadonnees_brutes": raw,
        "signaux_a_verifier": _deterministic_signals(
            raw, date_creation, date_modification, logiciel, path
        ),
    }
