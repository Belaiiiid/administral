"""Migrated APL RAG engine (Squad D — D3/D4).

Hybrid retrieval (BM25 + Qdrant) + LangGraph intent orchestration, ported into
MonParcours verbatim: only the internal imports were made package-relative and
the data paths made module-relative (the corpus and embedded vector store now
ship inside this package). The retrieval pipeline, RRF fusion, prompts,
conversation memory and the single LLM entry point (`llm_client.call_llm`) are
unchanged. The MonParcours-specific wiring lives one level up (service/router),
never inside this engine.
"""
