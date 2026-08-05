"""Placeholder files for seeded case documents.

⚠️ SYNTHETIC FILES — NOT REAL DOCUMENTS ⚠️

The fixture cases in ``seed.py`` carry document *metadata* only: a name, a size,
a status, a forensic verdict. There was never a file behind them, so the agent
portal's "Consulter" action had nothing to open.

This generates one, and makes sure it can never be mistaken for a real piece:
every page is stamped « PIÈCE FICTIVE » and names the seed it came from. That is
the whole point — the rule in ``docs/roadmap.md`` ("Points d'attention", point 5)
forbids demo data that *hides* the absence of real data, not demo data that
announces itself.

Rendered with Pillow (already a dependency for the fraud image analysis) and
saved through the normal ``citizen.storage`` path, so a fixture file lives
exactly where an uploaded one does and needs no special case when read back.

No new dependency: a PDF is produced by saving the rendered page with Pillow's
PDF writer rather than pulling in a PDF toolkit.
"""

from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.modules.citizen import storage

#: A4 at 150 dpi. Large enough that the OCR and image detectors have something
#: real to chew on if a fixture case is ever pushed through the pipeline.
_PAGE = (1240, 1754)

_INK = (17, 24, 39)
_MUTED = (107, 114, 128)
_STAMP = (220, 38, 38)
_RULE = (209, 213, 219)


#: Candidate TrueType faces, in preference order, across the platforms this repo
#: is developed and deployed on. A real face is required rather than nice-to-have:
#: Pillow's built-in default font has no Latin-1 supplement glyphs, so « PIÈCE »
#: renders as « PI▯CE » — the stamp would be illegible in French, which is the
#: one thing this page has to say clearly.
_FONT_CANDIDATES = (
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
)


def _font_path() -> str | None:
    """First installed candidate, or None when the host has none of them."""
    for candidate in _FONT_CANDIDATES:
        if Path(candidate).is_file():
            return candidate

    # matplotlib bundles DejaVu; if it happens to be installed, use that rather
    # than falling back to the glyph-less default.
    try:
        import matplotlib

        bundled = Path(matplotlib.get_data_path(), "fonts", "ttf", "DejaVuSans.ttf")
        if bundled.is_file():
            return str(bundled)
    except Exception:
        pass

    return None


@lru_cache(maxsize=None)
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """A scalable face at `size`, cached — one page asks for the same sizes often.

    Falls back to Pillow's default (accents will be tofu) rather than failing:
    an unstyled placeholder still beats a script that cannot run.
    """
    path = _font_path()
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass

    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1 has no `size` argument.
        return ImageFont.load_default()


def render_placeholder(
    *,
    requirement_label: str,
    file_name: str,
    reference: str,
) -> Image.Image:
    """One page announcing what it is and what it is not."""
    page = Image.new("RGB", _PAGE, "white")
    draw = ImageDraw.Draw(page)

    margin = 96
    right = _PAGE[0] - margin

    # Stamp band across the top — the first thing read, on purpose.
    draw.rectangle([(0, 0), (_PAGE[0], 132)], fill=_STAMP)
    draw.text((margin, 46), "PIÈCE FICTIVE — DONNÉE DE DÉMONSTRATION", font=_font(34), fill="white")

    y = 260
    draw.text((margin, y), requirement_label, font=_font(56), fill=_INK)
    y += 96
    draw.text((margin, y), file_name, font=_font(30), fill=_MUTED)
    y += 74
    draw.line([(margin, y), (right, y)], fill=_RULE, width=2)

    y += 60
    for label, value in (
        ("Dossier", reference),
        ("Origine", "scripts/seed.py — jeu de données de développement"),
        ("Contenu", "Aucun. Ce fichier ne contient aucune donnée d’allocataire."),
    ):
        draw.text((margin, y), label.upper(), font=_font(24), fill=_MUTED)
        draw.text((margin + 220, y), value, font=_font(28), fill=_INK)
        y += 62

    y += 40
    draw.line([(margin, y), (right, y)], fill=_RULE, width=2)
    y += 48
    for line in (
        "Ce document remplace une pièce justificative dans les dossiers de seed,",
        "afin que la consultation de pièce du portail agent soit démontrable.",
        "Il n’a été produit par aucune administration et n’atteste de rien.",
    ):
        draw.text((margin, y), line, font=_font(28), fill=_MUTED)
        y += 46

    # Diagonal watermark, so a screenshot cropped to any region still shows it.
    watermark = Image.new("RGBA", _PAGE, (0, 0, 0, 0))
    ImageDraw.Draw(watermark).text(
        (140, _PAGE[1] // 2), "FICTIF · FICTIF · FICTIF", font=_font(96), fill=(220, 38, 38, 38)
    )
    page = Image.alpha_composite(page.convert("RGBA"), watermark.rotate(24, expand=False))

    return page.convert("RGB")


def build_bytes(*, requirement_label: str, file_name: str, reference: str, mime_type: str) -> bytes:
    """Render the placeholder in the format the document row claims to be.

    The mime type is honoured rather than normalised to PDF: a row saying
    ``image/jpeg`` must resolve to bytes the viewer renders as an image, or the
    fixture would exercise a path the real data never takes.
    """
    page = render_placeholder(
        requirement_label=requirement_label, file_name=file_name, reference=reference
    )

    buffer = io.BytesIO()
    if "pdf" in mime_type:
        page.save(buffer, format="PDF", resolution=150.0)
    elif "png" in mime_type:
        page.save(buffer, format="PNG", optimize=True)
    else:
        page.save(buffer, format="JPEG", quality=88)

    return buffer.getvalue()


def store_placeholder(
    *, requirement_label: str, file_name: str, reference: str, mime_type: str
) -> str:
    """Write the placeholder to the upload directory. Returns the stored path."""
    return storage.store(
        build_bytes(
            requirement_label=requirement_label,
            file_name=file_name,
            reference=reference,
            mime_type=mime_type,
        ),
        file_name,
    )
