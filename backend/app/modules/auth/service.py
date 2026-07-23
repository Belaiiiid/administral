"""Authentication business logic.

Owns the rules: public registration is citizens-only, login verifies the hash
and mints a short-lived token. The repository owns SQL; the router owns HTTP.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import DomainError
from app.modules.auth import repository
from app.modules.auth.models import Role, User
from app.modules.auth.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.modules.auth.security import create_access_token, hash_password, verify_password


class EmailAlreadyUsedError(DomainError):
    status_code = 409
    code = "EMAIL_ALREADY_USED"


class InvalidCredentialsError(DomainError):
    status_code = 401
    code = "INVALID_CREDENTIALS"


def _issue(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(subject=user.id, role=user.role.value),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


def register_citizen(db: Session, data: RegisterRequest) -> TokenResponse:
    """Create a citizen account and log them in.

    Only citizens self-register. Agent and admin accounts are provisioned
    elsewhere — a public endpoint that could mint an AGENT would hand anyone
    access to every dossier, which is the exact thing this feature protects.
    """
    if repository.get_by_email(db, data.email) is not None:
        raise EmailAlreadyUsedError("Un compte avec cette adresse e-mail existe déjà.")

    user = repository.create(
        db,
        User(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            password_hash=hash_password(data.password),
            role=Role.CITIZEN,
        ),
    )
    return _issue(user)


def login(db: Session, data: LoginRequest) -> TokenResponse:
    """Verify credentials and issue a token.

    One error for both "no such email" and "wrong password" — distinguishing
    them tells an attacker which emails have accounts.
    """
    user = repository.get_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        raise InvalidCredentialsError("Identifiants incorrects. Veuillez réessayer.")

    return _issue(user)
