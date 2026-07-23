"""Engine, session factory, and the request-scoped session dependency."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.exceptions import DatabaseConnectionError

# ``pool_pre_ping`` issues a cheap liveness check before handing out a pooled
# connection. Without it, a connection dropped by a PostgreSQL restart or an
# idle timeout is handed to a request and fails there — a class of intermittent
# error that is miserable to diagnose.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session.

    One session per request, closed when the request ends whatever happens.
    The rollback on failure matters: without it a failed transaction is
    returned to the pool still dirty, and the *next* request to borrow that
    connection inherits the broken state.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def verify_connection() -> None:
    """Prove PostgreSQL answers. Called at startup, before the port is served.

    A server that binds the port first and only discovers the database is
    unreachable on the first request looks healthy while failing every call.
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise DatabaseConnectionError(
            "Connexion à PostgreSQL impossible.\n"
            "Vérifiez que le service PostgreSQL est démarré, que la base existe, "
            "et que les variables DATABASE_* de backend/.env sont correctes.\n"
            f"Cause : {exc}"
        ) from exc


def check_health() -> dict[str, object]:
    """Back the ``/health`` endpoint. Never raises — an unhealthy DB is a result."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        return {"reachable": False, "error": str(exc)}

    return {"reachable": True}
