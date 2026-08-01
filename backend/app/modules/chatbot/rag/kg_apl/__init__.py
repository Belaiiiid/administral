"""Knowledge graph juridique (Code de la construction et de l'habitation, Livre VIII).

Copié tel quel depuis le repo `kg_apl`, qui reste la source de vérité de ces modules
(même logique que `MonParcours` vis-à-vis de ce repo-ci pour le moteur RAG).

UNE SEULE adaptation à re-appliquer à chaque re-copie : dans `kg_local.py`, l'import
`from kg_apl.query import ...` devient `from .query import ...` — l'import relatif
fonctionne aussi bien ici que comme sous-paquet chez MonParcours, ce qui évite une
divergence de plus. Le chemin du fichier de données n'est PAS touché : c'est
l'appelant (`legal_pipeline.py`) qui le résout via `__file__`.

`query.py` embarque aussi une implémentation Neo4j, inutilisée ici : seul `KgLocal`
sert. Le fichier est nécessaire parce qu'il définit les types de retour communs
(`ArticleVersion`, `Source`, ...) et `extract_references`. Aucune dépendance externe :
les deux modules n'utilisent que la bibliothèque standard.
"""
