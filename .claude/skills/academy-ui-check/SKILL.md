---
name: academy-ui-check
description: Visually check the Japanese Academy pages. Screenshot every main screen in light, dark and phone layouts, open the PNGs and go through a checklist. Use after editing anything in public/ (HTML, CSS, front-end JS) or when the owner reports something looks wrong.
---

# Checking the UI

## 1. Take the screenshots

```bash
npm run screens              # from the repository root
npm run screens -- kanji     # only screens whose name contains "kanji"
```

The script runs the real server on a throwaway database and seeds some
progress, so every screen has content: 一, 二, 大, 学 and 大学 are learned, and
大 and 学 are due. It then
drives Edge and writes
`tests/browser/shots/screen-<name>-<light|dark|phone>.png`.

| Screen | Name |
|---|---|
| home | `home` |
| kanji dashboard | `kanji-dashboard` |
| lessons picker | `kanji-lessons` |
| a lesson | `kanji-lesson-screen` |
| review session | `kanji-review` |
| practice setup | `kanji-practice` |
| browse | `kanji-browse` |
| item page (大) | `kanji-item` |
| exam setup | `exam` |

It fails on horizontal overflow or any page error. That catches layout breaks,
but not ugliness, so look at the images as well.

For flows (typing answers, sessions, exam) run `npm run test:browser` as well.
Its screenshots land in the same folder.

## 2. Look at them

Open every screen the change could affect with the Read tool, in all three
variants. Always include the phone shot. Go through this list:

- **Layout.** Nothing overlaps, is cut off or is misaligned. Spacing matches the
  neighbouring elements. Cards and grids wrap cleanly.
- **Phone (390 px).** No sideways scroll. Buttons are at least ~40 px tall.
  Long English meanings and long Japanese words wrap instead of clipping. The
  nav still fits.
- **Dark mode.** Text, links, chips, stage colours and the kanji (`--kanji`) and
  vocabulary (`--vocab`) tiles are all readable. No white boxes left from
  light-mode colours. Bars and badges can still be told apart.
- **Japanese text.** It renders (no boxes or tofu). The kanji are large enough
  to read the strokes, and readings sit where they belong.
- **Language.** All English, with no Slovak dates or weekdays (for example
  "pi", "so", "ne"). Numbers and numeric dates follow the system locale on
  purpose ("11 481", "22. 9. 2026"; see `docs/kb/decisions.md`). Plurals read
  naturally ("1 review", not "1 reviews"). Some older "(s)" labels, such as
  "attempt(s)", are known.
- **States.** Empty states say what to do next. Counts on the dashboard agree
  with the seeded data: 5 learned, 2 due.
- **Consistency.** Same buttons, colours and headings as the other pages. Use
  only colour tokens from `css/base.css`.

## 3. Report

For each problem, give the screenshot file, what is wrong, where it comes from
(file and selector, if you found it) and the fix you'd make. Say which screens
you checked and that the rest looked right. Don't just say "looks fine": name
what you verified.
