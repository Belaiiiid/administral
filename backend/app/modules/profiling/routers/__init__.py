"""Profilage routers — aggregated into a single router the app mounts once.

Both sub-routers share the `/session` prefix (session lifecycle + the adaptive
profiling turn); this bundles them so `app.main` includes a single object under
the `/api` prefix, exactly like every other Civique module.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.modules.profiling.routers.profilage import router as profilage_router
from app.modules.profiling.routers.session import router as session_router

router = APIRouter()
router.include_router(session_router)
router.include_router(profilage_router)
