---
paths:
  - "public/**"
---

# Front end (Japanese Academy)

- Plain HTML, CSS and JS: no framework, bundler or CDN. The only vendored
  script is wanakana: a copy of the npm package's `wanakana.min.js` in
  `public/vendor/`, with its MIT line on top (to update it, copy the new file
  there and keep that line; the browser suite also loads it for `toRomaji`).
- The kanji trainer is classic scripts sharing `window.KA`, loaded by
  `kanji.html` in this order: wanakana → `kanji/answer.js` → `core.js` →
  `session.js` → `views.js` → `app.js`. A new file needs a `<script>` tag in the
  right place. `answer.js` stays UMD, because Node tests require it.
- In the trainer, build DOM with `KA.h()`. In `exam.js`, data interpolated into
  `innerHTML` goes through `escapeHtml()`.
- Colours come only from the tokens in `css/base.css`, each defined for light
  and `prefers-color-scheme: dark`. Use `--kanji`/`--vocab` for item types and
  the stage tokens for SRS stages. Check contrast in dark mode.
- At 390 px there must be no horizontal scroll; `npm run screens` fails on
  overflow.
- The UI is in English. Dates and times with words use `'en-GB'`, because the
  system locale is Slovak.
- Keys must keep working: Enter submits and continues, F opens item info, and
  ←/→ move through lessons. Reading inputs use the wanakana IME, and a trailing
  `n` turns into ん on submit.
- Static files need no server restart: reload the page.
- After a change, run `npm run test:browser` and the `academy-ui-check` skill, or
  run the `academy-ui-tester` agent. The latter is mandatory before calling the
  work done.
