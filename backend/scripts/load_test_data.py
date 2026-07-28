"""Comprehensive test data loader — one command, a platform you can click through.

Combines what the existing scripts do separately:

- the three fixture dossiers from ``scripts.seed`` (reused, not duplicated —
  imported from there so the two never drift apart),
- the three demo accounts from ``scripts.seed_users``,

and adds the one thing neither provides: a *live* business event. One fixture
citizen is linked to the citizen demo account, her complete dossier is decided
and then contested — both through the real service functions
(``agent.service.decide_case``, ``contestation.service.create_contestation``),
not hand-inserted rows. That matters because those functions also write the
audit hash chain and the notification fan-out; a raw INSERT would leave both
inconsistent with what the running app actually produces.

⚠️ SYNTHETIC DATA — NOT REAL ALLOCATAIRES. Same rule as ``scripts/seed.py``.

Idempotent: safe to re-run. Existing cases, applications, citizens and
contestations are wiped first; the three demo accounts are upserted (kept, not
recreated) so their id never shifts between runs.

Run:

    .venv/Scripts/python -m scripts.load_test_data
"""

from __future__ import annotations

from datetime import UTC, datetime

import app.database.models  # noqa: F401 — registers every table for the FKs
from app.database.session import SessionLocal
from app.modules.agent import service as agent_service
from app.modules.agent.models import Case, Citizen, DecisionOutcome
from app.modules.auth import repository as auth_repository
from app.modules.auth.models import Role, User
from app.modules.auth.security import hash_password
from app.modules.citizen.models import Application
from app.modules.contestation import service as contestation_service
from app.modules.contestation.models import Contestation, ContestationReason
from scripts.seed import build_cases

# Same accounts as `scripts.seed_users`, so the two loaders never disagree on
# what "the citizen account" or "the agent account" means in this project.
_DEMO_ACCOUNTS = [
    ("citoyen@monparcours.fr", "Citoyen1234", "Camille", "Citoyen", Role.CITIZEN),
    ("agent@monparcours.fr", "Agent1234", "Awa", "Agent", Role.AGENT),
    ("admin@monparcours.fr", "Admin1234", "Sacha", "Admin", Role.ADMIN),
]

# The most complete fixture dossier (case-2026-0417, Camille Dupont-Test) is
# the one we link, decide and contest — it already has clean documents and a
# passed completeness/coherence report, so a decision needs no extra setup.
DECIDED_CITIZEN_ID = "citizen-fixture-1"
DECIDED_CASE_ID = "case-2026-0417"
DECIDED_APPLICATION_NUMBER = "2026-APL-0417"


def _reset(db) -> None:
    """Wipe every row this loader owns, in FK-safe order.

    Cases first: deleting one cascades to its documents, reports, decision and
    any contestation on it. Applications and citizens have no such cascade
    (SET NULL / RESTRICT respectively), so they are cleared explicitly.
    """
    for contestation in db.query(Contestation).all():
        db.delete(contestation)
    db.commit()

    for case in db.query(Case).all():
        db.delete(case)
    db.commit()

    for application in db.query(Application).all():
        db.delete(application)
    db.commit()

    for citizen in db.query(Citizen).all():
        db.delete(citizen)
    db.commit()


def _ensure_accounts(db) -> dict[str, User]:
    accounts: dict[str, User] = {}
    for email, password, first, last, role in _DEMO_ACCOUNTS:
        user = auth_repository.get_by_email(db, email)
        if user is None:
            user = auth_repository.create(
                db,
                User(
                    first_name=first,
                    last_name=last,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                    # Pre-verified: nothing can deliver a real confirmation
                    # link to `monparcours.fr`, so leaving these unverified
                    # would put a permanent banner on every demo login.
                    is_verified=True,
                    verified_at=datetime.now(UTC),
                ),
            )
        accounts[role.value] = user
    return accounts


def main() -> None:
    db = SessionLocal()
    try:
        _reset(db)
        accounts = _ensure_accounts(db)

        db.add_all(build_cases())
        db.commit()

        # Link the citizen demo account to a real, owned dossier — otherwise
        # `citoyen@monparcours.fr` sees only empty states, since none of the
        # fixture citizens carry a `user_id` on their own. The email is
        # overwritten too: the fixture's `camille.dupont@example.test` is a
        # deliberately fake RFC 6761 address (see `scripts/seed.py`), which
        # `GET /citizen/profile` rejects with a 500 — its response model
        # validates `email` with Pydantic's `EmailStr`, which refuses reserved
        # TLDs. A citizen linked to a real login must carry a real-looking one.
        camille = db.query(Citizen).filter_by(id=DECIDED_CITIZEN_ID).one()
        camille.user_id = accounts["CITIZEN"].id
        camille.email = accounts["CITIZEN"].email
        db.commit()

        # A recorded decision, through the real service — the same evidence
        # extraction and explanation generation the agent portal triggers,
        # so the citizen's dossier review page has a real verdict to show.
        agent_service.decide_case(
            db,
            DECIDED_CASE_ID,
            DecisionOutcome.validated,
            agent=accounts["AGENT"],
        )

        # An open contestation on that decision, through the real service —
        # writes its own audit event and notifies the agent queue, so both
        # portals have a contestation to review from the first login.
        contestation_service.create_contestation(
            db,
            user=accounts["CITIZEN"],
            application_number=DECIDED_APPLICATION_NUMBER,
            reason=ContestationReason.erreur_calcul,
            description=(
                "Le montant retenu pour mon loyer ne correspond pas à mon bail "
                "actuel, je pense qu'il y a une erreur dans le calcul de mes droits."
            ),
        )

        print("Comptes de démonstration :")
        for email, password, _first, _last, role in _DEMO_ACCOUNTS:
            print(f"  {email}  /  {password}   ({role.value})")
        print()
        print("Dossiers agent (file d'instruction) :")
        print(f"  {DECIDED_APPLICATION_NUMBER}  validé, contesté par le citoyen")
        print("  2026-APL-0392  en cours d'instruction (1 pièce manquante, 1 alerte)")
        print("  2026-APL-0355  en attente de pièces (pièce d'identité suspecte)")
        print()
        print(
            "Le compte citoyen a aussi un dossier personnalisé vierge, généré "
            "automatiquement à la première visite de /citizen/dossier — de quoi "
            "tester l'upload et la soumission en plus du dossier déjà décidé."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
