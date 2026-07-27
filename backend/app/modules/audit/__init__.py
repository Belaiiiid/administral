"""Immutable, hash-chained audit trail.

The cross-cutting **Traçabilité totale** guardrail of the functional
specification and the **log immuable SHA-256** of the technical one: every
decision, submission and profile edit leaves an append-only record whose hash
chains to the one before it, so any later tampering with a past entry is
detectable.
"""
