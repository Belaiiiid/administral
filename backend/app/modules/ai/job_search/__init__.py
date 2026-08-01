"""Job search for France Travail: a free-text prompt turned into search
criteria (Mistral), matched against **real** currently-open offers (the
official France Travail "Offres d'emploi" API — never invented listings),
each optionally scored for relevance (Mistral again). Stateless like the
other `ai.*` modules: no persistence."""
