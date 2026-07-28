"""Security primitives.

Holds one real rule today — NIR masking — and marks where authentication will
attach. Authentication itself is not stubbed with a fake user: a placeholder
that returns a logged-in agent is worse than nothing, because every endpoint
written against it looks protected while being open.
"""

from __future__ import annotations

MASKED_PLACEHOLDER = "• •• •• •• ••• ••• ••"


def mask_social_security_number(nir: str | None) -> str:
    """Mask a NIR to ``S YY MM •• ••• ••• ••``.

    Keeps the first three groups — sex, birth year, birth month — which an
    agent uses to confirm they have the right person, and drops the rest, which
    identifies them.

    An unparseable value is masked *entirely* rather than passed through. An
    unrecognised format is precisely when you do not want a fallback that leaks
    the raw value. ``None`` — ``Citizen.social_security_number`` is nullable,
    unknown until the citizen declares it — is unparseable in exactly the same
    sense and takes the same path, rather than raising on a legitimate value.

    This is the only place a NIR is transformed for display. The full number is
    stored in PostgreSQL and must never appear in a response body; enforcing
    that in one function means a new endpoint cannot forget the rule, provided
    it maps through the schemas.
    """
    digits = "".join(char for char in nir if char.isdigit()) if nir else ""

    if len(digits) < 5:
        return MASKED_PLACEHOLDER

    return f"{digits[0]} {digits[1:3]} {digits[3:5]} •• ••• ••• ••"


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
