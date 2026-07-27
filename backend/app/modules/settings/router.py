"""HTTP layer for settings — one endpoint set, both portals, scoped per user.

`get_current_user`, not a role guard: settings belong to a user. Each account
reads and writes only its own row (the service resolves it from the token), so a
citizen and an agent share these routes and cannot touch each other's.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.settings import service
from app.modules.settings.schemas import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=UserSettingsResponse, summary="Mes paramètres")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingsResponse:
    return UserSettingsResponse.model_validate(service.get_or_create(db, current_user))


@router.patch(
    "",
    response_model=UserSettingsResponse,
    summary="Mettre à jour mes paramètres",
    description="Mise à jour partielle : seuls les champs présents sont modifiés.",
)
def update_settings(
    payload: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingsResponse:
    return UserSettingsResponse.model_validate(service.update(db, current_user, payload))
