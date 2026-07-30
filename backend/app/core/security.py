"""Security primitives.

Holds one real rule today — NIR masking — and marks where authentication will
attach. Authentication itself is not stubbed with a fake user: a placeholder
that returns a logged-in agent is worse than nothing, because every endpoint
written against it looks protected while being open.
"""

from __future__ import annotations

MASKED_PLACEHOLDER = "• •• •• •• ••• ••• ••"


def mask_social_security_number(nir: str) -> str:
    """Mask a NIR to ``S YY MM •• ••• ••• ••``.

    Keeps the first three groups — sex, birth year, birth month — which an
    agent uses to confirm they have the right person, and drops the rest, which
    identifies them.

    An unparseable value is masked *entirely* rather than passed through. An
    unrecognised format is precisely when you do not want a fallback that leaks
    the raw value.

    This is the only place a NIR is transformed for display. The full number is
    stored in PostgreSQL and must never appear in a response body; enforcing
    that in one function means a new endpoint cannot forget the rule, provided
    it maps through the schemas.
    """
    digits = "".join(char for char in nir if char.isdigit())

    if len(digits) < 5:
        return MASKED_PLACEHOLDER

    return f"{digits[0]} {digits[1:3]} {digits[3:5]} •• ••• ••• ••"


def social_security_number_error(nir: str) -> str | None:
    """Validate a NIR's shape and, when given in full, its official check key.

    Returns a French, user-facing message describing what is wrong, or
    ``None`` when the value is acceptable. Checked, in order:

    - 13 or 15 digits once non-digits are stripped (13 = the identifying
      number alone, 15 = number + its 2-digit "clé de contrôle").
    - Sex digit (1st) is 1 or 2 — the two values used for a citizen's own NIR.
      Rarer administrative codes (7/8, temporary numbers) are deliberately not
      accepted here: a personal NIR typed by a citizen for their own dossier
      is never one of those.
    - Birth month (4th-5th digit) is 01-12. Real NIRs also use a handful of
      special codes (unknown month, born abroad) outside that range, but
      accepting every one of them risks waving through exactly the kind of
      typo (e.g. "65") this check exists to catch — the trade-off favours
      catching mistakes over covering every rare, legitimate edge case.
    - When 15 digits are given, the check key matches ``97 - (numéro mod
      97)`` — the real INSEE algorithm, applied to the 13-digit numéro as-is.
      Corsican NIRs (department "2A"/"2B" in the paper original) are not
      handled specially: this codebase already stores digits only everywhere
      else, so that substitution is a pre-existing gap, not one this check
      introduces.
    """
    digits = "".join(char for char in nir if char.isdigit())

    if len(digits) not in (13, 15):
        return "Le numéro de sécurité sociale doit comporter 13 chiffres (15 avec la clé)."

    if digits[0] not in ("1", "2"):
        return "Le numéro de sécurité sociale doit commencer par 1 (homme) ou 2 (femme)."

    mois = int(digits[3:5])
    if not (1 <= mois <= 12):
        return "Le mois de naissance (5e et 6e chiffres) doit être compris entre 01 et 12."

    if len(digits) == 15:
        numero, cle = digits[:13], digits[13:]
        cle_attendue = 97 - (int(numero) % 97)
        if int(cle) != cle_attendue:
            return "La clé de contrôle (2 derniers chiffres) ne correspond pas au numéro."

    return None


# ---------------------------------------------------------------------------
# Authentication — not implemented
# ---------------------------------------------------------------------------
#
# When the auth module lands, the agent guard belongs here as a FastAPI
# dependency, applied at the router level:
#
#     async def require_agent(token: str = Depends(oauth2_scheme)) -> AgentPrincipal:
#         ...
#
#     router = APIRouter(dependencies=[Depends(require_agent)])
#
# Until it exists, the agent endpoints are unauthenticated. That is acceptable
# for local development against synthetic data and unacceptable anywhere else.
