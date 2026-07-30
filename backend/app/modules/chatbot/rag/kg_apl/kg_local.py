"""Lecture du graphe depuis le fichier exporté — la version destinée au chatbot.

Expose **exactement la même API** que `kg_apl.query` (la version Neo4j), avec les mêmes
types de retour. Le chatbot appelle les mêmes fonctions dans les deux cas ; basculer de
l'un à l'autre ne demande aucune réécriture.

Différence : ici, aucune base de données. Le fichier est chargé une fois au démarrage,
puis tout se joue en mémoire.

    from kg_apl.kg_local import KgLocal

    kg = KgLocal("data/export/kg_apl.json.gz")       # une seule fois au démarrage
    article = kg.get_article("L822-2")
    article_2022 = kg.get_article("L822-4", date_reference=date(2022, 6, 1))
    kg.resoudre_lettre(texte_de_la_lettre, date_decision=date(2024, 3, 15))

Les règles de sûreté sont identiques à `kg_apl.query` : toute réponse porte sa source
(`LEGIARTI` + date de version), le défaut est « en vigueur aujourd'hui », et une référence
inconnue est signalée comme telle plutôt que comblée.
"""
from __future__ import annotations

import gzip
import json
from collections import deque
from datetime import date
from pathlib import Path

# Import relatif (seule adaptation par rapport au repo kg_apl, voir __init__.py) :
# fonctionne à l'identique ici et comme sous-paquet chez MonParcours.
from .query import (
    RELATIONS_EXPANSIBLES,
    ArticleLie,
    ArticleVersion,
    ReferenceResolue,
    Source,
    extract_references,
)

DEFAULT_CHEMIN = Path("data/export/kg_apl.json.gz")


def _date(valeur: str | None) -> date | None:
    return date.fromisoformat(valeur) if valeur else None


class KgLocal:
    """Le graphe chargé en mémoire depuis le fichier exporté."""

    def __init__(self, chemin: str | Path = DEFAULT_CHEMIN) -> None:
        chemin = Path(chemin)
        if not chemin.exists():
            raise FileNotFoundError(
                f"Fichier du graphe introuvable : {chemin}. "
                "Le générer avec `python -m kg_apl.export_statique`."
            )

        if chemin.suffix == ".gz":
            with gzip.open(chemin, "rt", encoding="utf-8") as f:
                donnees = json.load(f)
        else:
            donnees = json.loads(chemin.read_text(encoding="utf-8"))

        self.meta: dict = donnees["meta"]
        self._articles: dict[str, dict] = donnees["articles"]
        self._index_num: dict[str, list[str]] = donnees["index_num"]
        self._concordance: dict[str, list[str]] = donnees["concordance"]

    # --- Recherche interne ---------------------------------------------------

    def _identifiants(self, num: str, code: str | None = None) -> list[str]:
        """Les articles portant ce numéro. Un même numéro existe dans plusieurs codes,
        d'où le filtre optionnel ; à défaut, les articles du périmètre d'origine
        passent avant ceux ajoutés par expansion."""
        identifiants = self._index_num.get(num, [])
        if code:
            identifiants = [i for i in identifiants if self._articles[i]["code"] == code]
        return sorted(identifiants, key=lambda i: self._articles[i]["hors_perimetre"])

    def _version_applicable(self, identifiant: str, jour: date) -> dict | None:
        for v in self._articles[identifiant]["versions"]:
            debut, fin = _date(v["debut"]), _date(v["fin"])
            if (debut is None or debut <= jour) and (fin is None or jour < fin):
                return v
        return None

    def _construire(self, identifiant: str, version: dict) -> ArticleVersion:
        article = self._articles[identifiant]
        return ArticleVersion(
            num=article["num"],
            code=article["code"],
            texte=version["texte"],
            nota=version["nota"],
            source=Source(
                id_legiarti=version["id"],
                date_debut=_date(version["debut"]),
                date_fin=_date(version["fin"]),
                etat=version["etat"],
            ),
            chemin=list(article["chemin"]),
            hors_perimetre=article["hors_perimetre"],
        )

    # --- API publique --------------------------------------------------------

    @staticmethod
    def extract_references(texte: str) -> list[str]:
        """Identique à `kg_apl.query.extract_references` : c'est la même fonction."""
        return extract_references(texte)

    def get_article(self, num: str, date_reference: date | None = None,
                    code: str | None = None) -> ArticleVersion | None:
        """L'article dans sa version applicable à `date_reference`.

        Par défaut : la version en vigueur AUJOURD'HUI. Une version antérieure n'est
        retournée que si une date est explicitement demandée.
        """
        jour = date_reference or date.today()
        for identifiant in self._identifiants(num, code):
            version = self._version_applicable(identifiant, jour)
            if version:
                return self._construire(identifiant, version)
        return None

    def get_versions(self, num: str, code: str | None = None) -> list[ArticleVersion]:
        """Toutes les versions connues, du plus ancien au plus récent."""
        resultats = []
        for identifiant in self._identifiants(num, code):
            for version in self._articles[identifiant]["versions"]:
                resultats.append(self._construire(identifiant, version))
        return sorted(resultats, key=lambda a: a.source.date_debut or date.min)

    def expand(self, num: str, hops: int = 1, date_reference: date | None = None,
               code: str | None = None, relations: list[str] | None = None) -> list[ArticleLie]:
        """Les articles liés, avec le type et le sens de la relation.

        Parcours en largeur sur les liens précalculés : `hops > 1` fonctionne donc aussi,
        alors même qu'il n'y a plus de moteur de graphe.

        Les cibles sont rendues dans leur version applicable à la même date que l'article
        de départ. Une cible sans version applicable (article cité dont le texte n'a pas
        pu être récupéré, ou pas encore en vigueur à cette date) est **omise** plutôt que
        rendue vide.
        """
        if hops < 1:
            raise ValueError("hops doit valoir au moins 1")
        jour = date_reference or date.today()
        types = set(relations or RELATIONS_EXPANSIBLES)

        departs = self._identifiants(num, code)
        if not departs:
            return []
        depart = departs[0]

        resultats: list[ArticleLie] = []
        vus = {depart}
        file = deque([(depart, 0, None, None)])

        while file:
            courant, distance, premiere_relation, premier_sens = file.popleft()
            if distance >= hops:
                continue

            for lien in self._articles[courant]["liens"]:
                if lien["relation"] not in types:
                    continue
                cible = lien["cible"]
                if cible in vus or cible not in self._articles:
                    continue
                vus.add(cible)

                # On conserve la relation du PREMIER saut : c'est elle qui décrit le
                # rapport de l'article de départ avec ce qu'on a atteint.
                relation = premiere_relation or lien["relation"]
                sortant = premier_sens if premier_sens is not None else lien["sortant"]

                version = self._version_applicable(cible, jour)
                if version:
                    resultats.append(ArticleLie(
                        relation=relation,
                        sortant=bool(sortant),
                        distance=distance + 1,
                        article=self._construire(cible, version),
                    ))
                file.append((cible, distance + 1, relation, sortant))

        return sorted(resultats, key=lambda l: (l.distance, l.relation, l.article.num))

    def articles_correspondants(self, num: str) -> list[ArticleVersion]:
        """Les articles actuels correspondant à une référence en ANCIENNE numérotation.

        Une renumérotation a eu lieu en 2019 : les anciens articles sont abrogés et n'ont
        donc aucune version applicable aujourd'hui. `get_article` ne peut rien en dire —
        d'où cette résolution séparée, qui s'appuie sur la table de concordance issue des
        données officielles.
        """
        jour = date.today()
        resultats = []
        for identifiant in self._concordance.get(num, []):
            if identifiant not in self._articles:
                continue
            version = self._version_applicable(identifiant, jour)
            if version:
                resultats.append(self._construire(identifiant, version))
        return sorted(resultats, key=lambda a: a.num)

    def resoudre_lettre(self, texte: str, date_decision: date | None = None,
                        hops: int = 1) -> list[ReferenceResolue]:
        """De la lettre de refus au fondement juridique.

        Extrait les références citées, puis rend chaque article dans sa version applicable
        **à la date de la décision** — pas celle du jour — avec le contexte que la lettre
        ne donne pas.

        Si la référence est en ancienne numérotation, on remonte les articles actuels
        correspondants. Une référence que le graphe ne connaît ni directement ni par
        concordance ressort avec `exploitable = False` : elle ne doit jamais être comblée
        par une reformulation du LLM.
        """
        resolues = []
        for reference in extract_references(texte):
            article = self.get_article(reference, date_reference=date_decision)
            lies, equivalents = [], []
            if article:
                lies = self.expand(reference, hops=hops,
                                   date_reference=date_decision, code=article.code)
            else:
                equivalents = self.articles_correspondants(reference)
            resolues.append(ReferenceResolue(reference=reference, article=article,
                                             lies=lies, equivalents=equivalents))
        return resolues
