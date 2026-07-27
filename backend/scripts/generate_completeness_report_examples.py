"""Generate the two B6 report examples committed for the acceptance demo.

This intentionally uses only the Python standard library so the examples can
be produced in a bare checkout. The API uses ``completeness_report.py``; both
use the same report fields and wording.
"""

from __future__ import annotations

from pathlib import Path
from textwrap import wrap


OUTPUT = Path(__file__).resolve().parents[2] / "output" / "completeness-reports"


def html(data: dict) -> str:
    pieces = "".join(
        f"<tr><td>{name}</td><td>{nature}</td><td>{state}</td></tr>"
        for name, nature, state in data["pieces"]
    )
    documents = "".join(
        f"<tr><td>{name}</td><td>{state}</td><td>{detail}</td></tr>"
        for name, state, detail in data["documents"]
    )
    return f"""<!doctype html><html lang='fr'><meta charset='utf-8'><title>Rapport {data['reference']}</title>
<style>body{{font:16px Arial;color:#17212b;max-width:900px;margin:40px auto;line-height:1.5}}.badge{{padding:5px 10px;border-radius:14px;background:{data['color']};font-weight:bold}}table{{width:100%;border-collapse:collapse;margin:14px 0 28px}}th,td{{padding:9px;border-bottom:1px solid #d8dee4;text-align:left}}th{{background:#f1f5f8}}footer{{font-size:.9em;color:#52606d;border-top:1px solid #d8dee4;padding-top:12px}}</style>
<body><h1>Rapport de complétude du dossier</h1><p>Référence : <strong>{data['reference']}</strong></p><p><span class='badge'>{data['status']}</span> <strong>{data['rate']} %</strong> des pièces obligatoires reçues.</p><p>{data['summary']}</p><h2>Pièces attendues</h2><table><tr><th>Pièce</th><th>Nature</th><th>État</th></tr>{pieces}</table><h2>Lisibilité des documents fournis</h2><table><tr><th>Fichier</th><th>État</th><th>Observation</th></tr>{documents}</table><footer>Rapport d'information issu du contrôle automatique de complétude. Il ne constitue pas une décision d'attribution.<br>Contrôle effectué le 2026-07-27 10:30 UTC.</footer></body></html>"""


def _pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("cp1252", "replace").decode("latin-1")


def pdf(data: dict) -> bytes:
    lines = ["RAPPORT DE COMPLETUDE DU DOSSIER", f"Référence : {data['reference']}", f"Statut : {data['status']} - {data['rate']} % des pièces obligatoires reçues.", "", *wrap(data['summary'], 92), "", "PIECES ATTENDUES"]
    lines += [f"- {name} | {nature} | {state}" for name, nature, state in data["pieces"]]
    lines += ["", "LISIBILITE DES DOCUMENTS FOURNIS"]
    lines += [f"- {name} | {state} | {detail}" for name, state, detail in data["documents"]]
    lines += ["", "Rapport d'information : il ne constitue pas une décision d'attribution."]
    commands = ["BT", "/F1 11 Tf"]
    for index, line in enumerate(lines):
        commands.append(f"1 0 0 1 50 {790 - index * 14} Tm")
        commands.append(f"({_pdf_text(line)}) Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(result)); result.extend(f"{number} 0 obj\n".encode()); result.extend(obj); result.extend(b"\nendobj\n")
    start = len(result); result.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    result.extend(b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    result.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
    return bytes(result)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    reports = {
        "complet": {"reference": "APL-DEMO-COMPLET", "status": "Complet", "rate": 100, "color": "#d9f5e4", "summary": "Votre dossier contient toutes les pièces obligatoires attendues.", "pieces": [("Pièce d'identité", "Obligatoire", "Reçue"), ("RIB", "Obligatoire", "Reçue")], "documents": [("identite.pdf", "Lisible", "Texte extrait et pièce exploitable."), ("rib.pdf", "Lisible", "Texte extrait et pièce exploitable.")]},
        "incomplet": {"reference": "APL-DEMO-INCOMPLET", "status": "Incomplet", "rate": 50, "color": "#fff0cf", "summary": "Votre dossier est incomplet : certaines pièces obligatoires restent à transmettre. Pièce concernée : RIB. Une pièce illisible doit être redéposée.", "pieces": [("Pièce d'identité", "Obligatoire", "Reçue"), ("RIB", "Obligatoire", "Manquante")], "documents": [("rib-flou.pdf", "Illisible", "Image trop floue."), ("bail.pdf", "À vérifier", "La lisibilité n'a pas encore pu être confirmée.")]},
    }
    for name, data in reports.items():
        (OUTPUT / f"rapport-{name}.html").write_text(html(data), encoding="utf-8")
        (OUTPUT / f"rapport-{name}.pdf").write_bytes(pdf(data))


if __name__ == "__main__":
    main()
