"""Password hashing and JWT issuing/verifying.

Adapted from the contribution's `core/security.py`. One deliberate change:
password hashing uses the `bcrypt` library directly rather than `passlib`. The
security is identical (bcrypt either way); doing it directly avoids the
well-known passlib/bcrypt version incompatibility that bites on recent Python.

The JWT carries the user id (`sub`) and `role`, plus `iat`/`exp`. The short
expiry is set from config — that short lifetime is the point of this feature.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

# bcrypt hashes at most 72 bytes of input; longer passwords are truncated by the
# algorithm. Encoding here makes that explicit and keeps hashing/verifying symmetric.
_MAX_BCRYPT_BYTES = 72


def _encode(password: str) -> bytes:
    return password.encode("utf-8")[:_MAX_BCRYPT_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_encode(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_encode(plain), hashed.encode("utf-8"))
    except ValueError:
        # A malformed stored hash must fail closed, not raise.
        return False


def create_access_token(subject: str | int, role: str) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


class InvalidTokenError(Exception):
    """Raised when a token is malformed, tampered with, or expired."""


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as err:
        raise InvalidTokenError(str(err)) from err
