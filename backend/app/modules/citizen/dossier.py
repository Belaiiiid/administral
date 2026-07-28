"""The personalised dossier: profile → checklist → upload → completeness.

This is the seam Iteration 3 fills. The pieces already existed — a structured
profile (`citizens.profile_data`), a per-application `ChecklistItem` table, an
upload/classification/completeness flow — but nothing derived the checklist from
the profile. This service does exactly that, and nothing more:

    profile (ProfilPartiel)
        → generate_personalized_checklist  (deterministic rules, no LLM)
        → reconcile onto the application's ChecklistItem rows
        → existing upload + completeness flow (unchanged)

Reconciliation is a diff, not a rebuild: an item that survives a profile change
keeps its ``received`` state, so a citizen who already uploaded their RIB does
not lose it because they later declared a child. Every change is written to the
immutable audit trail (`checklist_generated` first, `checklist_updated` after),
atomically with the change.
"""

from __future__ import annotations

import hashlib
import json

from sqlalchemy.orm import Session

from app.modules.profiling.schemas.profil import ProfilPartiel
from app.modules.agent.models import Citizen
from app.modules.ai.checklist.service import generate_checklist
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditAction
from app.modules.auth.models import User
from app.modules.citizen import repository
from app.modules.citizen.checklist_rules import PERSONALISED_CHECKLIST_VERSION
from app.modules.citizen.models import (
    Application,
    ApplicationDocument,
    ApplicationStatus,
    ChecklistItem,
)
from app.modules.citizen.schemas import (
    DossierChecklistItemSchema,
    PersonalizedDossierSchema,
)


def _profil_from_citizen(citizen: Citizen) -> ProfilPartiel:
    """Reconstruct the structured profile from the stored JSONB, validated."""
    return ProfilPartiel.model_validate(citizen.profile_data or {})


def _is_profile_complete(profil: ProfilPartiel) -> bool:
    """Enough answered to tailor the checklist beyond the universal core.

    Housing and professional status are the two axes that add the most pieces;
    once both are known, the checklist is genuinely personalised. Used only to
    drive the UI nudge — it never gates generation, which always runs.
    """
    return profil.situation_logement is not None and profil.statut_professionnel is not None


def ensure_application_for_citizen(db: Session, citizen: Citizen) -> Application:
    """The citizen's personalised application, created (linked) on first need."""
    application = repository.get_application_by_citizen(db, citizen.id)
    if application is None:
        application = repository.create_application(db, citizen_id=citizen.id)
    return application


def _profile_hash(profil: ProfilPartiel) -> str:
    """Stable fingerprint of the profile's content, order-independent."""
    payload = json.dumps(profil.model_dump(mode="json"), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def sync_checklist(
    db: Session, application: Application, profil: ProfilPartiel, *, actor: User | None
) -> bool:
    """Reconcile the application's checklist with the profile-derived target.

    Returns True when something changed (and an audit event was written). A
    no-op profile leaves the checklist — and the trail — untouched, so this is
    safe to call on every read.

    Generation now calls Mistral (``ai.checklist.service.generate_checklist``),
    which a bare "safe to call on every read" would turn into a model call on
    every dossier page view. The profile hash is what keeps that promise true:
    skip straight past the model when the profile has not changed since the
    checklist currently on file was generated.
    """
    profile_hash = _profile_hash(profil)
    if application.checklist_items and application.checklist_profile_hash == profile_hash:
        return False

    targets = generate_checklist(profil)
    target_by_key = {t.item_key: (position, t) for position, t in enumerate(targets)}
    existing_by_key = {item.item_key: item for item in application.checklist_items}
    had_items = len(existing_by_key) > 0

    added: list[str] = []
    removed: list[str] = []
    updated: list[str] = []

    # Remove items the profile no longer implies. delete-orphan on the
    # relationship turns removal from the collection into a row delete.
    for key, item in list(existing_by_key.items()):
        if key not in target_by_key:
            application.checklist_items.remove(item)
            removed.append(key)

    # Add new items; update descriptive fields of survivors, preserving received.
    for key, (position, template) in target_by_key.items():
        item = existing_by_key.get(key)
        if item is None:
            application.checklist_items.append(
                ChecklistItem(
                    item_key=template.item_key,
                    libelle=template.libelle,
                    categorie=template.categorie,
                    obligatoire=template.obligatoire,
                    justification=template.justification,
                    formats_acceptes=list(template.formats_acceptes),
                    received=False,
                    position=position,
                )
            )
            added.append(key)
        else:
            if (
                item.libelle != template.libelle
                or item.justification != template.justification
                or item.obligatoire != template.obligatoire
                or item.categorie != template.categorie
                or item.position != position
            ):
                item.libelle = template.libelle
                item.justification = template.justification
                item.obligatoire = template.obligatoire
                item.categorie = template.categorie
                item.position = position
                updated.append(key)

    changed = bool(added or removed or updated)
    if not changed:
        # The model (or the deterministic fallback) ran and agreed with what
        # was already on file — still record the hash, so the *next* read
        # skips generation entirely instead of asking again for the same answer.
        application.checklist_profile_hash = profile_hash
        db.commit()
        return False

    application.checklist_profile_hash = profile_hash
    application.checklist_version = PERSONALISED_CHECKLIST_VERSION
    _recompute_status(application)

    action = AuditAction.checklist_generated if not had_items else AuditAction.checklist_updated
    audit_service.record(
        db,
        action=action,
        entity_type="application",
        entity_id=application.id,
        actor=actor,
        summary=(
            f"Checklist personnalisée {'générée' if not had_items else 'mise à jour'} "
            f"({len(target_by_key)} pièce(s))."
        ),
        payload={
            "version": application.checklist_version,
            "total": len(target_by_key),
            "required": sum(1 for _, t in target_by_key.values() if t.obligatoire),
            "added": added,
            "removed": removed,
            "updated": updated,
        },
    )
    db.commit()
    db.refresh(application)
    return changed


def _recompute_status(application: Application) -> None:
    """A dossier is complete when every *required* checklist item is received.

    Mirrors ``service._recompute_status`` but works on the loaded aggregate — the
    checklist has just been mutated in this session, so re-reading it would race
    the flush.
    """
    required = [item for item in application.checklist_items if item.obligatoire]
    complete = bool(required) and all(item.received for item in required)
    application.status = (
        ApplicationStatus.complete if complete else ApplicationStatus.incomplete
    )


def sync_for_citizen(db: Session, citizen: Citizen, *, actor: User | None) -> Application:
    """Ensure the citizen has a personalised application and its checklist is current.

    The single entry point the profile-write paths call after a change, and the
    dossier read path calls before returning — both idempotent.
    """
    application = ensure_application_for_citizen(db, citizen)
    sync_checklist(db, application, _profil_from_citizen(citizen), actor=actor)
    return application


def _item_status(item: ChecklistItem, documents: list[ApplicationDocument]) -> str:
    """missing → uploaded → validated, derived from the citizen's uploads.

    ``received`` is only set when a confident, validated document matched the
    item, so it maps to *validated*. A document that matched the key without
    clearing that bar (low confidence, still analysing) reads as *uploaded* —
    the citizen sent something, an agent/pipeline has not confirmed it counts.
    """
    if item.received:
        return "validated"
    if any(d.matched_checklist_item_id == item.item_key for d in documents):
        return "uploaded"
    return "missing"


def get_dossier(
    db: Session, citizen: Citizen, *, actor: User | None = None
) -> PersonalizedDossierSchema:
    """The citizen's personalised dossier. Backs ``GET /api/citizen/dossier``.

    ``citizen`` is resolved by the caller; this reads their profile, ensures the
    checklist reflects it (self-healing on first access or drift), and shapes the
    result with each item's reason and upload state.
    """
    application = sync_for_citizen(db, citizen, actor=actor)

    documents = list(application.documents)
    required = [item for item in application.checklist_items if item.obligatoire]
    required_received = [item for item in required if item.received]

    return PersonalizedDossierSchema(
        application_id=application.id,
        version_checklist=application.checklist_version,
        profile_complete=_is_profile_complete(_profil_from_citizen(citizen)),
        status=(
            "complete" if application.status == ApplicationStatus.complete else "incomplete"
        ),
        required_received_count=len(required_received),
        required_document_count=len(required),
        items=[
            DossierChecklistItemSchema(
                document_type=item.item_key,
                libelle=item.libelle,
                categorie=item.categorie,
                required=item.obligatoire,
                reason=item.justification,
                status=_item_status(item, documents),
                formats_acceptes=list(item.formats_acceptes),
            )
            for item in application.checklist_items
        ],
    )
