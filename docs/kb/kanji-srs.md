# Kanji SRS

A WaniKani-style trainer with the time locks removed. Code: `src/srs/` (server)
and `public/kanji/` (browser).

## Items — `src/srs/catalog.js`

Built at start-up from `data/kanji.json`, `data/vocab.json`, `data/audio.json`.

- **Kanji** (316): every kanji of the course except 々. Id `k:<kanji>`.
  Accepted readings = every on/kun reading **plus** the dictionary form of words
  that are the kanji + okurigana only (食 accepts しょく, た, たべる).
- **Vocabulary** (1,057): words from the vocabulary lists and the kanji-list
  compounds written only with the course's kanji + kana. Id `v:<word>`. Same
  word from both sources → one item (meanings and readings merged). Spelling
  variants with the same kanji and reading → one item (the vocabulary-list
  spelling wins).
- `lesson` = the item's level: a kanji's course lesson; a word's **latest**
  kanji's lesson (大学 → 6, not 1). `courseLesson` = where the word first
  appears in the lists.
- `order` = course order: lesson by lesson, kanji first (list number), then
  vocabulary. "Next lessons" walks this order.
- **Availability**: kanji always; vocabulary once all its kanji are learned.
  Enforced by the server (`POST /learn` → 409) and mirrored in `KA.isAvailable`.
- **Audio**: every vocabulary item has `audio: [female, male]`, the clip names
  of `src/speech.js`'s `clipsFor()`, spoken with the item's first reading.
  Kanji items have none (a kanji has several readings).

Changing catalog rules can rename or remove ids — see the warning in
[data-provenance.md](data-provenance.md).

## Schedule — `src/srs/srs.js` (WaniKani's, exactly)

| Stage | Name | Next review |
|---|---|---|
| 1–4 | Apprentice I–IV | 4 h · 8 h · 23 h · 47 h |
| 5–6 | Guru I–II | 167 h · 335 h |
| 7 | Master | 719 h |
| 8 | Enlightened | 2879 h |
| 9 | Burned | never |

Review times are rounded down to the local hour (hence 23 h, not 24).
Clean review: +1 stage. With `w` wrong answers (meaning + reading):
`stage − ceil(w/2) × (2 if stage ≥ 5 else 1)`, never below 1.

## The user's modifications (requirements, 2026-09-23)

- **Unlimited lessons.** Batches of 5 by default (3/10/any 1–20 via settings),
  as many batches as wanted, no daily cap, no level gating.
- **Unlimited practice** of anything learned. `srs.practice()` records its own
  counters (`practice.correct/incorrect`, `lastWrongAt`) and **never changes
  `stage` or `nextReview`**. Tests assert this — keep it that way.
- **Reviews** are the only thing that moves stages, and only for due items
  (`POST /review` on a non-due item → 409, which also blocks double submits).

## API — `src/srs/routes.js` (mounted at `/api/kanji`)

| | |
|---|---|
| `GET /catalog` | all items + stage and group definitions |
| `GET /progress` | `{settings, items, summary}` — `summary` = due, available, groups, forecast, per-lesson, today, 14-day history |
| `GET /summary` | summary only (home page) |
| `POST /learn {id}` | lesson quiz passed → Apprentice I |
| `POST /review {id, meaningWrong, readingWrong}` | → `{state, from, to}` |
| `POST /practice {id, firstTryCorrect, wrong}` | practice statistics only |
| `POST /item {id, notes?, addSynonym?, removeSynonym?, addReading?, removeReading?}` | the learner's notes and accepted answers |
| `POST /settings {batchSize?, lessonTypes?, autoplay?}` | validated and clamped |
| `POST /reset-item {id}` · `POST /reset {confirm:"RESET"}` | reset keeps notes; full reset is backed up first |
| `GET /export` | download `progress/kanji.json` |

## Storage — `src/srs/store.js`

`progress/kanji.json` (in memory while the server runs; loaded once).

- **Saving.** Every save writes `kanji.json.tmp` and renames it over the file,
  retrying for up to 0.9 s if Windows holds a file (virus scanner). If the
  rename still fails, the save copies over the file instead; see
  [decisions.md](decisions.md).
- **Daily backup.** Taken at **start-up**, because `server.js` loads the store
  before it listens. If the server is still running past midnight, the new
  day's first save also writes one, in the background and from memory. No
  backup ever runs inside a lesson, review or practice request. A folder
  without progress yet has nothing to back up.
- **Answer log.** Every answer is also appended to `kanji-log.jsonl`.
- **Unreadable file.** An unreadable progress file is moved aside
  (`.unreadable-<time>`), never overwritten.

Because the store is loaded once, **edit `progress/kanji.json` only while the
server is stopped** — otherwise the next save overwrites your edit.

## Answer checking — `public/kanji/answer.js`

- **Meaning**: lowercase; apostrophes and punctuation dropped; leading
  to/be/the/a/an removed; number words = digits ("300" = "three hundred");
  `;`/`,` split alternatives (not inside parentheses); a `/` offers per-word
  alternatives ("two vehicles/machines"); every parenthesised group is optional
  on its own, and `/` inside one is a choice.
- **Typos** are forgiven by length (0 edits for ≤3 letters, 1 for ≤5, 2 for ≤8,
  3 beyond; a swap of two letters is one edit) — **unless** the typed answer is
  exactly another item's meaning ("night" for 右). Numbers are never forgiven.
- **Reading**: hiragana = katakana; a katakana long vowel may be typed out
  (サービス = さあびす). No typo tolerance. Kana typed into the meaning box, or
  leftover romaji/kanji in the reading box, is *invalid* (the card shakes, no
  penalty).
- Learner synonyms / extra readings (from "My answer was right" or the item
  page) are accepted like printed answers.

## Browser flow — `public/kanji/session.js`

Meaning then reading, back to back. A miss shows the answer and re-queues that
half 2–4 cards later; an item completes when both halves are right, and the
misses are what the schedule sees. Completing an item **saves in the
background** (the next card never waits for the disk); the summary waits for all
saves. Reading input is bound to wanakana (IME mode): a trailing `n` stays `n`
until Enter, when `toKana` turns it into ん — expected behaviour.

A batch, its quiz and the summary draw over the screen they started from; the
address doesn't change (a batch started on the dashboard stays at `#/`). Nav
links still work because `app.js` routes a click on a link to the current
address by hand. If the learner leaves while the last answers are still
saving, the saves still land, but the summary is not drawn over the new screen
(guards in `finish()` in `session.js` and in `V.summary`).

Keys: Enter submit / continue · F item info · lessons ←/→ or Enter.

## Audio — `src/speech.js`, `src/build-audio.js`

`npm run build:audio` voices every word of `data/vocab.json` and every SRS
vocabulary item with Google Cloud Text-to-Speech, in two voices: female
`ja-JP-Neural2-B` and male `ja-JP-Neural2-C`.

- **What is spoken** (`spoken()` in `src/speech.js`, shared by the builder,
  the catalog and the exam): the first spelling, without notes, punctuation and
  optional endings (いじわる(な) → いじわる, 妹(さん) → 妹); brackets inside a
  word stay part of it (ほ(う)っておく → ほうっておく), and a phrase is spoken whole
  (かける(かぎを) → かぎをかける). A kanji word is sent as
  SSML with its reading as yomigana, so 今日 can't come out as こんにち — checked
  against the real service: 明日 with あす and with みょうにち give clips as long
  as plain あす and plain みょうにち. Suffixes and patterns (〜円) and words with
  letters in the reading (交通系ICカード) get no audio.
- **Clips** are MP3 files in `data/audio/` under random 16-hex names, listed in
  `data/audio.json` by `"<text>|<reading>"`. A listening question's clip name
  therefore gives nothing away. The clips are in git.
- **Rebuilds** only send what is missing. Each clip is stamped with the recipe
  and voice that made it (`made` in `audio.json`), so a new word, a changed
  spelling or reading, or a changed voice or `RECIPE` remakes exactly those
  clips, even after a partial run. After a complete run, clips nothing uses any
  more are deleted. `--dry-run` counts the characters without a key; `--limit N`
  makes at most N.
- **Failures**: requests are paced (10 a second) under Google's per-minute
  quota, and a 429 waits for the minute to turn. The index is saved every 100
  clips and at the end, also after a failure or Ctrl+C, and nothing is deleted
  then. A word Google refuses (400) is skipped and listed; the rest go on. An
  unreadable `audio.json` stops the build instead of remaking and deleting
  everything.
- **The key**: `GOOGLE_TTS_API_KEY` in the environment or in the gitignored
  `.env` (README). It is sent in a header, never in a URL, and never printed.
- **In the browser** (`KA.play` in `core.js`): the voices take turns, so every
  word is heard from both over time.
