"""Coherence analysis orchestration (Module C1).

Ported from `MonParcours-nour/analyse_coherence.py`. Takes a completed dossier,
runs the LLM verification, and aggregates the per-check results into a single
verdict.

Called after a dossier is marked "Complet" by the completeness stage. Its
verdict routes the dossier downstream:

    coherent_global = True   → toward the final report / scoring
    coherent_global = False  → toward fraud review (Module C4) or a human

This is business logic, not a request handler and not an HTTP call — the router
owns the first, `mistral_client` owns the second.
"""

from __future__ import annotations

from app.modules.ai.coherence.mistral_client import verifier_coherence_llm
from app.modules.ai.coherence.schemas import (
    CoherenceStatus,
    ResultatCoherence,
    Verification,
)


def _statut_global(verifications: list[Verification]) -> CoherenceStatus:
    """The worst status wins.

    One proven `incoherent` makes the whole dossier incoherent. Absent that, any
    `a_revoir` makes it reviewable. `coherent` is only reached when every check
    earned it — coherence is never the default.
    """
    statuts = {v.statut for v in verifications}

    if "incoherent" in statuts:
        return "incoherent"
    if "a_revoir" in statuts:
        return "a_revoir"
    return "coherent"


def analyser_coherence(profil: dict, documents: list[dict]) -> ResultatCoherence:
    """Analyse a complete dossier for cross-document coherence.

    Args:
        profil: the citizen's declared information.
        documents: OCR-extracted fields per document, as the completeness
            pipeline produces them.

    Returns:
        The global verdict plus every non-coherent check.
    """
    resultats = verifier_coherence_llm(profil, documents)
    verifications = [Verification(**r) for r in resultats]

    statut = _statut_global(verifications)
    incoherences = [v for v in verifications if v.statut != "coherent"]

    return ResultatCoherence(
        coherent_global=statut == "coherent",
        statut_global=statut,
        incoherences=incoherences,
    )
