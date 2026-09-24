# Environment — this machine

Windows 11, Node 22.15, npm 10.9, Edge and Chrome. Claude Code's Bash tool is
**Git Bash**; there is also a PowerShell tool. The repository root is the app
and the usual session start folder (`F:\Repositories\PersonalJapaneseLearning`
on the owner's home PC; the app was first built in
`C:\Users\pastorekf\Documents\temp` on another one). The PDFs are in `books/`.

## Pitfalls met so far, and what works

| Problem | Do this |
|---|---|
| `/tmp` in Git Bash is not the `/tmp` Node sees (Node maps it to `C:\tmp`) | Put scratch files in the session scratchpad or the project, and pass absolute Windows-style paths to Node |
| Large heredocs (`cat <<'EOF'`) containing quotes sometimes fail with "unexpected EOF" | Write files with the Write tool |
| `pkill node` does nothing to Windows processes | `Get-NetTCPConnection -LocalPort <port> -State Listen \| Select -Expand OwningProcess -Unique \| % { Stop-Process -Id $_ -Force }` in PowerShell |
| `sed` with a regex containing `/` silently breaks the expression | Use the Edit tool for code edits |
| Python may be missing (on the first PC, `python` on PATH was the Microsoft Store stub) | Use Node for tools and scripts |
| No poppler, so the Read tool can't render PDF pages | `node tools/pdf/pages.js …` (see data-provenance.md) |
| Windows Defender can hold a just-written file for seconds (a 5 s save once froze the quiz) | Already handled: background saves in the browser, rename retries and start-up backups in `store.js` — don't add synchronous copies to the answer path |
| The system locale is Slovak: `toLocaleDateString([], {weekday:'short'})` gives "pi, so, ne…" | The UI is English: pass `'en-GB'` for anything with words; numeric dates/times may use the locale |
| Playwright wants to download browsers | Use `playwright-core` with the installed Edge (`tests/browser/browser.js`) |
| Opening the same URL in Playwright doesn't reload a hash-routed page | Go to `about:blank` first |
| A trailing `n` in a reading shows as `n` while typing | Normal IME behaviour; `toKana` converts it on submit |
| Browser audio requests come back 206 | Normal (byte ranges) |
| An `academy-*` agent created or edited during a session is "not found" | Agents load when a session starts. Start a new session, or meanwhile run a general-purpose agent told to follow the agent file (`.claude/agents/<name>.md`) and stay read-only |
| `git config core.autocrlf` is `true`: a checkout can turn LF text files into CRLF | Harmless for the app (`build-data.js` splits on `\r?\n`); the files are LF as written. A CR in a TSV after a checkout is that, not a transcription slip |
| `rmdir` says "Device or resource busy" for an empty folder | A tool shell still has its working directory inside it: move that shell out first (e.g. `Set-Location` in PowerShell) |
| Claude Code's sandbox blocks github.com (npm, PyPI, Hugging Face and Google's APIs work) | Don't plan on GitHub downloads; ask the owner to download, or use npm |
| `npm run build:audio` says "No API key" | The key goes in `.env` as `GOOGLE_TTS_API_KEY=…` (gitignored). Never print it or paste it into a message |

## Ports

The real app: 127.0.0.1:3000 (`npm start`, or the owner's `start.ps1`). Use
another port (e.g. 3100) for any manual test server, always with the `ACADEMY_*`
folder overrides — see the `academy-run` skill. The automated suites pick a free
port themselves.
