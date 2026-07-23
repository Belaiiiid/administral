"""Turns decision evidence into a citizen-facing message.

## The seam a language model occupies

This module is where Mistral goes. Today it composes with deterministic
templates; when a model replaces ``_compose``, nothing else in the codebase
changes — not the decision service, not the router, and certainly not the
frontend, which has no way of knowing this step exists.

## The invariant

    every claim in `message` comes from an item in `evidence_used`

Here that holds *structurally*: the message is fixed template text with evidence
values concatenated verbatim, so there is no path by which an unsupported
sentence could appear.

When a model replaces the templates the invariant stops being structural and
becomes a prompt constraint that has to be tested. The protection that survives
either way is the signature: ``generate_explanation`` receives ``evidence``, not
a ``Case``. A model cannot cite a fact it was never given, so the narrow input
is the safety mechanism — not the prompt.

Mistral must never: choose the outcome, calculate eligibility, infer CAF rules,
or introduce information absent from the evidence list. It rephrases a closed
set of facts and nothing else.
"""

from __future__ import annotations

from app.core.exceptions import ValidationError
from app.modules.agent.models import DecisionOutcome
from app.modules.agent.schemas import DecisionEvidenceSchema


def _join_french(parts: list[str]) -> str:
    """« a », « a et b », « a, b et c »."""
    if len(parts) <= 1:
        return parts[0] if parts else ""
    return f"{', '.join(parts[:-1])} et {parts[-1]}"


def generate_explanation(
    outcome: DecisionOutcome,
    evidence: list[DecisionEvidenceSchema],
) -> str:
    """Compose the message shown to the citizen.

    Takes ``evidence`` rather than the case on purpose — see module docstring.
    """
    # Defence in depth. The decision service already refuses an unsupported
    # rejection; the rule is restated at the point of composition so no future
    # caller can route around it and obtain a rejection message with nothing
    # behind it.
    if outcome == DecisionOutcome.rejected and not evidence:
        raise ValidationError(
            "Un rejet ne peut pas être expliqué sans élément justificatif issu du dossier."
        )

    facts = [item.value for item in evidence]

    if outcome == DecisionOutcome.rejected:
        message = f"Votre demande n’a pas pu être acceptée car {_join_french(facts)}."

        if any(item.field == "documents" for item in evidence):
            message += (
                " Vous pouvez transmettre les pièces concernées depuis votre espace personnel."
            )

        return message

    message = "Votre demande a été acceptée."
    if facts:
        message += f" Cette décision s’appuie sur les éléments suivants : {_join_french(facts)}."

    return message
