"""Checklist generation — Mistral first, deterministic rules as the safety net.

The single entry point `dossier.py` calls. Mirrors the shape of every other
degrading AI module in this project (`ai.coherence.service`, `ai.fraud.service`):
try the model, and on anything short of a clean, grounded answer, fall back to
a result that is always available and always correct by construction — here,
`checklist_rules.generate_personalized_checklist`, which needs no network call
and cannot fail.
"""

from __future__ import annotations

from app.modules.ai.checklist.mistral_client import select_checklist_items
from app.modules.citizen.checklist import ChecklistTemplate
from app.modules.citizen.checklist_rules import generate_personalized_checklist
from app.modules.profiling.schemas.profil import ProfilPartiel


def generate_checklist(profil: ProfilPartiel) -> tuple[ChecklistTemplate, ...]:
    """The documents this citizen's dossier requires.

    Mistral is asked to select from the known, curated catalog; the
    deterministic rules run whenever it is unavailable, fails, times out, or
    returns anything that does not check out. Either path returns the same
    `ChecklistTemplate` shape, so nothing downstream needs to know which ran.
    """
    selected = select_checklist_items(profil)
    if selected is not None:
        return selected
    return generate_personalized_checklist(profil)
