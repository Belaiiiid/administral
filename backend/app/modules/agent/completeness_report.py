"""Citizen-readable report emitted from the deterministic B6 completeness result.

The facts, status and document readability are computed before this module is
called.  The optional small LLM is deliberately limited to one short opening
sentence; it cannot select documents, change a status, or contribute to the
tables rendered in HTML/PDF.
"""

from __future__ import annotations

from html import escape
from io import BytesIO
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.modules.agent.models import Case, DocumentStatus, ReportOutcome


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportItem(_CamelModel):
    label: str
    required: bool
    received: bool


class DocumentReadability(_CamelModel):
    file_name: str
    status: Literal["lisible", "illisible", "a_verifier"]
    detail: str


class CompletenessReportView(_CamelModel):
    application_number: str
    status: Literal["complet", "incomplet"]
    completion_rate: int
    checked_at: str
    summary: str
    missing_required_documents: list[str]
    items: list[ReportItem]
    document_readability: list[DocumentReadability]
    disclaimer: str


def _readability(document) -> DocumentReadability:
    if document.status == DocumentStatus.rejected:
        return DocumentReadability(
            file_name=document.file_name,
            status="illisible",
            detail=document.error_message or "La pièce n'est pas exploitable.",
        )
    if document.status == DocumentStatus.validated and document.extracted_at is not None:
        return DocumentReadability(
            file_name=document.file_name,
            status="lisible",
            detail="Texte extrait et pièce exploitable.",
        )
    return DocumentReadability(
        file_name=document.file_name,
        status="a_verifier",
        detail="La lisibilité n'a pas encore pu être confirmée.",
    )


def _template_summary(status: str, missing: list[str], readable: list[DocumentReadability]) -> str:
    unreadable = sum(item.status == "illisible" for item in readable)
    if status == "complet":
        text = "Votre dossier contient toutes les pièces obligatoires attendues."
    else:
        text = "Votre dossier est incomplet : certaines pièces obligatoires restent à transmettre."
        if missing:
            text += f" Pièce(s) concernée(s) : {', '.join(missing)}."
    if unreadable:
        text += f" {unreadable} pièce(s) illisible(s) devra/devront être redéposée(s)."
    return text


def _light_rephrase(template: str) -> str:
    """Use Mistral Small only when configured; failure keeps the exact template.

    The output is intentionally not used for a claim-bearing table or status.
    It is capped to a single sentence and a failed request never blocks B6.
    """
    if not settings.mistral_api_key:
        return template
    try:
        response = httpx.post(
            settings.mistral_api_url,
            headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            json={
                "model": settings.mistral_classifier_model,
                "messages": [
                    {"role": "system", "content": "Reformule une seule phrase, sans ajouter de fait, chiffre, conseil ou règle."},
                    {"role": "user", "content": template},
                ],
                "temperature": 0,
                "max_tokens": 90,
            },
            timeout=8.0,
        )
        candidate = response.json()["choices"][0]["message"]["content"].strip()
        # A malformed or verbose answer must not alter the deterministic report.
        return candidate if candidate and len(candidate) <= 350 and "\n" not in candidate else template
    except Exception:  # noqa: BLE001 - reporting must always follow B6
        return template


def build_report(case: Case, *, use_llm: bool = True) -> CompletenessReportView:
    """Build a report for either B6 outcome. Raises only if B6 was not run."""
    report = case.completeness_report
    if report is None:
        raise HTTPException(status_code=409, detail="Le contrôle de complétude (B6) n'a pas encore été exécuté.")

    status: Literal["complet", "incomplet"] = (
        "complet" if report.outcome == ReportOutcome.passed else "incomplet"
    )
    items = [ReportItem(label=i.label, required=i.required, received=i.received) for i in report.items]
    missing = [i.label for i in report.items if i.required and not i.received]
    readability = [_readability(document) for document in case.documents]
    summary = _template_summary(status, missing, readability)
    if use_llm:
        summary = _light_rephrase(summary)

    return CompletenessReportView(
        application_number=case.application_number,
        status=status,
        completion_rate=report.completion_rate,
        checked_at=report.checked_at.isoformat(),
        summary=summary,
        missing_required_documents=missing,
        items=items,
        document_readability=readability,
        disclaimer="Rapport d'information issu du contrôle automatique de complétude. Il ne constitue pas une décision d'attribution.",
    )


def render_html(report: CompletenessReportView) -> str:
    """Server-side HTML template usable as-is or as source for a PDF."""
    item_rows = "".join(
        f"<tr><td>{escape(item.label)}</td><td>{'Obligatoire' if item.required else 'Facultative'}</td>"
        f"<td>{'Reçue' if item.received else 'Manquante'}</td></tr>"
        for item in report.items
    ) or "<tr><td colspan='3'>Aucune pièce enregistrée.</td></tr>"
    readability_rows = "".join(
        f"<tr><td>{escape(item.file_name)}</td><td>{escape(item.status.replace('_', ' '))}</td>"
        f"<td>{escape(item.detail)}</td></tr>"
        for item in report.document_readability
    ) or "<tr><td colspan='3'>Aucun document déposé.</td></tr>"
    tone = "success" if report.status == "complet" else "warning"
    return f"""<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>Rapport {escape(report.application_number)}</title>
<style>body{{font-family:Arial,sans-serif;color:#17212b;max-width:900px;margin:40px auto;line-height:1.5}}h1{{margin-bottom:4px}}.badge{{padding:5px 10px;border-radius:14px;font-weight:bold}}.success{{background:#d9f5e4;color:#126534}}.warning{{background:#fff0cf;color:#8a5700}}table{{width:100%;border-collapse:collapse;margin:14px 0 28px}}th,td{{padding:9px;border-bottom:1px solid #d8dee4;text-align:left}}th{{background:#f1f5f8}}footer{{font-size:.9em;color:#52606d;border-top:1px solid #d8dee4;padding-top:12px}}</style></head><body>
<h1>Rapport de complétude du dossier</h1><p>Référence : <strong>{escape(report.application_number)}</strong></p>
<p><span class='badge {tone}'>{escape(report.status.capitalize())}</span> <strong>{report.completion_rate} %</strong> des pièces obligatoires reçues.</p>
<p>{escape(report.summary)}</p><h2>Pièces attendues</h2><table><thead><tr><th>Pièce</th><th>Nature</th><th>État</th></tr></thead><tbody>{item_rows}</tbody></table>
<h2>Lisibilité des documents fournis</h2><table><thead><tr><th>Fichier</th><th>État</th><th>Observation</th></tr></thead><tbody>{readability_rows}</tbody></table>
<footer>{escape(report.disclaimer)}<br>Contrôle effectué le {escape(report.checked_at)}.</footer></body></html>"""


def render_pdf(report: CompletenessReportView) -> bytes:
    """Produce a compact, printable PDF from the same deterministic view."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    stream = BytesIO()
    document = SimpleDocTemplate(stream, pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm)
    styles = getSampleStyleSheet()
    story = [Paragraph("Rapport de complétude du dossier", styles["Title"]),
             Paragraph(f"Référence : <b>{escape(report.application_number)}</b>", styles["BodyText"]),
             Paragraph(f"Statut : <b>{report.status.capitalize()}</b> - {report.completion_rate}% des pièces obligatoires reçues.", styles["BodyText"]),
             Spacer(1, 10), Paragraph(escape(report.summary), styles["BodyText"]), Spacer(1, 12)]
    story.append(Paragraph("Pièces attendues", styles["Heading2"]))
    pieces = [["Pièce", "Nature", "État"]] + [[i.label, "Obligatoire" if i.required else "Facultative", "Reçue" if i.received else "Manquante"] for i in report.items]
    story.append(_table(pieces))
    story += [Spacer(1, 14), Paragraph("Lisibilité des documents fournis", styles["Heading2"])]
    readability = [["Fichier", "État", "Observation"]] + [[d.file_name, d.status.replace("_", " "), d.detail] for d in report.document_readability]
    story.append(_table(readability))
    story += [Spacer(1, 12), Paragraph(escape(report.disclaimer), styles["Italic"])]
    document.build(story)
    return stream.getvalue()


def _table(rows: list[list[str]]):
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import Table, TableStyle
    table = Table(rows, colWidths=[7 * cm, 3 * cm, 7 * cm], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF0F5")), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B8C4CE")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("LEADING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return table
