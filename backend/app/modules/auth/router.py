"""HTTP layer for authentication."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth import service
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
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
