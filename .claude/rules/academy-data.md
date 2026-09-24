---
paths:
  - "data/**"
  - "src/build-data.js"
  - "src/build-audio.js"
  - "tools/**"
---

# Study data (Japanese Academy)

Reference: `docs/kb/data-provenance.md` (sources, page maps,
formats). For the edit procedure, use the `academy-data` skill; to see a book page,
use the `academy-pdf` skill.

- `data/*.json` is generated, so never edit it by hand. Edit
  `data/source/*.tsv`, then run `npm run build`. For audio, run
  `npm run build:audio`.
- The TSVs are UTF-8, tab-separated, with no header. Fields per row: vocab 4,
  kanji 7, grammar index 3. Check with
  `awk -F'\t' '{print NF}' <file> | sort | uniq -c`.
- Transcribe what the page prints: readings in hiragana (katakana words in
  katakana), the book's English wording, and `/` between alternatives.
  Don't paraphrase: answers are checked against these glosses.
- The verb-class tags `[u]`, `[ru]` and `[irr.]` in the vocab English field are
  the only source of verb classes, and the conjugation questions depend on them.
- The PDFs in `books/` are gitignored: local only, never commit them. Never
  name the course they belong to anywhere in the repository.
- `data/audio.json` and `data/audio/` come only from `npm run build:audio`
  (Google Cloud Text-to-Speech, needs `GOOGLE_TTS_API_KEY` in `.env`). After a
  word is added or its spelling or reading changes, run it: it voices only
  what is missing and drops unused clips.
- Changing a spelling renames an SRS id, which orphans the owner's progress for
  that item. See the id-rename procedure in the `academy-data` skill.
- After an edit: run `npm run build` and `npm test`, restart the server
  (`academy-run`), then run the `academy-data-auditor` agent on the changed rows.
