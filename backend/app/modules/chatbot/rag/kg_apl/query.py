"""Étape 5 — Couche de requête : l'interface entre le graphe et le chatbot.

Trois fonctions, plus une composition pour le cas d'usage n°1 (lettre de refus).

RÈGLES DE SÛRETÉ appliquées ici (KG_APL_decisions.md §9) :
  - **Aucune valeur juridique en dur** dans ce module : ni délai, ni seuil, ni montant,
    ni numéro d'article. Tout vient du graphe.
  - **Toute réponse porte sa source** : identifiant `LEGIARTI` + date de version. C'est le
    rôle du type `Source`, présent dans chaque résultat retourné.
  - **Par défaut, « en vigueur aujourd'hui »**. Une version antérieure n'est retournée que
    si une date est explicitement demandée.
  - **Aucun calcul de montant d'APL**, nulle part.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

# Relations issues de la projection de l'étape 3, parcourues par `expand`.
# (Noms de relations du graphe, pas des valeurs juridiques.)
RELATIONS_EXPANSIBLES = ["CITE", "APPLIQUE", "CONCORDE_AVEC", "MODIFIE", "ABROGE", "CREE"]

# Références d'articles dans un texte administratif : "L. 822-2", "L.822-2", "L 822-2",
# "L822-2", "R. 351-17-2", "D. 822-21". Le groupe de chiffres exige au moins un tiret,
# ce qui évite d'attraper "Loi n° 89-462" ou un simple numéro d'alinéa.
MOTIF_REFERENCE = re.compile(r"\b([LRD])\.?\s?\s*(\d+(?:-\d+)+)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Source:
    """La provenance d'une réponse. Obligatoire sur tout résultat (règle de sûreté n°2)."""
    id_legiarti: str
    date_debut: date | None
    date_fin: date | None
    etat: str

    @property
    def toujours_en_vigueur(self) -> bool:
        """`date_fin` est une date haute (et non NULL) pour rester indexable : voir
        `kg_apl.load_neo4j.FIN_OUVERTE`."""
        return self.date_fin is None or self.date_fin.year >= 9999


@dataclass
class ArticleVersion:
    """Un article rendu dans sa version applicable, avec sa source."""
    num: str
    code: str
    texte: str
    source: Source
    nota: str = ""
    chemin: list[str] = field(default_factory=list)   # position dans le plan du code
    hors_perimetre: bool = False                       # ingéré par expansion frontière


@dataclass
class ArticleLie:
    """Un article atteint depuis un autre, avec la nature et le sens du lien."""
    relation: str
    sortant: bool           # True : l'article de départ agit ; False : il subit
    distance: int
    article: ArticleVersion


def _en_date(valeur) -> date | None:
    """Les dates Neo4j remontent en `neo4j.time.Date` ; on les ramène en `datetime.date`."""
    if valeur is None:
        return None
    if isinstance(valeur, date):
        return valeur
    return date(valeur.year, valeur.month, valeur.day)


def _construire(record, prefixe: str = "") -> ArticleVersion:
    def champ(nom):
        return record[f"{prefixe}{nom}"]

    return ArticleVersion(
        num=champ("num"),
        code=champ("code"),
        texte=champ("texte") or "",
        nota=champ("nota") or "",
        source=Source(
            id_legiarti=champ("id_legiarti"),
            date_debut=_en_date(champ("date_debut")),
            date_fin=_en_date(champ("date_fin")),
            etat=champ("etat") or "",
        ),
        chemin=list(champ("chemin") or []),
        hors_perimetre=bool(champ("hors_perimetre")),
    )


# --- extract_references ------------------------------------------------------

def extract_references(texte: str) -> list[str]:
    """Extrait les références d'articles d'un texte (lettre de refus, courrier CAF).

    Normalise vers la forme du graphe : "L. 822-2", "L 822-2" et "L822-2" donnent tous
    `L822-2`. Les doublons sont supprimés, l'ordre d'apparition est conservé.

    Ne dit RIEN du code d'appartenance : "L. 512-2" peut viser le Code de la sécurité
    sociale comme un autre. C'est `get_article(..., code=...)` qui tranche.
    """
    references, vues = [], set()
    for lettre, numero in MOTIF_REFERENCE.findall(texte or ""):
        reference = f"{lettre.upper()}{numero}"
        if reference not in vues:
            vues.add(reference)
            references.append(reference)
    return references


# --- get_article -------------------------------------------------------------

_REQUETE_ARTICLE = """
MATCH (a:Article {num: $num})-[:A_VERSION]->(v:Version)
WHERE v.date_debut <= date($d) AND date($d) < v.date_fin
  AND ($code IS NULL OR a.code = $code)
OPTIONAL MATCH chemin = (c:Code)-[:CONTIENT*]->(a)
RETURN a.num AS num, a.code AS code, v.texte AS texte, v.nota AS nota,
       v.id_legiarti AS id_legiarti, v.date_debut AS date_debut,
       v.date_fin AS date_fin, v.etat AS etat,
       [n IN nodes(chemin) | coalesce(n.titre, n.num)] AS chemin,
       a:Frontiere AS hors_perimetre
ORDER BY hors_perimetre ASC
"""


def get_article(session, num: str, date_reference: date | None = None,
                code: str | None = None) -> ArticleVersion | None:
    """L'article `num` dans sa version applicable à `date_reference`.

    Par défaut : la version en vigueur AUJOURD'HUI (règle de sûreté n°3). Une version
    antérieure n'est retournée que si une date est explicitement passée — typiquement
    la date de la décision contestée par l'usager.

    Retourne None si l'article n'existe pas, ou n'existait pas encore à cette date.
    Si plusieurs codes portent le même numéro d'article, préciser `code` ; à défaut,
    les articles du périmètre d'origine passent avant ceux issus de l'expansion.
    """
    jour = date_reference or date.today()
    record = session.run(
        _REQUETE_ARTICLE, num=num, d=jour.isoformat(), code=code
    ).peek()
    return _construire(record) if record else None


def get_versions(session, num: str, code: str | None = None) -> list[ArticleVersion]:
    """Toutes les versions connues d'un article, du plus ancien au plus récent.

    Utile pour montrer à un agent CAF l'évolution d'un article ; le chatbot citoyen,
    lui, ne doit exposer qu'une version à la fois (règle de sûreté n°3).
    """
    resultats = session.run(
        """
        MATCH (a:Article {num: $num})-[:A_VERSION]->(v:Version)
        WHERE ($code IS NULL OR a.code = $code)
        OPTIONAL MATCH chemin = (c:Code)-[:CONTIENT*]->(a)
        RETURN a.num AS num, a.code AS code, v.texte AS texte, v.nota AS nota,
               v.id_legiarti AS id_legiarti, v.date_debut AS date_debut,
               v.date_fin AS date_fin, v.etat AS etat,
               [n IN nodes(chemin) | coalesce(n.titre, n.num)] AS chemin,
               a:Frontiere AS hors_perimetre
        ORDER BY v.date_debut
        """,
        num=num, code=code,
    )
    return [_construire(r) for r in resultats]


# --- expand ------------------------------------------------------------------

def expand(session, num: str, hops: int = 1, date_reference: date | None = None,
           code: str | None = None, relations: list[str] | None = None) -> list[ArticleLie]:
    """Les articles liés à `num`, avec le type et le sens de la relation.

    `hops=1` par défaut, conformément à la règle du saut unique. Les cibles sont rendues
    dans leur version applicable à `date_reference` (aujourd'hui par défaut) : un article
    lié doit être daté comme l'article de départ, sinon la réponse mélange les époques.

    Une cible sans version applicable (article cité mais pas encore ingéré, ou pas encore
    en vigueur à cette date) est omise plutôt que rendue vide.
    """
    if hops < 1:
        raise ValueError("hops doit valoir au moins 1")
    jour = date_reference or date.today()

    # On restreint aux types réellement présents en base : demander un type absent
    # (ex. APPLIQUE tant qu'aucun lien SPEC_APPLI n'est chargé) déclenche un
    # avertissement Neo4j à chaque appel.
    demandes = relations or RELATIONS_EXPANSIBLES
    existants = {r["relationshipType"] for r in session.run("CALL db.relationshipTypes()")}
    types = "|".join(t for t in demandes if t in existants)
    if not types:
        return []

    # La borne d'un chemin de longueur variable ne peut pas être un paramètre Cypher :
    # elle est donc interpolée, après validation que `hops` est bien un entier.
    motif = f"[:{types}*1..{int(hops)}]"

    resultats = session.run(
        f"""
        MATCH (depart:Article {{num: $num}})-[:A_VERSION]->(vd:Version)
        WHERE vd.date_debut <= date($d) AND date($d) < vd.date_fin
          AND ($code IS NULL OR depart.code = $code)
        MATCH chemin = (vd)-{motif}-(cible:Article)
        WHERE cible <> depart
        MATCH (cible)-[:A_VERSION]->(v:Version)
        WHERE v.date_debut <= date($d) AND date($d) < v.date_fin
        WITH vd, cible, v,
             relationships(chemin) AS liens,
             length(chemin) AS distance
        WITH cible, v, distance,
             type(liens[0]) AS relation,
             startNode(liens[0]) = vd AS sortant
        OPTIONAL MATCH plan = (c:Code)-[:CONTIENT*]->(cible)
        RETURN DISTINCT relation, sortant, distance,
               cible.num AS num, cible.code AS code, v.texte AS texte, v.nota AS nota,
               v.id_legiarti AS id_legiarti, v.date_debut AS date_debut,
               v.date_fin AS date_fin, v.etat AS etat,
               [n IN nodes(plan) | coalesce(n.titre, n.num)] AS chemin,
               cible:Frontiere AS hors_perimetre
        ORDER BY distance, relation, num
        """,
        num=num, d=jour.isoformat(), code=code,
    )

    return [
        ArticleLie(
            relation=r["relation"],
            sortant=bool(r["sortant"]),
            distance=r["distance"],
            article=_construire(r),
        )
        for r in resultats
    ]


# --- Cas d'usage n°1 : lettre de refus ---------------------------------------

def articles_correspondants(session, num: str) -> list[ArticleVersion]:
    """Les articles actuels correspondant à une référence en ANCIENNE numérotation.

    Répond au piège signalé par `KG_APL_decisions.md` §3 : le Livre VIII résulte de
    l'ordonnance n°2019-770, et beaucoup de courriers (comme de contenus web) citent
    encore les `L351-x`. Ces articles sont abrogés : ils n'ont aucune version applicable
    aujourd'hui, donc `get_article` ne renvoie rien pour eux — d'où cette résolution
    séparée, qui remonte les liens de concordance.

    La table d'équivalence n'est pas codée en dur : elle vient des liens `CONCORDE_AVEC`
    du dump (décision D4).
    """
    resultats = session.run(
        """
        MATCH (ancien:Article {num: $num})
        MATCH (actuel:Article)-[:A_VERSION]->(:Version)-[:CONCORDE_AVEC]->(ancien)
        MATCH (actuel)-[:A_VERSION]->(v:Version)
        WHERE v.date_debut <= date($d) AND date($d) < v.date_fin
        OPTIONAL MATCH chemin = (c:Code)-[:CONTIENT*]->(actuel)
        RETURN DISTINCT actuel.num AS num, actuel.code AS code, v.texte AS texte,
               v.nota AS nota, v.id_legiarti AS id_legiarti, v.date_debut AS date_debut,
               v.date_fin AS date_fin, v.etat AS etat,
               [n IN nodes(chemin) | coalesce(n.titre, n.num)] AS chemin,
               actuel:Frontiere AS hors_perimetre
        ORDER BY num
        """,
        num=num, d=date.today().isoformat(),
    )
    return [_construire(r) for r in resultats]


@dataclass
class ReferenceResolue:
    reference: str
    article: ArticleVersion | None       # None si absent du graphe, ou abrogé à cette date
    lies: list[ArticleLie] = field(default_factory=list)
    equivalents: list[ArticleVersion] = field(default_factory=list)  # ancienne numérotation

    @property
    def exploitable(self) -> bool:
        return self.article is not None or bool(self.equivalents)


def resoudre_lettre(session, texte: str, date_decision: date | None = None,
                    hops: int = 1) -> list[ReferenceResolue]:
    """Cas d'usage n°1 (KG_APL_decisions.md §7) : de la lettre de refus au fondement juridique.

    Extrait les références citées, puis rend chaque article **dans sa version applicable
    à la date de la décision** — pas celle du jour — et y ajoute le contexte que la lettre
    ne donne pas (article d'application, articles cités).

    Si la référence est en ancienne numérotation (article abrogé, donc sans version
    applicable), on remonte les articles actuels correspondants plutôt que de répondre
    « inconnu » — c'est le cas fréquent des courriers citant les `L351-x`.

    Une référence que le graphe ne connaît ni directement ni par concordance est retournée
    avec `article=None` et `equivalents=[]` : elle ne doit JAMAIS être comblée par une
    reformulation du LLM (règle de sûreté n°1).
    """
    resolues = []
    for reference in extract_references(texte):
        article = get_article(session, reference, date_reference=date_decision)
        lies, equivalents = [], []
        if article:
            lies = expand(session, reference, hops=hops,
                          date_reference=date_decision, code=article.code)
        else:
            equivalents = articles_correspondants(session, reference)
        resolues.append(
            ReferenceResolue(reference=reference, article=article,
                             lies=lies, equivalents=equivalents)
        )
    return resolues
