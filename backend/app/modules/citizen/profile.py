"""The citizen's living profile — read, edit, and persist.

This is the write path the profiling assistant never had. Until now the
assistant's answers lived only in an in-memory session (30-minute TTL) and
reached PostgreSQL exactly once, copied into a `Case` snapshot at submission.
Nothing the citizen told the assistant survived a restart, and the profile page
had nothing to save. Here the answers land on the `citizens` row that belongs to
the authenticated account.

Two rules shape everything below.

**Identity comes from the token, never from the body.** Every function takes the
`User` resolved from the JWT and finds their applicant row by `user_id`. A
request cannot name whose profile it is editing, so one citizen cannot write
another's — which the previous e-mail match could not guarantee, since e-mail
was both the join key and a user-editable field.

**A partial update never erases.** `PATCH` applies only the keys actually sent.
Pydantic cannot distinguish "field omitted" from "field set to null" without
`exclude_unset`, and that distinction is the whole difference between "I did not
answer that question" and "erase my rent".
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import mask_social_security_number, social_security_number_error
from app.modules.profiling.schemas.profil import ProfilPartiel, ProfilPatch
from app.modules.agent.models import Citizen
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.auth.models import User

logger = logging.getLogger(__name__)


def _resync_dossier(db: Session, citizen: Citizen, user: User) -> None:
    """Regenerate the personalised checklist after a profile change.

    Best-effort: the profile edit has already committed, and the checklist is
    derived state that ``GET /citizen/dossier`` regenerates idempotently on the
    next read. A failure here must therefore never fail — or roll back — the
    profile write the citizen actually asked for. Imported lazily to keep the
    profile module free of a hard dependency on the dossier service.
    """
    try:
        from app.modules.citizen import dossier

        dossier.sync_for_citizen(db, citizen, actor=user)
    except Exception:  # noqa: BLE001 — checklist sync must never break a profile save
        logger.exception("Checklist resync failed for citizen %s", citizen.id)
        db.rollback()


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class CitizenProfileResponse(_Base):
    """What the profile page renders.

    The NIR is masked here and nowhere else on this path — the raw value stays
    in PostgreSQL (see `core.security.mask_social_security_number`).
    """

    first_name: str
    last_name: str
    email: EmailStr
    birth_date: date | None = None
    #: Masked for display, e.g. ``2 91 04 •• ••• ••• ••``. ``None`` when unset —
    #: an absent NIR must not render as a masked one.
    social_security_number_masked: str | None = None
    #: True when a NIR is on file, so the UI can say "renseigné" without it.
    has_social_security_number: bool = False
    #: The profiling answers, shaped by `ProfilPartiel`.
    profile: ProfilPartiel
    profile_updated_at: datetime | None = None


class CitizenProfileUpdate(_Base):
    """A partial edit of the profile.

    Civil-status fields sit alongside `profile`, the profiling answers, because
    the page edits them as one form. Everything is optional: this is a PATCH.
    """

    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    birth_date: date | None = None
    #: Digits only, 13 or 15 (NIR with or without its two check digits).
    social_security_number: str | None = Field(default=None, max_length=32)
    #: Profiling answers to merge. Omitted keys are left untouched.
    profile: ProfilPatch | None = None

    @field_validator("birth_date")
    @classmethod
    def _valider_date_naissance(cls, v: date | None) -> date | None:
        if v is None:
            return v
        if v > date.today():
            raise ValueError("La date de naissance ne peut pas être dans le futur.")
        if v.year < 1900:
            raise ValueError("La date de naissance n’est pas plausible.")
        return v

    @field_validator("social_security_number")
    @classmethod
    def _valider_nir(cls, v: str | None) -> str | None:
        if not v:
            return v
        error = social_security_number_error(v)
        if error:
            raise ValueError(error)
        return v


def resolve_citizen(db: Session, user: User) -> Citizen:
    """The applicant row for this account, created on first need.

    Looks up by `user_id` — the foreign key — rather than by e-mail. A row is
    created here rather than at registration so an account that never starts a
    profile leaves no empty applicant record behind.

    One migration-era case is handled: a row that predates the foreign key and
    still matches only by e-mail is adopted (its `user_id` filled in) instead of
    being shadowed by a second, empty row for the same person.
    """
    citizen = db.execute(
        select(Citizen).where(Citizen.user_id == user.id)
    ).scalar_one_or_none()
    if citizen is not None:
        return citizen

    orphan = db.execute(
        select(Citizen).where(Citizen.user_id.is_(None), Citizen.email == user.email)
    ).scalar_one_or_none()
    if orphan is not None:
        orphan.user_id = user.id
        db.flush()
        return orphan

    citizen = Citizen(
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        # birth_date and social_security_number stay NULL until declared. No
        # placeholder — an agent must be able to see that they are missing.
    )
    db.add(citizen)
    db.flush()
    return citizen


def _as_response(citizen: Citizen) -> CitizenProfileResponse:
    nir = citizen.social_security_number
    return CitizenProfileResponse(
        first_name=citizen.first_name,
        last_name=citizen.last_name,
        email=citizen.email,
        birth_date=citizen.birth_date,
        social_security_number_masked=mask_social_security_number(nir) if nir else None,
        has_social_security_number=nir is not None,
        profile=ProfilPartiel.model_validate(citizen.profile_data or {}),
        profile_updated_at=citizen.profile_updated_at,
    )


def get_profile(db: Session, user: User) -> CitizenProfileResponse:
    citizen = resolve_citizen(db, user)
    db.commit()  # persists the row if `resolve_citizen` just created or adopted it
    return _as_response(citizen)


def _merge_profile_data(citizen: Citizen, patch: dict) -> None:
    """Apply ``patch`` over the stored answers, keeping the rest.

    Re-validated through `ProfilPartiel` so a value that the profiling schema
    would reject (a five-digit postcode rule, a negative rent) cannot enter the
    database through this endpoint just because it arrived as JSON.
    """
    merged = {**(citizen.profile_data or {}), **patch}
    validated = ProfilPartiel.model_validate(merged)
    citizen.profile_data = validated.model_dump(mode="json", exclude_none=True)
    citizen.profile_updated_at = datetime.now(UTC)


def update_profile(
    db: Session, user: User, data: CitizenProfileUpdate
) -> CitizenProfileResponse:
    """Apply a partial edit and persist it."""
    citizen = resolve_citizen(db, user)

    # `exclude_unset` is what makes this a PATCH: only keys the client actually
    # sent are considered, so an omitted field is left alone rather than nulled.
    sent = data.model_dump(exclude_unset=True)

    # Track *which* fields the edit touched, for the audit trail — never their
    # values. The NIR and birth date are exactly the data the audit log must not
    # duplicate, so the trace records that they changed, not what to.
    changed: list[str] = []

    if "first_name" in sent and sent["first_name"]:
        citizen.first_name = sent["first_name"]
        changed.append("first_name")
    if "last_name" in sent and sent["last_name"]:
        citizen.last_name = sent["last_name"]
        changed.append("last_name")
    if "birth_date" in sent:
        citizen.birth_date = sent["birth_date"]
        changed.append("birth_date")
    if "social_security_number" in sent:
        raw = sent["social_security_number"]
        digits = "".join(c for c in raw if c.isdigit()) if raw else ""
        # Store digits only, so the masking rule and any later validation see a
        # canonical value regardless of how the citizen spaced it.
        citizen.social_security_number = digits or None
        changed.append("social_security_number")

    if data.profile is not None:
        profile_patch = data.profile.model_dump(exclude_unset=True)
        _merge_profile_data(citizen, profile_patch)
        changed.extend(f"profile.{key}" for key in profile_patch)

    # Trace the edit into the same transaction as the write, but only when it
    # actually changed something (a no-op PATCH leaves no trail entry).
    if changed:
        audit_service.record(
            db,
            action=AuditAction.profile_updated,
            entity_type="citizen",
            entity_id=str(citizen.id),
            actor=user,
            summary=f"Profil mis à jour ({len(changed)} champ(s) modifié(s)).",
            payload={"fields_changed": changed},
        )

    db.commit()
    db.refresh(citizen)

    # A profile edit can change which documents are required — regenerate the
    # personalised checklist from the new profile (best-effort, self-healing).
    if changed:
        _resync_dossier(db, citizen, user)

    return _as_response(citizen)


def save_profiling_answers(db: Session, user: User, profil: ProfilPartiel) -> Citizen:
    """Persist the profiling assistant's answers for this account.

    Called when a profiling turn produces new field values, so the conversation
    survives the session store's 30-minute TTL and a server restart. `nom` and
    `prenom` are lifted onto the civil-status columns because the assistant
    collects them as ordinary profile fields, but they are identity everywhere
    else in the application.
    """
    citizen = resolve_citizen(db, user)

    answers = profil.model_dump(mode="json", exclude_none=True)
    answers.pop("derniere_maj", None)  # a session artefact, not a declared answer

    if answers.get("nom"):
        citizen.last_name = answers["nom"]
    if answers.get("prenom"):
        citizen.first_name = answers["prenom"]

    _merge_profile_data(citizen, answers)
    db.commit()
    db.refresh(citizen)

    # The profiling assistant just changed the profile — keep the personalised
    # checklist in step with it (best-effort, self-healing on the next read).
    _resync_dossier(db, citizen, user)

    return citizen
