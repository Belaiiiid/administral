"""Domain exceptions and their HTTP translation.

Services raise these without importing FastAPI or knowing what a 404 is. The
handlers registered in ``app.main`` do the translating, which keeps the domain
layer transport-agnostic — the same service is callable from a CLI task or a
test without a request object in sight.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Base for errors that map onto an HTTP status."""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404
    code = "NOT_FOUND"


class ValidationError(DomainError):
    status_code = 400
    code = "BAD_REQUEST"


class DatabaseConnectionError(DomainError):
    """Raised at startup when PostgreSQL cannot be reached."""

    status_code = 503
    code = "DATABASE_UNAVAILABLE"


async def domain_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Shapes a domain error into the envelope the frontend already expects.

    Matches ``ApiError`` in ``frontend/src/types/common.ts`` so ``apiClient``
    can normalise failures without special-casing endpoints.
    """
    assert isinstance(exc, DomainError)

    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )
