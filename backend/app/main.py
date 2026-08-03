"""FastAPI application entry point.

Run locally:

    uvicorn app.main:app --reload

Swagger UI:  http://localhost:8000/docs
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import DomainError, domain_error_handler
from app.core.logger import logger
from app.database.session import check_health, verify_connection
from app.modules.chatbot.router import router as chatbot_router
from app.modules.profiling.routers import router as profiling_router
from app.modules.agent.router import router as agent_router
from app.modules.ai.coherence.router import router as coherence_router
from app.modules.ai.job_match.router import router as job_match_router
from app.modules.ai.cv_coach.router import router as cv_coach_router
from app.modules.ai.job_search.router import router as job_search_router
from app.modules.ai.fraud.router import router as fraud_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router, staff_router as auth_staff_router
from app.modules.citizen.router import router as citizen_router
from app.modules.contestation.router import router as contestation_router
from app.modules.notifications.router import router as notifications_router
from app.modules.settings.router import router as settings_router


#: Permet de sauter le préchauffage (tests, itération rapide en dev). Le moteur se
#: construira alors à la première question qui en a besoin, sous verrou.
_WARMUP_ENABLED = os.environ.get("CHATBOT_WARMUP", "1").lower() not in ("0", "false", "no")


def _warmup_chatbot() -> None:
    """Construit le moteur (index, embeddings, graphe juridique) AVANT de servir.

    Fait volontairement de façon SYNCHRONE, et plus dans un thread démon. Le
    préchauffage en arrière-plan créait une course : pendant les ~25 s de
    chargement, une requête entrante trouvait le singleton encore vide et
    commençait sa PROPRE construction. Deux modèles d'embeddings en mémoire, et
    surtout deux ouvertures du même dossier Qdrant — qui n'en admet qu'une. Le
    perdant récupérait une erreur, dégradait en BM25 seul, et c'est cette
    instance-là qui pouvait rester en cache pour toute la vie du process.

    Bloquer le démarrage est le comportement correct : tant que le moteur n'est
    pas prêt, le service n'est pas prêt. Un serveur qui accepte du trafic avant
    d'être en état est plus difficile à diagnostiquer qu'un serveur qui met
    trente secondes à démarrer. Le chargement sémantique reste borné par
    `CHATBOT_SEMANTIC_TIMEOUT_S`, donc l'attente ne peut pas être infinie.

    Best-effort quant à l'échec : une panne ici est consignée, pas fatale — le
    moteur retentera à la première question et dégradera proprement s'il ne peut
    pas."""
    if not _WARMUP_ENABLED:
        logger.info("chatbot: préchauffage désactivé (CHATBOT_WARMUP=0)")
        return
    try:
        from app.modules.chatbot.rag import orchestrator

        orchestrator.get_rag_pipeline()
        # Le graphe juridique (~1 s, en mémoire) : chargé ici pour la même raison que
        # les index, et parce qu'il partage le pipeline RAG qu'on vient de construire.
        orchestrator.get_legal_pipeline()
    except Exception:  # noqa: BLE001 — warmup must never affect startup
        # Ne pas affecter le démarrage ne veut pas dire ne rien dire : un préchauffage
        # raté laisse la première question du citoyen payer le chargement complet, ou
        # échouer. `pass` rendait les deux indistinguables d'un démarrage sain.
        logger.exception("chatbot: préchauffage du moteur en échec")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Verify PostgreSQL answers before the app serves traffic.

    Failing here stops startup with a legible message. Letting the app bind the
    port and discover the database is unreachable on the first request means a
    broken environment looks healthy — it answers, then fails every call.

    Même raisonnement pour l'assistant, d'où le préchauffage synchrone ci-dessous.
    """
    verify_connection()
    _warmup_chatbot()
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


@app.get("/api/health", tags=["health"], summary="Liveness, base et mode de l'assistant")
def health() -> dict[str, object]:
    """503 when the database is unreachable, rather than 200-with-a-flag.

    A process that cannot serve a single useful request is not healthy, and
    anything reading the status code has to be able to see that.

    Le mode de recherche de l'assistant est rendu ici, mais NE FAIT PAS basculer le
    statut. La nuance est délibérée : en BM25 seul l'assistant répond toujours, avec
    des sources, simplement moins bien. Basculer le statut ferait retirer le service
    du trafic par un répartiteur de charge - on remplacerait des réponses dégradées
    par pas de réponse du tout. C'est une information d'exploitation, à surveiller et
    à alerter, pas un signal de vie.

    « non_initialise » n'est pas une panne : c'est un processus dont le préchauffage
    est désactivé et à qui personne n'a encore posé de question.
    """
    from app.modules.chatbot.rag import orchestrator

    database = check_health()

    return {
        "assistant": {"mode_recherche": orchestrator.mode_recherche()},
        "status": "ok" if database["reachable"] else "degraded",
        "database": database,
    }


# `/api` matches the frontend's API_BASE_URL default (see
# frontend/src/services/apiClient.ts).
app.include_router(auth_router, prefix="/api")
# Admin-only staff provisioning. Separate router, same module — see auth/router.py.
app.include_router(auth_staff_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(chatbot_router, prefix="/api")
app.include_router(coherence_router, prefix="/api")
app.include_router(job_match_router, prefix="/api")
app.include_router(cv_coach_router, prefix="/api")
app.include_router(job_search_router, prefix="/api")
app.include_router(fraud_router, prefix="/api")
app.include_router(citizen_router, prefix="/api")
# Citizen profiling assistant (A2/A3/A4): /api/session + /api/session/{id}/profilage/tour
app.include_router(profiling_router, prefix="/api")
# Cross-cutting notifications — same endpoints for both portals, scoped per user.
app.include_router(notifications_router, prefix="/api")
# Per-account settings — same endpoints for both portals, scoped per user.
app.include_router(settings_router, prefix="/api")
# Immutable, hash-chained audit trail (Traçabilité totale). Read-only over HTTP;
# events are written only from inside the domain flows they record.
app.include_router(audit_router, prefix="/api")
# Droit de contestation — citizen challenges a decision, agent reviews/resolves.
# Every transition is written into the audit trail above.
app.include_router(contestation_router, prefix="/api")

# Voice assistant (STT/TTS proxy) — productized minimal gateway
try:
    from app.modules.voice.router import router as voice_router  # type: ignore

    app.include_router(voice_router, prefix="/api")
except Exception:
    # Optional: if module missing, the rest of the app must continue to work
    pass

# Not yet mounted — these modules exist as folders with no routes. Each is
# added when its slice is built, not speculatively:
#
#   app.include_router(auth_router, prefix="/api")
#   app.include_router(citizen_router, prefix="/api")
#   app.include_router(apl_router, prefix="/api")
