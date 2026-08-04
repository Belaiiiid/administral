"""Fill the demo citizen's APL profile so the gated interfaces open.

Non-destructive counterpart to ``scripts.load_test_data``: it deletes nothing.
Where that loader wipes every case, application, citizen and contestation
before rebuilding fixtures, this one only writes the profile of the account
created by ``scripts.seed_users`` and lets the real service build the rest.

Why this exists: ``RequireApplProfile`` (frontend) gates ``/mon-dossier`` and
``/mon-dossier/suivi`` on ``profileComplete``, which
``citizen.dossier._is_profile_complete`` derives from two fields —
``situation_logement`` and ``statut_professionnel``. A freshly seeded account
has an empty ``profile_data``, so both routes bounce to the profiling
assistant and the citizen sees nothing else.

The profile is written through ``ProfilPartiel`` rather than as a raw dict, so
an invalid enum or a negative amount fails here instead of surfacing later as
a 500 from ``GET /api/citizen/dossier`` (the schema is ``extra="forbid"``).
The checklist is then produced by ``dossier.sync_for_citizen`` — the same call
the route makes — so what lands in the database is what the running app
produces, not a hand-inserted approximation.

⚠️ SYNTHETIC DATA — NOT A REAL ALLOCATAIRE.

Idempotent: re-running overwrites the same profile and re-syncs the checklist.

Run:

    .venv/Scripts/python -m scripts.seed_citizen_profile
"""

from __future__ import annotations

from datetime import UTC, datetime

import app.database.models  # noqa: F401 — registers every table for the FKs
from app.database.session import SessionLocal
from app.modules.agent.models import Citizen
from app.modules.auth import repository as auth_repository
from app.modules.citizen import dossier as dossier_service
from app.modules.profiling.schemas.profil import (
    ProfilPartiel,
    StatutLogement,
    StatutMarital,
    StatutProfessionnel,
    TypeLocation,
)

CITIZEN_EMAIL = "citoyen@monparcours.fr"

# A coherent "locataire salarié" dossier: the two fields the completeness check
# reads are set, and the branch fields each one opens are filled too, so the
# generated checklist is a realistic one rather than the universal core alone.
PROFILE = ProfilPartiel(
    prenom="Camille",
    nom="Citoyen",
    # --- Logement ---
    situation_logement=StatutLogement.locataire,
    type_location=TypeLocation.vide,
    loyer_mensuel=720.0,
    surface_m2=38.0,
    code_postal="75013",
    adresse="12 rue des Peupliers",
    ville="Paris",
    # Both are eligibility conditions for APL on the "locataire" branch.
    logement_appartient_a_un_proche=False,
    logement_conventionne=True,
    # --- Composition familiale ---
    statut_marital=StatutMarital.celibataire,
    a_des_enfants_a_charge=False,
    nombre_enfants_a_charge=0,
    nombre_adultes_rattaches=0,
    # --- Statut socio-professionnel ---
    statut_professionnel=StatutProfessionnel.salarie,
    type_contrat="CDI",
    revenus_nets_mensuels=1850.0,
    revenu_fiscal_reference=21600.0,
)


def main() -> None:
    db = SessionLocal()
    try:
        user = auth_repository.get_by_email(db, CITIZEN_EMAIL)
        if user is None:
            raise SystemExit(
                f"Compte {CITIZEN_EMAIL} introuvable. "
                "Lancer d'abord : .venv/Scripts/python -m scripts.seed_users"
            )

        citizen = db.query(Citizen).filter_by(user_id=user.id).one_or_none()
        if citizen is None:
            # Linked by e-mail as a fallback: a Citizen row may pre-exist from an
            # earlier flow without ever having been attached to the login.
            citizen = db.query(Citizen).filter_by(email=CITIZEN_EMAIL).one_or_none()
            if citizen is None:
                raise SystemExit(
                    f"Aucune fiche citoyen pour {CITIZEN_EMAIL}. "
                    "Se connecter une fois dans l'application pour la créer."
                )
            citizen.user_id = user.id

        profile = PROFILE.model_copy(update={"derniere_maj": datetime.now(UTC)})
        citizen.profile_data = profile.model_dump(mode="json")
        db.commit()

        # Same entry point as `GET /api/citizen/dossier`: creates the
        # application if needed and reconciles the checklist with the profile.
        application = dossier_service.sync_for_citizen(db, citizen, actor=user)
        db.commit()

        dossier = dossier_service.get_dossier(db, citizen, actor=user)

        print(f"Profil enregistré pour {CITIZEN_EMAIL} (citizen {citizen.id})")
        print(f"  logement           : {profile.situation_logement.value} / "
              f"{profile.type_location.value}, {profile.loyer_mensuel:.0f} €/mois")
        print(f"  statut             : {profile.statut_professionnel.value} "
              f"({profile.type_contrat}), {profile.revenus_nets_mensuels:.0f} €/mois net")
        print(f"  profil complet     : {dossier.profile_complete}")
        print(f"  application        : {application.id}")
        print(f"  checklist          : {dossier.required_received_count}"
              f"/{dossier.required_document_count} pièces obligatoires fournies")
        print()
        print("Interfaces désormais accessibles :")
        print("  /mon-dossier        (dépôt de pièces, estimation)")
        print("  /mon-dossier/suivi  (suivi du dossier)")
        print("  /profile            (profil pré-rempli)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
