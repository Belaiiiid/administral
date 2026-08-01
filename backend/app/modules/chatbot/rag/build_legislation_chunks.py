# -*- coding: utf-8 -*-
"""Génère `data/chunks/chunks_legislation.json` à partir du knowledge graph juridique.

POURQUOI CE FICHIER EXISTE
Le graphe ne s'interroge que par NUMÉRO d'article : il n'a aucune recherche par sujet.
Un citoyen, lui, écrit « je loue l'appartement de mes parents » — jamais « L822-3 ».
Entre les deux, il y a un écart de vocabulaire que ni BM25 ni les embeddings ne
franchissent seuls : le texte officiel dit « ascendants ou descendants », pas « parents ».

On construit donc, UNE FOIS et hors ligne, une « carte d'identité citoyenne » par
article : une phrase en langage simple + les questions telles qu'un citoyen les poserait.
Elle est indexée à côté du texte officiel, dans le même format de chunk que les autres
sources — donc chargée automatiquement par bm25_index.py et qdrant_index.py, sans une
ligne de code à changer (voir CLAUDE.md, `data/chunks/`).

RÈGLE DE SÛRETÉ QUI REND CECI ACCEPTABLE
Le texte généré est une CLÉ D'INDEX, jamais une réponse. La branche juridique s'en sert
pour identifier QUEL article répond, puis va chercher le texte officiel dans le graphe,
dans sa version applicable, avec son identifiant LEGIARTI. Une carte maladroite fait
rater un article ; elle ne peut pas produire une réponse fausse. Les lignes générées
portent d'ailleurs un marqueur explicite dans le texte du chunk.

CHOIX D'INDEXATION
- Un seul chunk par article, jamais découpé : le but du retrieval ici est d'identifier
  un NUMÉRO d'article, pas de renvoyer un passage. Découper multiplierait les candidats
  pour un même article sans rien apporter.
- La carte est placée EN TÊTE du texte : le modèle d'embeddings tronque au-delà de ~128
  tokens, donc c'est elle qui porte la similarité sémantique, pendant que BM25, lui, lit
  le texte officiel en entier.
- Seule la version EN VIGUEUR aujourd'hui est indexée. Les versions antérieures restent
  le travail du graphe, interrogé après coup avec le numéro trouvé : l'index dit QUEL
  article, le graphe dit QUELLE version.

USAGE
    python build_legislation_chunks.py --articles L822-3,L553-1   # échantillon
    python build_legislation_chunks.py                            # tout le corpus
    python build_legislation_chunks.py --limit 20                 # les 20 premiers

Les cartes déjà générées sont mises en cache dans `data/kg/cartes_citoyennes.json`
(clé = identifiant LEGIARTI, donc une nouvelle version d'article est régénérée, pas
resservie). Relancer le script ne repaie donc pas les appels LLM déjà faits.
"""
import argparse
import json
import os
import time
from datetime import date

from .legal_kg import get_kg
from .llm_client import call_llm

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(_BASE_DIR, "data", "kg", "cartes_citoyennes.json")
OUTPUT_FILE = os.path.join(_BASE_DIR, "data", "chunks", "chunks_legislation.json")

LEGIFRANCE_URL = "https://www.legifrance.gouv.fr/codes/article_lc/{legiarti}"

CARTE_SYSTEM_PROMPT = """Tu prépares un INDEX DE RECHERCHE pour un chatbot qui aide des citoyens
sur l'aide au logement (APL). On te donne le texte officiel d'un article de loi.

Ton travail n'est PAS de répondre à une question ni de reformuler l'article pour l'afficher :
c'est de produire de quoi RETROUVER cet article quand un citoyen décrit sa situation avec ses
propres mots.

Produis :
1. "resume" : UNE phrase, en langage simple, disant ce que cet article règle concrètement dans
   la vie du citoyen. Pas de jargon, pas de numéro d'article, pas de référence à un autre texte.
2. "questions" : 3 à 5 questions telles qu'un citoyen les poserait VRAIMENT à un chatbot, avec
   SON vocabulaire ("mes parents" et non "ascendants", "la CAF me réclame de l'argent" et non
   "recouvrement d'indu", "je partage l'appartement" et non "colocation" si c'est plus naturel).
   Varie les formulations : c'est ce qui permettra de retrouver l'article.
3. "termes" : 3 à 8 mots-clés que le citoyen est susceptible d'employer sur ce sujet, en
   mélangeant DEUX registres :
   - ses mots à lui (rembourser, retard, expulsion, chambre, garantie...) ;
   - les mots de l'ADMINISTRATION qu'il recopie de son courrier CAF sans forcément les
     comprendre (trop-perçu, indu, recours amiable, décence, impayé, prescription...).
   Ce second registre est capital : un citoyen tape souvent le mot exact de sa lettre, or ce
   mot ne figure pas toujours dans le texte de loi, qui emploie une autre formulation.
   ATTENTION, c'est la règle la plus importante de cette liste : n'y mets QUE des termes dont
   CET article traite. Un mot fréquent en matière d'APL mais étranger au sujet de l'article
   est nuisible — il ferait remonter cet article sur des questions qui ne le concernent pas.
   Exemple de ce qu'il ne faut PAS faire : mettre "trop-perçu" ou "impayé" sur un article qui
   parle de la décence du logement. Dans le doute, mets moins de termes.

RÈGLES :
- N'invente aucune règle, aucun délai, aucun montant, aucune condition qui ne serait pas dans le
  texte fourni. Si le texte est purement technique ou ne fait que renvoyer à un autre article,
  dis-le simplement dans "resume" et propose des questions plus générales sur le sujet traité.
- Ne donne jamais de chiffre de montant d'aide.
- Écris en français.

Réponds UNIQUEMENT avec un JSON de la forme :
{"resume": "...", "questions": ["...", "...", "..."], "termes": ["...", "..."]}
"""

# Version du format de carte. Elle entre dans la clé de cache : passer à la version
# suivante régénère les cartes au lieu de resservir celles de l'ancien prompt. La v2 a
# ajouté "termes" après avoir mesuré que l'article L821-7 (prescription de l'APL) était
# introuvable sur « trop-perçu » - le mot du courrier CAF, absent aussi bien du texte de
# loi (« sommes indûment payées ») que de la carte v1.
CARTE_VERSION = 2

# Marqueur inséré dans le texte du chunk : si ce chunk arrive un jour dans un prompt de
# génération (le corpus `legislation` est aussi accessible au rôle agent), le modèle doit
# voir noir sur blanc que ces deux lignes ne sont pas du texte de loi.
MARQUEUR = (
    "(Les deux lignes ci-dessus sont une reformulation non officielle, présente uniquement "
    "pour la recherche. Seul le texte officiel ci-dessous fait foi.)"
)


def charger_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def sauver_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def generer_carte(article, tentatives=3):
    """Un appel LLM par article, via le point d'entrée unique.

    Deux modes d'échec distincts, traités différemment sur un lot de plusieurs centaines
    d'appels : une panne réseau ou une limite de débit est TEMPORAIRE, on réessaie après
    une pause croissante ; un JSON malformé est propre à cet article, on renonce et on
    passe au suivant. Dans les deux cas on renvoie None plutôt que de faire tomber le
    lot : un article sans carte reste retrouvable par son texte officiel via BM25."""
    user_prompt = (
        f"Article {article.num}\n"
        f"Plan : {' > '.join(article.chemin) if article.chemin else '(non renseigné)'}\n\n"
        f"Texte officiel :\n{article.texte}"
    )
    messages = [
        {"role": "system", "content": CARTE_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    for tentative in range(1, tentatives + 1):
        try:
            raw = call_llm(messages=messages, json_mode=True, temperature=0.3)
        except Exception as e:  # réseau, quota, indisponibilité du modèle
            if tentative == tentatives:
                print(f"    [!] {article.num} abandonné après {tentatives} tentatives: {e}")
                return None
            pause = 2 ** tentative
            print(f"    [!] {article.num} tentative {tentative} échouée ({e}) - reprise dans {pause}s")
            time.sleep(pause)
            continue

        try:
            carte = json.loads(raw)
            questions = [q for q in carte.get("questions", []) if isinstance(q, str) and q.strip()]
            termes = [t for t in carte.get("termes", []) if isinstance(t, str) and t.strip()]
            resume = (carte.get("resume") or "").strip()
            if not resume or not questions:
                print(f"    [!] {article.num}: carte incomplète, ignorée")
                return None
            return {"resume": resume, "questions": questions, "termes": termes}
        except Exception as e:
            print(f"    [!] JSON illisible pour {article.num}: {e}")
            return None
    return None


def construire_texte(article, carte):
    """La carte d'abord (c'est elle qui est embarquée dans l'embedding), puis le plan,
    puis le texte officiel intégral (que BM25 lit en entier)."""
    lignes = []
    if carte:
        lignes.append(f"Ce que dit cet article, en clair : {carte['resume']}")
        lignes.append(f"Questions du citoyen : {' '.join(carte['questions'])}")
        if carte.get("termes"):
            lignes.append(f"Mots employés sur ce sujet : {', '.join(carte['termes'])}")
        lignes.append(MARQUEUR)
        lignes.append("")
    if article.chemin:
        lignes.append(f"Plan du code : {' > '.join(article.chemin)}")
    lignes.append(
        f"Texte officiel — article {article.num}, version du {article.source.date_debut} :"
    )
    lignes.append(article.texte.strip())
    return "\n".join(lignes)


def construire_chunk(article, carte):
    # DEUX CATÉGORIES, ET C'EST STRUCTURANT. Le corpus mélange les articles du droit du
    # logement et ceux ramenés par les liens depuis 19 autres codes (`hors_perimetre`).
    # Ces derniers traitent les mêmes thèmes pour d'AUTRES prestations - la prescription
    # des trop-perçus de retraite, du RSA... - et écrasent leurs équivalents APL dans les
    # résultats : mesuré, l'article L821-7 (prescription de l'APL) ne sortait même pas du
    # top 20 sur « combien de temps la CAF peut me réclamer un trop-perçu ? », derrière
    # L355-3 (vieillesse) et L262-45 (RSA). Les sortir du vivier de recherche leur rend
    # leur vrai rôle : on ne les atteint QUE par un renvoi depuis un article du logement
    # (`expand`), ce qui est précisément ce qui prouve qu'ils s'appliquent.
    categorie = "legislation_liee" if article.hors_perimetre else "legislation"
    return {
        "chunk_id": f"legislation_{article.num}",
        "text": construire_texte(article, carte),
        "question": carte["questions"][0] if carte else "",
        "source_url": LEGIFRANCE_URL.format(legiarti=article.source.id_legiarti),
        "source_title": f"Article {article.num} — "
                        f"{article.chemin[0] if article.chemin else 'Légifrance'}",
        "category": categorie,
        "hors_perimetre": article.hors_perimetre,
        "parent_id": article.num,
        "chunk_index": 0,
        # Métadonnées propres à la branche juridique : c'est `article_num` qui fait le
        # pont entre un résultat de recherche et une interrogation du graphe.
        "article_num": article.num,
        "legiarti": article.source.id_legiarti,
        "code": article.code,
        "date_debut": article.source.date_debut.isoformat() if article.source.date_debut else None,
    }


def articles_a_indexer(kg, numeros=None, limite=None):
    """Les articles ayant une version en vigueur aujourd'hui, dédoublonnés par numéro."""
    if numeros:
        articles = [kg.get_article(n) for n in numeros]
        return [a for a in articles if a is not None]

    jour = date.today()
    vus, articles = set(), []
    for identifiant, brut in kg._articles.items():  # noqa: SLF001 — lecture, pas de mutation
        num = brut["num"]
        if num in vus:
            continue
        article = kg.get_article(num)
        if article is None or not article.texte.strip():
            continue
        if article.source.date_fin and article.source.date_fin < jour:
            continue
        vus.add(num)
        articles.append(article)
    articles.sort(key=lambda a: a.num)
    return articles[:limite] if limite else articles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--articles", help="liste de numéros séparés par des virgules (échantillon)")
    parser.add_argument("--limit", type=int, help="ne traiter que les N premiers articles")
    parser.add_argument("--dry-run", action="store_true",
                        help="afficher les cartes sans écrire chunks_legislation.json")
    args = parser.parse_args()

    kg = get_kg()
    numeros = [n.strip() for n in args.articles.split(",")] if args.articles else None
    articles = articles_a_indexer(kg, numeros=numeros, limite=args.limit)
    print(f"{len(articles)} article(s) à traiter.\n")

    cache = charger_cache()
    chunks, sans_carte = [], []

    for i, article in enumerate(articles, 1):
        cle = f"{article.source.id_legiarti}#v{CARTE_VERSION}"
        carte = cache.get(cle)
        origine = "cache"
        if carte is None:
            carte = generer_carte(article)
            origine = "généré"
            if carte:
                cache[cle] = carte
                if i % 10 == 0:
                    sauver_cache(cache)  # points de reprise réguliers

        if carte is None:
            sans_carte.append(article.num)
        chunks.append(construire_chunk(article, carte))

        print(f"[{i}/{len(articles)}] {article.num} ({origine})")
        if carte:
            print(f"    résumé    : {carte['resume']}")
            for q in carte["questions"]:
                print(f"    question  : {q}")

    sauver_cache(cache)

    if args.dry_run:
        print("\n(--dry-run : chunks_legislation.json non écrit)")
        return

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

    print(f"\n{len(chunks)} chunks écrits -> {OUTPUT_FILE}")
    if sans_carte:
        print(f"{len(sans_carte)} article(s) sans carte (indexés sur leur seul texte officiel) : "
              f"{', '.join(sans_carte)}")


if __name__ == "__main__":
    main()
