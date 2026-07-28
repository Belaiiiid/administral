"""Provision an agent or admin account from the command line.

The out-of-band counterpart to `POST /api/auth/staff`. Two reasons it exists
rather than the HTTP endpoint being the only way in:

1. **Bootstrap.** `POST /api/auth/staff` requires an existing ADMIN. On a fresh
   database there is none, so the first admin has to be created by someone with
   database access. This is that path.
2. **Recovery.** If every admin account is locked out, this is how the operator
   gets back in without hand-writing bcrypt hashes into `psql`.

Unlike `seed_users.py`, nothing here is synthetic: the caller supplies a real
address and a real password, and it is safe to run against a live database.

Run:

    .venv/Scripts/python -m scripts.create_staff --email a@b.fr \
        --first-name Awa --last-name Diop --role AGENT

Omit `--password` to be prompted without echo, which keeps the password out of
the shell history.
"""

from __future__ import annotations

import argparse
import getpass
import sys

import app.database.models  # noqa: F401 — registers every table for the FKs
from app.database.session import SessionLocal
from app.modules.auth import repository
from app.modules.auth.models import Role, User
from app.modules.auth.security import hash_password

MIN_PASSWORD_LENGTH = 8


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.create_staff",
        description="Créer un compte agent ou administrateur.",
    )
    parser.add_argument("--email", required=True, help="Adresse e-mail du compte")
    parser.add_argument("--first-name", required=True, help="Prénom")
    parser.add_argument("--last-name", required=True, help="Nom")
    parser.add_argument(
        "--role",
        choices=[Role.AGENT.value, Role.ADMIN.value],
        default=Role.AGENT.value,
        help="Rôle du compte (défaut : AGENT). CITIZEN est réservé à l'inscription publique.",
    )
    parser.add_argument(
        "--password",
        help="Mot de passe. Omettre pour une saisie masquée (recommandé).",
    )
    return parser.parse_args()


def _resolve_password(supplied: str | None) -> str:
    if supplied is not None:
        password = supplied
    else:
        password = getpass.getpass("Mot de passe : ")
        if password != getpass.getpass("Confirmer : "):
            raise SystemExit("Les mots de passe ne correspondent pas.")

    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(
            f"Mot de passe trop court ({MIN_PASSWORD_LENGTH} caractères minimum) — "
            "même contrainte que l'API."
        )
    return password


def main() -> None:
    args = _parse_args()
    role = Role(args.role)
    password = _resolve_password(args.password)

    db = SessionLocal()
    try:
        if repository.get_by_email(db, args.email) is not None:
            raise SystemExit(f"Un compte existe déjà pour {args.email}.")

        user = repository.create(
            db,
            User(
                first_name=args.first_name,
                last_name=args.last_name,
                email=args.email,
                password_hash=hash_password(password),
                role=role,
            ),
        )
    finally:
        db.close()

    print(f"Compte créé : {user.email} (id {user.id}, rôle {user.role.value})")
    print("Connexion via POST /api/auth/login.")


if __name__ == "__main__":
    sys.exit(main())
