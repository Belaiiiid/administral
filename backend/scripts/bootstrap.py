"""One-shot local setup: database → migrations → seed → verification.

Everything that follows a working credential, in one command:

    .venv/Scripts/python -m scripts.bootstrap

Idempotent. Re-running it re-applies migrations (a no-op when current) and
re-seeds, so it is safe to use as a reset.

It does *not* configure PostgreSQL authentication. That is deliberate: the
password must already work before this script can do anything, and changing how
a database server authenticates is not a thing a setup script should do quietly.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent
VERSIONS_DIR = BACKEND_ROOT / "alembic" / "versions"


def _step(number: int, label: str) -> None:
    print(f"\n[{number}/5] {label}", flush=True)


def _run(*args: str) -> None:
    """Run a subcommand with the current interpreter, failing loudly."""
    result = subprocess.run([sys.executable, *args], cwd=BACKEND_ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(f"Échec : {' '.join(args)}")


def ensure_database() -> None:
    """Create the application database if it does not exist.

    Connects to the maintenance database `postgres`, because you cannot create
    a database from inside the one you are creating.
    """
    admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT")

    try:
        with engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": settings.database_name},
            ).scalar()

            if exists:
                print(f"      base « {settings.database_name} » déjà présente")
            else:
                # Identifier quoting, not a bind parameter: PostgreSQL does not
                # accept parameters in CREATE DATABASE.
                connection.execute(text(f'CREATE DATABASE "{settings.database_name}"'))
                print(f"      base « {settings.database_name} » créée")
    except OperationalError as exc:
        raise SystemExit(
            "\nConnexion à PostgreSQL impossible.\n\n"
            f"  utilisateur : {settings.database_user}\n"
            f"  hôte        : {settings.database_host}:{settings.database_port}\n\n"
            "Le mot de passe de backend/.env doit correspondre à celui déjà\n"
            "enregistré dans PostgreSQL. L'écrire dans .env ne le définit pas.\n\n"
            f"Détail : {exc.orig}"
        ) from exc


def ensure_migration_exists() -> None:
    """Autogenerate the initial revision if `alembic/versions` is empty.

    Generated rather than hand-written: autogenerate reads the SQLAlchemy
    metadata, so it cannot disagree with the models the way a hand-written
    migration silently can.
    """
    VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
    revisions = [p for p in VERSIONS_DIR.glob("*.py") if p.name != "__init__.py"]

    if revisions:
        print(f"      {len(revisions)} révision(s) déjà présente(s)")
        return

    print("      aucune révision — autogénération")
    _run("-m", "alembic", "revision", "--autogenerate", "-m", "initial schema")


def main() -> None:
    print(f"MonParcours — installation locale ({settings.database_name})")

    _step(1, "Base de données")
    ensure_database()

    _step(2, "Révision Alembic")
    ensure_migration_exists()

    _step(3, "Application des migrations")
    _run("-m", "alembic", "upgrade", "head")

    _step(4, "Données de démonstration")
    _run("-m", "scripts.seed")

    _step(5, "Vérification")
    engine = sa.create_engine(settings.database_url)
    with engine.connect() as connection:
        tables = connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        ).scalars().all()
        cases = connection.execute(text("SELECT count(*) FROM cases")).scalar()

    print(f"      {len(tables)} tables : {', '.join(tables)}")
    print(f"      {cases} dossier(s) en base")

    print("\nTerminé. Démarrer l'API :")
    print("    .venv/Scripts/python -m uvicorn app.main:app --reload")
    print("    http://localhost:8000/docs")


if __name__ == "__main__":
    main()
