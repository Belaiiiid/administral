"""Job-offer match analysis for France Travail.

Stateless: a citizen pastes a job offer and provides a CV, Mistral compares
them, and the response is returned directly — no `Application`/`Case`, no
persistence, no agent review. Distinct from the APL pipeline's
`ai.coherence`/`ai.fraud`/`ai.checklist`, which all feed a submitted dossier;
this feeds nothing but the citizen's own screen.
"""
