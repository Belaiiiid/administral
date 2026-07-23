"""FastAPI application entry point.

Run locally:

    uvicorn app.main:app --reload

Swagger UI:  http://localhost:8000/docs
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import DomainError, domain_error_handler
from app.database.session import check_health, verify_connection
from app.features.citizen.profiling.routers import router as profiling_router
from app.modules.agent.router import router as agent_router
from app.modules.ai.chatbot.router import router as chatbot_router
from app.modules.ai.coherence.router import router as coherence_router
from app.modules.auth.router import router as auth_router
from app.modules.citizen.router import router as citizen_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Verify PostgreSQL answers before the app serves traffic.

    Failing here stops startup with a legible message. Letting the app bind the
    port and discover the database is unreachable on the first request means a
    broken environment looks healthy — it answers, then fails every call.
    """
    verify_connection()
    yield


app = FastAPI(
    title="MonParcours API",
    version="0.1.0",
    description=(
        "API du portail citoyen MonParcours.\n\n"
        "Monolithe modulaire : chaque module expose son propre routeur, "
        "avec la séparation router / service / repository."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domain errors carry their own status; this turns them into the `ApiError`
# envelope the frontend already expects.
app.add_exception_handler(DomainError, domain_error_handler)


@app.get("/api/health", tags=["health"], summary="Liveness et accessibilité de la base")
def health() -> dict[str, object]:
    """503 when the database is unreachable, rather than 200-with-a-flag.

    A process that cannot serve a single useful request is not healthy, and
    anything reading the status code has to be able to see that.
    """
    database = check_health()

    return {
        "status": "ok" if database["reachable"] else "degraded",
        "database": database,
    }


# `/api` matches the frontend's API_BASE_URL default (see
# frontend/src/services/apiClient.ts).
app.include_router(auth_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(chatbot_router, prefix="/api")
app.include_router(coherence_router, prefix="/api")
app.include_router(citizen_router, prefix="/api")
# Citizen profiling assistant (A2/A3/A4): /api/session + /api/session/{id}/profilage/tour
app.include_router(profiling_router, prefix="/api")

# Not yet mounted — these modules exist as folders with no routes. Each is
# added when its slice is built, not speculatively:
#
#   app.include_router(auth_router, prefix="/api")
#   app.include_router(citizen_router, prefix="/api")
#   app.include_router(apl_router, prefix="/api")
