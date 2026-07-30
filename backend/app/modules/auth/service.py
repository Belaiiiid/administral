"""Authentication business logic.

Owns the rules: public registration is citizens-only, login verifies the hash
and mints a short-lived token. The repository owns SQL; the router owns HTTP.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.email import send_email
from app.core.exceptions import DomainError
from app.core.logger import logger
from app.modules.auth import notifications, repository, tokens
from app.modules.auth.models import Role, TokenPurpose, User
from app.modules.auth.schemas import (
    LoginRequest,
    ProvisionStaffRequest,
    RegisterRequest,
    ResetPasswordRequest,
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


class EmailNotVerifiedError(DomainError):
    status_code = 403
    code = "EMAIL_NOT_VERIFIED"


class InvalidTokenError(DomainError):
    """A verification or reset link that is unknown, spent or expired.

    One error for all three, matching `tokens.redeem` — telling a caller which
    it was would confirm that a given token once existed.
    """

    status_code = 400
    code = "INVALID_TOKEN"


class AlreadyVerifiedError(DomainError):
    status_code = 409
    code = "ALREADY_VERIFIED"


def _send_verification_email(db: Session, user: User) -> None:
    """Mint a verification token and email it.

    Delivery failure is logged, not raised. Registration has already succeeded
    and committed at this point; failing the request would tell the citizen
    their account was not created when it was, and they would be unable to
    register again with the same address. The account is instead left
    unverified, and `/auth/verify-email/resend` is the recovery path.
    """
    raw = tokens.issue(
        db,
        user,
        TokenPurpose.EMAIL_VERIFICATION,
        timedelta(hours=settings.email_verification_token_ttl_hours),
    )
    try:
        send_email(
            notifications.verification_email(
                to=user.email, first_name=user.first_name, token=raw
            )
        )
    except Exception as exc:  # noqa: BLE001 — see docstring
        logger.error(
            "verification email could not be sent",
            {"user_id": user.id, "error": str(exc)},
        )


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
    _send_verification_email(db, user)
    return _issue(user)


def provision_staff_account(db: Session, data: ProvisionStaffRequest) -> User:
    """Create an AGENT (or ADMIN) account on an admin's behalf.

    The counterpart to `register_citizen`: staff accounts exist, but only an
    existing ADMIN can mint one — the router enforces that with `require_admin`,
    and this function is never reachable from an unauthenticated route.

    The account is created already verified — an admin provisioning a staff
    member is an internal action, not a self-registration. The new agent can
    sign in immediately through `/auth/login`.

    No token is issued. The admin is provisioning *someone else's* account, so
    logging that someone in here would be wrong; the new agent signs in through
    the ordinary `/auth/login` with the password the admin sets.
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
            role=data.role,
            is_verified=True,
            verified_at=datetime.now(UTC),
        ),
    )
    return user


def list_staff_accounts(db: Session) -> list[User]:
    """Every agent and admin account. Admin-only — the router guards it."""
    return repository.list_by_roles(db, (Role.AGENT, Role.ADMIN))


def login(db: Session, data: LoginRequest) -> TokenResponse:
    """Verify credentials and issue a token.

    One error for both "no such email" and "wrong password" — distinguishing
    them tells an attacker which emails have accounts.

    If the email is not yet verified, the login is refused with a specific
    error code so the frontend can show a "verify your email" banner with
    an option to resend the confirmation link. Staff accounts are exempted
    (they are provisioned by an admin who already verified them).
    """
    user = repository.get_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        raise InvalidCredentialsError("Identifiants incorrects. Veuillez réessayer.")

    if not user.is_verified and user.role != Role.ADMIN:
        raise EmailNotVerifiedError(
            "Votre adresse e-mail n'a pas encore été confirmée. "
            "Vérifiez votre messagerie ou demandez un nouveau lien."
        )

    return _issue(user)


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------


def verify_email(db: Session, raw_token: str) -> User:
    """Redeem a verification token and mark the address proven."""
    user = tokens.redeem(db, raw_token, TokenPurpose.EMAIL_VERIFICATION)
    if user is None:
        raise InvalidTokenError(
            "Ce lien de confirmation est invalide ou a expiré. "
            "Demandez-en un nouveau depuis votre espace personnel."
        )

    # Idempotent in effect: a second, distinct valid token for an already
    # verified address simply re-affirms it rather than failing.
    if not user.is_verified:
        user.is_verified = True
        user.verified_at = datetime.now(UTC)

    # One commit for the burned token and the verified flag — see `tokens.redeem`.
    db.commit()
    db.refresh(user)
    return user


def resend_verification_email(db: Session, user: User) -> None:
    """Issue a fresh verification link for the signed-in user.

    Requires authentication, so there is no address enumeration to worry about
    and no reason to hide that the account is already verified.
    """
    if user.is_verified:
        raise AlreadyVerifiedError("Cette adresse e-mail est déjà confirmée.")

    _send_verification_email(db, user)


def resend_verification_public(db: Session, email: str) -> None:
    """Issue a fresh verification link without requiring a session.

    Always returns 200 (same pattern as password-reset request) to avoid
    email enumeration. If the address exists and is not yet verified, a
    new link is sent; otherwise the request is silently ignored.
    """
    user = repository.get_by_email(db, email)
    if user is None or user.is_verified:
        logger.info("verification resend skipped (unknown or already verified)", {"email_known": user is not None})
        return

    _send_verification_email(db, user)


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


def request_password_reset(db: Session, email: str) -> None:
    """Email a reset link — if the address has an account.

    Returns ``None`` either way and never raises for an unknown address. The
    router answers 200 unconditionally: an endpoint that 404s on an unknown
    email is an account-enumeration oracle, which matters most precisely for
    the "forgot password" form, where anyone can submit any address.

    A delivery failure is logged and swallowed for the same reason — a 500 on
    an unregistered address, and 200 on a registered one, leaks exactly what
    the uniform response exists to hide.
    """
    user = repository.get_by_email(db, email)
    if user is None:
        logger.info("password reset requested for unknown address", {"email_known": False})
        return

    raw = tokens.issue(
        db,
        user,
        TokenPurpose.PASSWORD_RESET,
        timedelta(minutes=settings.password_reset_token_ttl_minutes),
    )
    try:
        send_email(
            notifications.password_reset_email(
                to=user.email, first_name=user.first_name, token=raw
            )
        )
    except Exception as exc:  # noqa: BLE001 — see docstring
        logger.error("reset email could not be sent", {"user_id": user.id, "error": str(exc)})


def reset_password(db: Session, data: ResetPasswordRequest) -> None:
    """Redeem a reset token and set the new password.

    No token is issued in return: the user is sent to the login page to sign in
    with the password they just chose. Logging them in straight from an emailed
    link would make possession of that link equivalent to a session.
    """
    user = tokens.redeem(db, data.token, TokenPurpose.PASSWORD_RESET)
    if user is None:
        raise InvalidTokenError(
            "Ce lien de réinitialisation est invalide ou a expiré. "
            "Demandez-en un nouveau depuis la page de connexion."
        )

    user.password_hash = hash_password(data.password)

    # Anyone who proved control of the mailbox has proved the address is theirs.
    # Withholding verification after a successful reset would be arbitrary.
    if not user.is_verified:
        user.is_verified = True
        user.verified_at = datetime.now(UTC)

    db.commit()
    logger.info("password reset completed", {"user_id": user.id})
