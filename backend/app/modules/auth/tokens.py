"""Minting and redeeming the single-use tokens sent by email.

Kept apart from `service.py` so the security rules — how a token is generated,
how it is stored, what makes it invalid — sit in one readable place rather than
interleaved with the registration and login flows that happen to use them.

The rules, in one list:

1. The secret is `secrets.token_urlsafe(32)` — 256 bits from the OS CSPRNG.
   Never `random`, never anything derived from the user id or the clock.
2. Only its SHA-256 digest reaches the database (see `AuthToken`). Plain
   SHA-256 rather than bcrypt is correct *here* and only here: the input is
   already high-entropy, so there is nothing for an attacker to brute-force,
   and lookup has to be an indexed equality match.
3. Redemption is atomic and single-use: a token is validated and burned in the
   same transaction, so a link clicked twice works exactly once.
4. Minting a new token of a purpose invalidates that user's outstanding ones of
   the same purpose. Requesting a fresh reset link must not leave the previous
   one live.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.modules.auth.models import AuthToken, TokenPurpose, User

#: 32 bytes of entropy → a 43-character URL-safe string.
_TOKEN_BYTES = 32


def hash_token(raw: str) -> str:
    """SHA-256 hex digest — what the database stores, never the token itself."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue(db: Session, user: User, purpose: TokenPurpose, ttl: timedelta) -> str:
    """Mint a token for ``user`` and return the **raw** value.

    The raw value is returned once, to be emailed, and never obtainable again —
    the row holds only its digest. Any outstanding token of the same purpose is
    marked spent first, so the newest link is the only working one.
    """
    now = datetime.now(UTC)

    db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=now)
    )

    raw = secrets.token_urlsafe(_TOKEN_BYTES)
    db.add(
        AuthToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(raw),
            expires_at=now + ttl,
        )
    )
    db.commit()
    return raw


def redeem(db: Session, raw: str, purpose: TokenPurpose) -> User | None:
    """Validate and burn a token, returning its owner.

    ``None`` for every failure mode — unknown, wrong purpose, already used,
    expired. The caller cannot tell them apart, and neither can an attacker
    probing the endpoint.

    The row is marked used but **not** committed: the caller commits, in the
    same transaction as whatever the token authorised (verifying the address,
    setting the new password). A crash between the two therefore cannot burn a
    token without applying its effect.
    """
    token = db.execute(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw),
            AuthToken.purpose == purpose,
        )
    ).scalar_one_or_none()

    if token is None or token.used_at is not None:
        return None

    now = datetime.now(UTC)
    if token.expires_at <= now:
        return None

    token.used_at = now
    return token.user
