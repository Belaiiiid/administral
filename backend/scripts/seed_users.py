"""Development accounts — one per role, so both journeys can log in.

⚠️ SYNTHETIC. Passwords are well-known and for local development only. Never run
this against an environment holding real accounts.

Run:  .venv/Scripts/python -m scripts.seed_users
"""

from __future__ import annotations

import app.database.models  # noqa: F401 — registers every table for the FKs
from app.database.session import SessionLocal
from app.modules.auth import repository
from app.modules.auth.models import Role, User
from app.modules.auth.security import hash_password

# A real TLD on purpose: EmailStr rejects reserved names like `.test`, which is
# correct for production and means demo accounts need a valid domain too.
_DEMO_ACCOUNTS = [
    ("citoyen@monparcours.fr", "Citoyen1234", "Camille", "Citoyen", Role.CITIZEN),
    ("agent@monparcours.fr", "Agent1234", "Awa", "Agent", Role.AGENT),
    ("admin@monparcours.fr", "Admin1234", "Sacha", "Admin", Role.ADMIN),
]


def main() -> None:
    db = SessionLocal()
    try:
        for email, password, first, last, role in _DEMO_ACCOUNTS:
            if repository.get_by_email(db, email) is not None:
                print(f"  déjà présent : {email}")
                continue
            repository.create(
                db,
                User(
                    first_name=first,
                    last_name=last,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                ),
            )
            print(f"  créé : {email}  (rôle {role.value}, mot de passe « {password} »)")
    finally:
        db.close()

    print("Comptes de démonstration prêts.")


if __name__ == "__main__":
    main()
