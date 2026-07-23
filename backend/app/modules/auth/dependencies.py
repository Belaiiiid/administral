"""FastAPI auth dependencies — the access-control gate.

`get_current_user` resolves and validates the bearer token; `require_role`
builds a guard that additionally checks the caller's role. These are what a
router attaches to refuse the wrong role on a protected route.

Adapted from the contribution's `dependencies/auth.py`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth import repository
from app.modules.auth.models import Role, User
from app.modules.auth.security import InvalidTokenError, decode_access_token

_bearer = HTTPBearer(
    bearerFormat="JWT",
    description="Token JWT obtenu via /api/auth/login ou /api/auth/register.",
    auto_error=True,
)

_UNAUTHORISED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token d'authentification invalide ou expiré.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError, TypeError):
        raise _UNAUTHORISED

    user = repository.get_by_id(db, user_id)
    if user is None:
        # The token is well-formed but the account is gone (deleted). Same 401.
        raise _UNAUTHORISED
    return user


def require_role(*allowed: Role):
    """Build a dependency that admits only the given roles.

    ADMIN is admitted everywhere an AGENT is — an admin is a superset — so
    guards list the minimum role and rely on this widening.
    """
    allowed_set = set(allowed)

    def guard(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Accès refusé : rôle insuffisant pour cette ressource "
                    f"(rôles autorisés : {', '.join(r.value for r in allowed)})."
                ),
            )
        return current_user

    return guard


#: Any authenticated citizen (or agent/admin, who are also citizens of the app).
require_citizen = require_role(Role.CITIZEN, Role.AGENT, Role.ADMIN)
#: Agent-only surfaces — the dossiers. ADMIN is admitted too.
require_agent = require_role(Role.AGENT, Role.ADMIN)
require_admin = require_role(Role.ADMIN)
