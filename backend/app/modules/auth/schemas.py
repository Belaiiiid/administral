"""Auth wire schemas.

camelCase on the wire, to match the rest of this API and the frontend that
consumes the login response. The password only ever travels *in*; no schema
carries it or the hash back out.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

from app.modules.auth.models import Role


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class RegisterRequest(CamelModel):
    """Public registration — CITIZEN only (enforced in the service)."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class ProvisionStaffRequest(CamelModel):
    """Admin-only account creation.

    Deliberately a *separate* schema from ``RegisterRequest`` rather than the
    same one with an optional ``role``. If public registration and staff
    provisioning shared a body, a forgotten guard on the public route would be
    enough to mint an AGENT — the two operations are kept structurally
    incapable of being confused.

    ``role`` is typed to the two staff roles only: CITIZEN is what public
    registration exists for, so an admin creating one here would be a mistake.
    """

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal[Role.AGENT, Role.ADMIN] = Role.AGENT


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(CamelModel):
    """Carries the token from the emailed link back to the API."""

    token: str = Field(min_length=1, max_length=512)


class RequestPasswordResetRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    token: str = Field(min_length=1, max_length=512)
    #: Same floor as registration — a reset must not be a way to set a weaker
    #: password than signup would have accepted.
    password: str = Field(min_length=8, max_length=128)


class MessageResponse(CamelModel):
    """A plain acknowledgement, for endpoints that deliberately reveal nothing."""

    message: str


class UserResponse(CamelModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    role: Role
    is_verified: bool
    created_at: datetime


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    #: The short lifetime, in seconds — the client can pre-empt expiry.
    expires_in: int
    user: UserResponse
