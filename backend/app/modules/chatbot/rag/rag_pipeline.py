"""
Module RAG de production pour la branche 'rag_general' de l'orchestrateur D4.
Contrairement à hybrid_search.py (qui sert de banc de test), ce module est
conçu pour être importé et initialisé UNE SEULE FOIS au démarrage de l'app
(construire les index est coûteux), puis interrogé plusieurs fois.

Résilience : la recherche sémantique (Qdrant + modèle d'embeddings
sentence-transformers) exige de charger torch et un modèle, et parfois de le
télécharger au premier démarrage. Si cela échoue ou traîne (pas de réseau,
incompatibilité de librairie, environnement hors-ligne), le pipeline NE DOIT PAS
rester bloqué ni tomber en panne : il démarre sur une recherche BM25 seule
(lexicale, pur Python, aucun téléchargement) qui suffit à fournir des réponses
citées. La génération (Mistral) reste identique dans les deux cas. C'est ce qui
garantit que l'assistant répond toujours, même sans la couche sémantique.

LE DÉLAI BORNE L'ATTENTE, PAS LA DISPONIBILITÉ. Nuance apprise en production :
la construction était ABANDONNÉE au délai — le thread continuait pourtant, la
couche sémantique finissait de se charger, et son résultat était jeté. Le process
restait en BM25 seul pour toute sa vie, alors que le modèle était en mémoire.
Sur une machine Windows où le seul `import sentence_transformers` prend une
vingtaine de secondes (torch et ses milliers de fichiers), suivi de 13 s pour
construire le modèle, le délai de 25 s était dépassé À CHAQUE démarrage, modèle
déjà en cache et embeddings déjà générés : la moitié sémantique de la recherche
hybride n'était jamais servie. La construction se poursuit donc en arrière-plan
et le pipeline bascule tout seul en hybride dès qu'elle aboutit.
"""
import os
import threading
import time

from app.core.logger import logger
from . import bm25_index
from . import qdrant_index
from .hybrid_search import reciprocal_rank_fusion
from .llm_client import call_llm_structured, historique_de_confiance

# La recherche sémantique est activée par défaut. Le délai ci-dessous dit combien de
# temps le DÉMARRAGE l'attend avant de servir en BM25 seul — il ne décide pas si elle
# sera disponible : la construction se poursuit et le pipeline s'y raccroche dès
# qu'elle aboutit (voir `_try_build_semantic`). L'augmenter ne fait donc que retarder
# la mise en service ; `CHATBOT_SEMANTIC=0` est le seul réglage qui la désactive.
_SEMANTIC_ENABLED = os.environ.get("CHATBOT_SEMANTIC", "1").lower() not in ("0", "false", "no")
_SEMANTIC_TIMEOUT_S = float(os.environ.get("CHATBOT_SEMANTIC_TIMEOUT_S", "25"))

GENERATION_SYSTEM_PROMPT = """Tu es un assistant qui aide les citoyens à comprendre l'aide au logement (APL).
Réponds en langage simple et clair (vulgarisé), pas de jargon juridique.

STYLE :
- Réponds de manière directe et professionnelle, comme un conseiller s'adressant à un citoyen.
- Ne commence JAMAIS par une formule du type "D'après les informations disponibles", "Selon les
  extraits fournis" ou équivalent - le citoyen n'a pas besoin de savoir comment tu as obtenu
  l'information. Donne directement la réponse.

RÈGLES STRICTES :
- Réponds UNIQUEMENT à partir des extraits fournis ci-dessous. N'invente jamais une information absente des extraits.
- Si les extraits ne permettent pas de répondre correctement, ne réponds PAS à moitié et ne
  comble pas : signale-le en ajoutant "repondu": false à ton JSON (voir le format ci-dessous).
  C'est le code qui se chargera alors de renvoyer le citoyen vers la source officielle. Mieux
  vaut un aveu qu'une réponse partielle sur un sujet qui engage ses droits.
- Ne calcule JAMAIS un montant d'aide, même approximatif, même si le citoyen te donne ses revenus
  et son loyer, et même s'il insiste. Ne pose pas non plus de question de clarification dans le but
  d'en calculer un : le montant dépend de barèmes annuels, de la zone géographique et des ressources
  sur douze mois glissants, qui ne sont dans aucun extrait. Explique les critères pris en compte et
  renvoie au simulateur officiel de la CAF (caf.fr). Annoncer un chiffre créerait un litige.
- Si la réponse dépend de la situation ou du profil du citoyen (statut, ressources, composition du
  foyer, type de logement...) et que cette information manque dans la conversation, pose une question
  de clarification au lieu de répondre directement.
- Ne pose jamais plus de 4 questions de clarification au total sur une même question (regarde
  l'historique fourni pour savoir combien tu en as déjà posées). Passé ce nombre, réponds avec les
  meilleures informations disponibles à partir des extraits, en signalant les limites de ta réponse.
- Si le citoyen répond "Je ne comprends pas, expliquez-moi" à une clarification, explique le terme
  ou la question en langage très simple (un exemple concret aide), PUIS repose la même question
  (reformulée plus simplement si possible) - ne l'ignore pas et ne réponds pas à sa place.

FORMAT DE SORTIE :
Réponds UNIQUEMENT avec un JSON de la forme :
{"type": "answer", "text": "...", "repondu": true}
ou, si les extraits ne permettent pas de répondre :
{"type": "answer", "text": "ce qui manque, en une phrase", "repondu": false}
ou, si tu as besoin d'une clarification :
{"type": "clarification", "text": "la question posée au citoyen", "options": [...] ou null}
- "options": liste de choix courts (2 à 4) si la question a un nombre limité de réponses plausibles
  (ex: statut du logement). Mets "options": null si la réponse attendue est une valeur libre (ex: un
  montant, une date) - dans ce cas ne mets PAS de liste, le citoyen répondra en texte libre.
- Ne mets PAS toi-même d'option "passer cette question" ou "je ne comprends pas" dans ta liste -
  elles sont ajoutées automatiquement, inutile de les dupliquer.
"""


class RagPipeline:
    def __init__(self):
        debut = time.perf_counter()
        # BM25 : pur Python, aucune dépendance réseau — toujours disponible.
        self.bm25, self.chunks = bm25_index.build_index()

        # Sémantique : optionnelle et bornée. Une panne ou une lenteur ici ne doit
        # jamais empêcher l'assistant de répondre.
        self.qdrant_client = None
        self.embedding_model = None
        self.semantic_available = False
        if _SEMANTIC_ENABLED:
            self._try_build_semantic()

        # `warn` et non `info` quand la couche sémantique manque : l'assistant répond
        # toujours, mais moins bien. C'est exactement le genre de panne qui se remarque
        # à la qualité des réponses des semaines plus tard si personne ne l'a signalée
        # au moment où elle s'est produite.
        #
        # Ce mode est celui de l'INSTANT du démarrage, plus forcément celui du process :
        # une construction encore en cours peut le faire passer en hybride quelques
        # secondes après cette ligne (« recherche sémantique disponible » le dira). Le
        # mode qui fait foi à un instant donné est celui de `orchestrator.mode_recherche`,
        # rendu à chaque tour et sur `/api/health`.
        contexte = {
            "mode": "hybride" if self.semantic_available else "bm25_seul",
            "chunks": len(self.chunks),
            "duree_ms": round((time.perf_counter() - debut) * 1000),
        }
        if self.semantic_available:
            logger.info("chatbot: pipeline RAG prêt", contexte)
        else:
            logger.warn("chatbot: pipeline RAG prêt en mode dégradé (BM25 seul)", contexte)

    def _try_build_semantic(self):
        """Lance la construction sémantique et attend au plus `_SEMANTIC_TIMEOUT_S`.

        Le chargement peut être long, voire ne jamais aboutir (premier téléchargement
        sans réseau, client HTTP fermé). Il tourne donc dans un thread, et le démarrage
        ne l'attend qu'un temps borné.

        Passé ce délai on N'ABANDONNE PAS : le thread poursuit et publiera lui-même son
        résultat. C'est la différence avec la version précédente, qui jetait un travail
        déjà presque terminé et condamnait le process au BM25 seul (voir l'en-tête du
        module). Le thread est daemon : il mourra avec le process, jamais après."""
        debut = time.perf_counter()

        def construire():
            try:
                client, modele = qdrant_index.build_index()
            except Exception as exc:  # noqa: BLE001 — capturé pour dégrader proprement
                logger.warn(
                    "chatbot: index sémantique indisponible, recherche BM25 seule",
                    {"error": str(exc)},
                )
                return
            self._publier_semantique(client, modele, debut)

        worker = threading.Thread(target=construire, name="rag-semantic-build", daemon=True)
        worker.start()
        worker.join(_SEMANTIC_TIMEOUT_S)

        if worker.is_alive():
            logger.warn(
                "chatbot: index sémantique pas prêt dans le délai, démarrage en BM25 seul "
                "— la construction se poursuit et basculera en hybride dès qu'elle aboutit",
                {"delai_s": _SEMANTIC_TIMEOUT_S},
            )

    def _publier_semantique(self, client, modele, debut: float) -> None:
        """Rend la couche sémantique visible aux requêtes en cours.

        LE DRAPEAU EN DERNIER, comme pour les singletons du moteur : `retrieve` lit
        `semantic_available` d'abord et ne touche au client et au modèle qu'ensuite.
        Publier le drapeau avant eux ouvrirait une fenêtre — courte, mais servie par un
        pool de quarante threads — où un tour verrait « hybride » et un client encore
        vide. Dans cet ordre, un tour voit soit l'ancien mode, soit le nouveau, jamais
        un état intermédiaire ; aucun verrou n'est donc nécessaire.

        Peut être appelé APRÈS le délai de démarrage : c'est précisément ce qui permet
        au pipeline de passer de lui-même en hybride, sans redémarrage."""
        self.qdrant_client = client
        self.embedding_model = modele
        self.semantic_available = True
        logger.info(
            "chatbot: recherche sémantique disponible",
            {
                "mode": "hybride",
                # Une durée supérieure au délai dit, à elle seule, que la bascule a eu
                # lieu après le démarrage : inutile d'un second champ pour le répéter.
                "duree_ms": round((time.perf_counter() - debut) * 1000),
                "delai_demarrage_s": _SEMANTIC_TIMEOUT_S,
            },
        )

    def retrieve(self, query, top_k=3, category="demarche"):
        """category: une catégorie (str) ou une liste de catégories (ex: ["demarche", "legislation"]) -
        voir orchestrator.CATEGORIES_BY_ROLE pour le filtrage selon le rôle (citoyen/agent)."""
        bm25_results = bm25_index.search(query, self.bm25, self.chunks, top_k=10, category=category)

        # BM25 seul : on renvoie directement les meilleurs résultats lexicaux. Le drapeau
        # est relu à CHAQUE tour, et c'est voulu : il peut passer à vrai en cours de vie
        # du process, quand une construction sémantique lente finit par aboutir
        # (`_publier_semantique`). Le tour suivant part alors en hybride, sans rien avoir
        # à redémarrer.
        if not self.semantic_available:
            return bm25_results[:top_k]

        # Hybride : on fusionne lexical + sémantique. Une panne sémantique en cours
        # de route (Qdrant, encodage) retombe elle aussi sur BM25.
        try:
            semantic_results = qdrant_index.search(
                query, self.qdrant_client, self.embedding_model, top_k=10, category=category
            )
        except Exception:  # noqa: BLE001 — la recherche doit toujours renvoyer quelque chose
            # Dégradation SILENCIEUSE au tour près : l'index est annoncé disponible mais
            # la recherche échoue. Rien ne le distinguait d'une réponse normale de moindre
            # qualité - c'est le pire cas à diagnostiquer sans trace.
            logger.exception("chatbot: recherche sémantique en échec, repli BM25 pour ce tour")
            return bm25_results[:top_k]
        return reciprocal_rank_fusion(bm25_results, semantic_results, top_k=top_k)

    def generate_answer(self, query, retrieved_chunks, conversation_history=None, model="mistral-small-latest", provider="mistral", consigne_finale=None):
        """Retourne un dict {"type": "answer"|"clarification", "text": str, "options": list|None}.
        Lève `LlmContractError` si le modèle ne rend pas le JSON demandé (voir llm_client).

        `consigne_finale` : instruction ajoutée pour ce tour seulement, par exemple pour
        exiger une réponse quand le plafond de clarifications est atteint. Placée après
        la question, à l'endroit le plus proche de la génération."""
        context = "\n\n".join(
            f"[Extrait {i+1}] (source: {chunk['source_url']})\n{chunk['text']}"
            for i, (chunk, _score) in enumerate(retrieved_chunks)
        )
        user_prompt = f"Extraits disponibles :\n\n{context}\n\nQuestion du citoyen : {query}"
        if consigne_finale:
            user_prompt = f"{user_prompt}\n\n{consigne_finale}"

        messages = [{"role": "system", "content": GENERATION_SYSTEM_PROMPT}]
        messages.extend(historique_de_confiance(conversation_history))
        messages.append({"role": "user", "content": user_prompt})

        return call_llm_structured(messages=messages, model=model, provider=provider, temperature=0.2)

    def answer(self, query, top_k=3, category="demarche", conversation_history=None, model="mistral-small-latest", provider="mistral", requete_recherche=None, consigne_finale=None):
        """`requete_recherche` permet de CHERCHER avec autre chose que ce qu'on montre au
        modèle. Un dialogue de clarification en a besoin : les réponses données sont
        indispensables au retrieval, mais « Je ne comprends pas, expliquez-moi » n'apporte
        aucun mot utile à une recherche lexicale et en dégraderait le résultat. Par défaut,
        les deux sont la même chose."""
        retrieved = self.retrieve(requete_recherche or query, top_k=top_k, category=category)
        generated = self.generate_answer(
            query, retrieved, conversation_history=conversation_history,
            model=model, provider=provider, consigne_finale=consigne_finale,
        )
        sources = list({chunk["source_url"] for chunk, _ in retrieved})
        return {**generated, "sources": sources, "retrieved_chunks": retrieved}


if __name__ == "__main__":
    pipeline = RagPipeline()

    test_query = "Quels documents pour l'APL ?"
    result = pipeline.answer(test_query)

    print(f"Question: {test_query}\n")
    print(f"[{result['type']}] {result['text']}")
    if result["options"]:
        print(f"Options: {result['options']}")
    print(f"Sources: {result['sources']}")