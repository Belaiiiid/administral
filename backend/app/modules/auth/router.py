"""HTTP layer for authentication."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth import service
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    LoginRequest,
    MessageResponse,
    ProvisionStaffRequest,
    RegisterRequest,
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Créer un compte citoyen et se connecter",
)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    return service.register_citizen(db, body)


@router.post("/login", response_model=TokenResponse, summary="Se connecter (citoyen ou agent)")
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    return service.login(db, body)


@router.get("/me", response_model=UserResponse, summary="Profil de l'utilisateur connecté")
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse.model_validate(current_user)


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------


@router.post(
    "/verify-email",
    response_model=UserResponse,
    summary="Confirmer une adresse e-mail avec le jeton reçu par courriel",
)
def verify_email(body: VerifyEmailRequest, db: Annotated[Session, Depends(get_db)]) -> UserResponse:
    """Unauthenticated on purpose: the token *is* the proof.

    Requiring a session would break the ordinary case of opening the link in a
    browser where the citizen is not signed in.
    """
    return UserResponse.model_validate(service.verify_email(db, body.token))


@router.post(
    "/verify-email/resend",
    response_model=MessageResponse,
    summary="Renvoyer le courriel de confirmation (authentifié)",
)
def resend_verification(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    service.resend_verification_email(db, current_user)
    return MessageResponse(
        message="Un nouveau courriel de confirmation vient de vous être envoyé."
    )


@router.post(
    "/verify-email/resend-public",
    response_model=MessageResponse,
    summary="Renvoyer le courriel de confirmation sans authentification",
)
def resend_verification_public(
    body: RequestPasswordResetRequest, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    """Always 200, same as password-reset request.

    Whether the address exists or is already verified is information this
    endpoint must not reveal, so the same uniform response is returned for
    every call.
    """
    service.resend_verification_public(db, body.email)
    return MessageResponse(
        message="Si un compte non confirmé est associé à cette adresse, "
        "un nouveau lien de confirmation vient de lui être envoyé."
    )


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

#: The single answer every reset request gets, registered address or not.
_RESET_REQUESTED = (
    "Si un compte est associé à cette adresse, un lien de réinitialisation vient "
    "de lui être envoyé."
)


@router.post(
    "/password-reset/request",
    response_model=MessageResponse,
    summary="Demander un lien de réinitialisation de mot de passe",
)
def request_password_reset(
    body: RequestPasswordResetRequest, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    """Always 200 with the same body.

    Whether the address has an account is exactly what this endpoint must not
    reveal — see `service.request_password_reset`.
    """
    service.request_password_reset(db, body.email)
    return MessageResponse(message=_RESET_REQUESTED)


@router.post(
    "/password-reset",
    response_model=MessageResponse,
    summary="Définir un nouveau mot de passe avec le jeton reçu par courriel",
)
def reset_password(
    body: ResetPasswordRequest, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    service.reset_password(db, body)
    return MessageResponse(
        message="Votre mot de passe a été mis à jour. Vous pouvez vous connecter."
    )


# ---------------------------------------------------------------------------
# Staff provisioning — ADMIN only
#
# Mounted on a sub-router carrying `require_admin` as a router-level dependency
# rather than repeated per route: a future endpoint added here is guarded by
# construction, instead of relying on whoever adds it to remember the decorator.
# ---------------------------------------------------------------------------

staff_router = APIRouter(
    prefix="/auth/staff",
    tags=["auth"],
    dependencies=[Depends(require_admin)],
)


@staff_router.post(
    "",
    response_model=UserResponse,
    status_code=201,
    summary="Provisionner un compte agent ou admin (réservé aux administrateurs)",
)
def provision_staff(
    body: ProvisionStaffRequest, db: Annotated[Session, Depends(get_db)]
) -> UserResponse:
    """Create an agent/admin account.

    Returns the account, not a token: the admin is not the person being
    provisioned. The new agent signs in via `/auth/login`.
    """
    return UserResponse.model_validate(service.provision_staff_account(db, body))


@staff_router.get(
    "",
    response_model=list[UserResponse],
    summary="Lister les comptes agents et administrateurs",
)
def list_staff(db: Annotated[Session, Depends(get_db)]) -> list[UserResponse]:
    return [UserResponse.model_validate(user) for user in service.list_staff_accounts(db)]
