"""HTTP layer for notifications — one set of endpoints, both portals.

`get_current_user`, not a role guard: a notification belongs to a user, not to a
role. A citizen and an agent call the very same routes and each see only their
own rows (the service filters on `user_id`), so there is nothing role-specific
to gate here — and nothing that would let one role read another's messages.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse, summary="Mes notifications")
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    items = service.list_for_user(db, current_user)
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        unread_count=sum(1 for n in items if not n.read),
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Nombre de notifications non lues",
    description="Sert la pastille de l'en-tête sans rapatrier toute la liste.",
)
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnreadCountResponse:
    return UnreadCountResponse(unread_count=service.unread_count(db, current_user))


@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Marquer une notification comme lue",
)
def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationResponse:
    try:
        notification = service.mark_read(db, current_user, notification_id)
    except service.NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return NotificationResponse.model_validate(notification)


@router.post(
    "/read-all",
    response_model=UnreadCountResponse,
    summary="Tout marquer comme lu",
    description="Renvoie le nouveau compteur (toujours 0) pour un rafraîchissement immédiat.",
)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnreadCountResponse:
    service.mark_all_read(db, current_user)
    return UnreadCountResponse(unread_count=0)
