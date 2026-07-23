"""Auth wire schemas.

camelCase on the wire, to match the rest of this API and the frontend that
consumes the login response. The password only ever travels *in*; no schema
carries it or the hash back out.
"""

from __future__ import annotations

from datetime import datetime

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


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class UserResponse(CamelModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    role: Role
    created_at: datetime


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    #: The short lifetime, in seconds — the client can pre-empt expiry.
    expires_in: int
    user: UserResponse
