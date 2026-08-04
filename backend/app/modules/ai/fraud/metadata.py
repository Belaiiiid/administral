"""Deterministic document metadata forensics — Agent C4, Layer 1.

Ported from the `metadata-extractor` contribution (`metadata_extractor_exiftool.py`).
Extracts a document's metadata and applies explicit forgery-signal rules —
no AI, always on. The signals are *à vérifier* (to be verified), not verdicts:
each is a reason a human or the LLM layer should look closer.

Two pure-Python extraction backends, no external binary:
  * **PDF** — the Info-dictionary regex parser below.
  * **JPG/PNG** — `exifread` for classic EXIF (all IFDs, not just the base
    one Pillow's `Image.getexif()` exposes) plus a direct scan of any
    embedded XMP packet, since several common editors (Photoshop, GIMP,
    Canva, online PDF tools) write Producer/CreatorTool only to XMP.

This previously shelled out to the ExifTool binary when present, falling back
to a much weaker PIL-only reader otherwise. That made metadata coverage
depend on whatever happened to be installed on the host, and the fallback had
a real gap: `Image.getexif()` only reads the base IFD0, so `DateTimeOriginal`
(stored in the EXIF sub-IFD) was silently never found. `exifread` plus the
XMP scan removes both the environment dependency and that gap.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import exifread
from PIL import Image

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

#: Local (namespace-stripped) XMP field names mapped to the ExifTool-style keys
#: used everywhere else in this module.
_XMP_FIELDS = {"CreatorTool": "Creator", "Producer": "Producer", "ModifyDate": "ModifyDate", "CreateDate": "CreateDate"}


def _first_present(raw: dict, fields: tuple[str, ...]) -> tuple[str | None, str | None]:
    for field in fields:
        if raw.get(field):
            return raw[field], field
    return None, None


def _parse_exif_date(value: str | None) -> str | None:
    """EXIF/ExifTool dates are `YYYY:MM:DD HH:MM:SS[+TZ]`; XMP dates are ISO
    8601. Both normalise to ISO."""
    if not value:
        return None
    text = str(value).strip()
    try:
        # Downstream rules compare against `datetime.now()` (naive); XMP dates
        # carry a UTC offset that EXIF/PDF dates never do, so it is dropped
        # here rather than producing a mix of naive and aware datetimes.
        return datetime.fromisoformat(text).replace(tzinfo=None).isoformat()
    except ValueError:
        pass
    date_part = text.split("+")[0].split("Z")[0].strip()
    try:
        return datetime.strptime(date_part[:19], "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        return text


def _extract_xmp(path: Path) -> dict[str, str]:
    """Read Producer/CreatorTool/dates from an embedded XMP packet, if any.

    Namespace-agnostic on purpose: different writers declare `xmp:`/`pdf:`
    with different prefixes (or none), so matching is done on the local tag
    name, in both its attribute form (`xmp:CreatorTool="..."`) and element
    form (`<xmp:CreatorTool>...</xmp:CreatorTool>`).
    """
    try:
        raw_bytes = path.read_bytes()
    except OSError:
        return {}
    start = raw_bytes.find(b"<x:xmpmeta")
    end = raw_bytes.find(b"</x:xmpmeta>")
    if start == -1 or end == -1:
        return {}
    end += len(b"</x:xmpmeta>")
    try:
        root = ET.fromstring(raw_bytes[start:end])
    except ET.ParseError:
        return {}

    fields: dict[str, str] = {}
    for element in root.iter():
        local = element.tag.rsplit("}", 1)[-1]
        if local in _XMP_FIELDS and element.text and element.text.strip():
            fields.setdefault(_XMP_FIELDS[local], element.text.strip())
        for attr_name, attr_value in element.attrib.items():
            attr_local = attr_name.rsplit("}", 1)[-1]
            if attr_local in _XMP_FIELDS and attr_value.strip():
                fields.setdefault(_XMP_FIELDS[attr_local], attr_value.strip())
    return fields


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
    """Pure-Python PDF Info-dictionary parser."""
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

    # 4. All software metadata purged. PDF-only: a native PDF exporter (Word,
    # LibreOffice, a scanner, a print-to-PDF driver) always writes Producer/
    # Creator, so its absence there is informative. On JPG/PNG this is not a
    # forgery signal: phones and messaging apps (WhatsApp, etc.) strip EXIF
    # from essentially every photo they touch, authentic or not, so the same
    # rule on images mostly fires on ordinary phone uploads.
    if path.suffix.lower() == ".pdf" and not raw.get("Producer") and not raw.get("Creator") and not raw.get("Software"):
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


def _extract_image_metadata(path: Path) -> dict:
    """Read EXIF (via exifread, all IFDs) and any embedded XMP packet.

    No external binary required. `exifread` covers the classic EXIF sub-IFDs
    (`DateTimeOriginal` lives in the Exif sub-IFD, not the base IFD0 that
    `Image.getexif()` alone exposes), and the XMP scan catches
    Producer/CreatorTool written by tools that skip classic EXIF entirely.
    """
    try:
        with Image.open(path) as image:
            file_type = (image.format or path.suffix.removeprefix(".")).upper()
            width, height = image.width, image.height
    except (OSError, ValueError):
        return {"erreur": "Métadonnées image illisibles."}

    try:
        with path.open("rb") as handle:
            exif_tags = exifread.process_file(handle, details=False)
    except (OSError, ValueError):
        exif_tags = {}
    xmp = _extract_xmp(path)

    def tag(*names: str) -> str | None:
        for name in names:
            value = exif_tags.get(name)
            if value not in (None, ""):
                return str(value)
        return None

    return {
        "FileType": file_type,
        "ImageWidth": width,
        "ImageHeight": height,
        "Software": tag("Image Software") or xmp.get("Creator"),
        "Producer": xmp.get("Producer"),
        "Creator": xmp.get("Creator"),
        "DateTimeOriginal": tag("EXIF DateTimeOriginal", "Image DateTime") or xmp.get("CreateDate"),
        "ModifyDate": xmp.get("ModifyDate"),
        "Artist": tag("Image Artist"),
    }


def extract_metadata(path: Path) -> dict:
    """Extract metadata and compute deterministic forgery signals for one file.

    Returns a dict with the parsed fields, the raw metadata, and
    `signaux_a_verifier`. On an unreadable/unsupported file, returns `{erreur: …}`.
    """
    if not path.exists():
        return {"erreur": f"Fichier introuvable : {path}"}

    if path.suffix.lower() == ".pdf":
        raw = _extract_pdf_fallback(path)
        if "erreur" in raw:
            return raw
    elif path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
        raw = _extract_image_metadata(path)
        if "erreur" in raw:
            return {**raw, "signaux_a_verifier": []}
    else:
        return {
            "erreur": f"Format non supporté pour l'analyse de métadonnées ({path.suffix}).",
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
