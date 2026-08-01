"""HTTP layer for job search. Stateless, no citizen identity required —
same reasoning as `ai.job_match.router`/`ai.cv_coach.router`."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.ai.job_search.schemas import JobSearchRequest, JobSearchResult
from app.modules.ai.job_search.service import search_jobs

router = APIRouter(prefix="/ai/job-search", tags=["ai-job-search"])


@router.post(
    "/search",
    response_model=JobSearchResult,
    summary="Rechercher des offres d'emploi réelles à partir d'une phrase libre",
    description=(
        "Analyse une phrase libre (métier recherché, ville, etc.) pour "
        "interroger l'API officielle France Travail « Offres d'emploi » et "
        "renvoie de vraies offres actuellement ouvertes, avec un score de "
        "pertinence quand il a pu être calculé. Jamais d'offre inventée : "
        "sans accès à l'API, `available` vaut false plutôt qu'un résultat "
        "fabriqué."
    ),
)
def search(payload: JobSearchRequest) -> JobSearchResult:
    return search_jobs(payload.prompt)
