"""Droit de contestation — a citizen's right to challenge a decision.

One of the four cross-cutting guardrails of the functional specification
(*décision humaine, traçabilité totale, droit de contestation, consentement
RGPD*). A citizen who disagrees with an agent's ruling on their dossier may
open a contestation; an agent reviews and resolves it. Every step is written
into the immutable audit trail (`app.modules.audit`), so the challenge and its
outcome are as tamper-evident as the decision it contests.

The AI never resolves a contestation — the agent does. This module records the
challenge and the human's answer to it; it never rules on the merits itself.
"""
