"""Give the seeded case documents a file to open.

Fills ``case_documents.stored_path`` with a generated placeholder (see
``fixture_files.py`` — every page is stamped « PIÈCE FICTIVE »), so the agent
portal's "Consulter" action has something to show on the fixture dossiers.

Why a separate script rather than re-running the seed: ``scripts/seed.py`` starts
by deleting every case and citizen in the database, which would take real
submitted dossiers with it. This creates no rows and deletes none.

**A real upload is never touched.** A case document counts as a fixture only when
no row in ``application_documents`` matches its case and file name — the same
criterion the ``a7b8c9d0e1f2`` backfill migration used to reconnect the real
ones. A document whose bytes came from a citizen is out of scope by construction,
in both modes below.

Two modes:

* default — fill only where ``stored_path`` is NULL. Idempotent.
* ``--regenerate`` — rewrite the placeholder of every fixture document, for when
  the generator itself changed (a font, a wording) and the files on disk are
  stale.

Run:

    .venv/Scripts/python -m scripts.attach_fixture_files [--regenerate]
"""

from __future__ import annotations

import argparse

from sqlalchemy import text

from app.database.session import SessionLocal
from app.modules.agent.models import Case, CaseDocument
from app.modules.citizen import storage
from scripts.fixture_files import store_placeholder

#: File names that came from a real citizen upload, for the case that received
#: them. Anything in this set is left strictly alone.
_REAL_UPLOADS = text(
    """
    SELECT c.id, ad.file_name
      FROM application_documents AS ad
      JOIN cases AS c ON c.application_number = 'APL-' || ad.application_id
    """
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--regenerate",
        action="store_true",
        help="rewrite existing fixture placeholders (stale generator output)",
    )
    args = parser.parse_args()

    db = SessionLocal()

    try:
        real = {(case_id, file_name) for case_id, file_name in db.execute(_REAL_UPLOADS)}

        rows = (
            db.query(CaseDocument, Case.application_number)
            .join(Case, Case.id == CaseDocument.case_id)
            .all()
        )

        targets = [
            (document, reference)
            for document, reference in rows
            if (document.case_id, document.file_name) not in real
            and (args.regenerate or document.stored_path is None)
        ]

        if not targets:
            print("Rien a faire.")
            return

        for document, reference in targets:
            previous = document.stored_path
            document.stored_path = store_placeholder(
                requirement_label=document.requirement_label,
                file_name=document.file_name,
                reference=reference,
                mime_type=document.mime_type,
            )
            # The superseded placeholder is removed only after the new one is
            # written: a failure mid-run leaves a stale file, never no file.
            if previous and previous != document.stored_path:
                storage.delete(previous)

            # ASCII only: the Windows console is cp1252, and a UnicodeEncodeError
            # in the progress line would abort the run before the commit.
            print(f"  [{reference}] {document.file_name} -> {document.stored_path}")

        db.commit()
        verb = "regeneree" if args.regenerate else "rattachee"
        print(f"{len(targets)} piece(s) {verb}(s). Aucune piece reelle touchee.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
