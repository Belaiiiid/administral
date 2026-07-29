"""Optional adapter for a deployed document-forgery localisation model.

The application never pretends a model ran when no model endpoint is configured.
It accepts a locally hosted TruFor-compatible service later, keeping inference
out of the web process and leaving its result as review evidence only.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from app.core.config import settings


def analyse_with_vision_model(path: Path) -> dict:
    if not settings.fraud_vision_endpoint:
        return {"provider": "TRUFOR", "status": "NON_CONFIGURE", "score": None, "message": "ModÃ¨le CV non dÃ©ployÃ©.", "pages": []}
    try:
        with path.open("rb") as file_handle:
            response = httpx.post(
                settings.fraud_vision_endpoint,
                files={"file": (path.name, file_handle, "application/octet-stream")},
                timeout=settings.fraud_vision_timeout_seconds,
            )
        response.raise_for_status()
        payload = response.json()
        score = payload.get("score")
        pages = payload.get("pages", [])
        if isinstance(pages, list):
            for page in pages:
                if "regions" in page and isinstance(page["regions"], list):
                    # Filtrer les faux positifs (ne garder que > 75%)
                    # Et trier par score décroissant (sans limite de nombre)
                    filtered = [
                        r for r in page["regions"]
                        if isinstance(r, dict) and r.get("confidence_pct", 0) >= 75.0
                    ]
                    page["regions"] = sorted(
                        filtered,
                        key=lambda r: r.get("confidence_pct", 0),
                        reverse=True
                    )
        
        return {
            "provider": "TRUFOR",
            "status": "TERMINE",
            "score": float(score) if isinstance(score, int | float) else None,
            "message": "Score fourni par le service de localisation CV ; à confronter aux autres preuves.",
            "device": str(payload.get("device", "inconnu")),
            "pages": pages if isinstance(pages, list) else [],
        }
    except Exception as exc:  # noqa: BLE001 - an unavailable model must not block a dossier
        return {"provider": "TRUFOR", "status": "INDISPONIBLE", "score": None, "message": f"Service CV indisponible : {exc}", "pages": []}
