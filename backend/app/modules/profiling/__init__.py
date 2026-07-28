"""
Profilage citoyen (A2/A3/A4) — assistant de profilage adaptatif APL.

Slice complète portée depuis MonParcours (anciennement `app/api` + `app/core` +
`app/schemas`), réorganisée sans changement de logique :

- ``routers``      : endpoints HTTP (session + tour de profilage).
- ``services``     : boucle agent (LangGraph), harness, LLM Mistral, coercion,
                     complétude (A4), règles d'exclusion (knowledge).
- ``schemas``      : contrats Pydantic (``profil``, ``agent``).
- ``repositories`` : store de session en mémoire (contrat Redis-like).
- ``models``       : dataclass ``Session``.

Le routeur agrégé est exposé par ``app.modules.profiling.routers`` et
monté sous ``/api`` dans ``app.main``.
"""
