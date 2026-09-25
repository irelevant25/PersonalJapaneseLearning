# Environment — this machine

Windows 11. The app: PHP 8.5 (`C:\Users\pastorekf\Documents\php-8.5.10`,
with pdo_pgsql, mbstring and intl) and PostgreSQL 18 on **port 5433**
(`C:\Program Files\PostgreSQL\18`; `psql` is not on PATH). The developer tools:
Node 22.15, npm 10.9, Edge and Chrome. Claude Code's Bash tool is **Git
Bash**; there is also a PowerShell tool. The repository root is the app and the
usual session start folder (`F:\Repositories\PersonalJapaneseLearning` on the
owner's home PC; the app was first built in `C:\Users\pastorekf\Documents\temp`
on another one). The PDFs are in `books/`.

## Pitfalls met so far, and what works

| Problem | Do this |
|---|---|
| **`php` on PATH is PHP 7.4** (`C:\Users\pastorekf\Documents\php-7.4.33`, first on PATH, no pdo_pgsql); PHP 8.5 comes second | Use `npm start`, `npm test`, `npm run …`: they find the right PHP (`tools/php.js`). The launchers search the same way. By hand, call `C:/Users/pastorekf/Documents/php-8.5.10/php.exe`, or set `ACADEMY_PHP`. The app says so itself when started with an old PHP |
| VS Code's PHP check uses that 7.4 | The code stays parseable by 7.4 on purpose (no constructor promotion, no `throw` expressions), so it shows no false errors; it still needs 8.1 to run |
| PHP 7.4 prints `Warning: Module 'fileinfo' already loaded` | Harmless noise of that install |
| **A command run without `ACADEMY_DB_NAME` uses your real database** | Any scratch or test command sets `ACADEMY_DB_NAME=academy_test_…` (or uses the test tools, which refuse other names). Never experiment on `japanese_academy` |
| Connecting to PostgreSQL costs 50–70 ms here (the password check) | The web server keeps its connection open (`db()` in `src/db.php`); a CLI script pays it once |
| PHP's curl has no CA certificates on Windows (`unable to get local issuer certificate`) | `src/build-audio.php` uses Windows' own store (`CURLSSLOPT_NATIVE_CA`) |
| PHP's built-in server sends `index.html` for an unknown path | `server.php` answers 404 itself |
| The built-in server logs every request to stderr | Tests send it to a file (a pipe nobody reads would fill up and stall the server) |
| `php -r "…$x…"` in Git Bash: the shell or PHP expands `$` | Write a small script file, or single-quote the PHP code |
| `/tmp` in Git Bash is not the `/tmp` Node sees (Node maps it to `C:\tmp`) | Put scratch files in the session scratchpad or the project, and pass absolute Windows-style paths to Node |
| Large heredocs (`cat <<'EOF'`) containing quotes sometimes fail with "unexpected EOF" | Write files with the Write tool |
| `pkill node` / `pkill php` do nothing to Windows processes | `Get-NetTCPConnection -LocalPort <port> -State Listen \| Select -Expand OwningProcess -Unique \| % { Stop-Process -Id $_ -Force }` in PowerShell |
| `sed` with a regex containing `/` silently breaks the expression | Use the Edit tool for code edits |
| Python may be missing (on the first PC, `python` on PATH was the Microsoft Store stub) | Use PHP or Node for tools and scripts |
| No poppler, so the Read tool can't render PDF pages | `node tools/pdf/pages.js …` (see data-provenance.md) |
| Windows Defender can hold a just-written file for seconds | Backups and `data/audio.json` are written aside and renamed, with retries (`file_put_atomic()` in `src/backup.php`) |
| The system locale is Slovak: `toLocaleDateString([], {weekday:'short'})` gives "pi, so, ne…" | The UI is English: pass `'en-GB'` for anything with words; numeric dates/times may use the locale (the reports do, through ICU in PHP, like the browser) |
| PHP says UTC unless told | `src/bootstrap.php` takes the computer's time zone from ICU (`Europe/Bratislava` here), as the browser does |
| Playwright wants to download browsers | Use `playwright-core` with the installed Edge (`tests/browser/browser.js`) |
| Opening the same URL in Playwright doesn't reload a hash-routed page | Go to `about:blank` first |
| A trailing `n` in a reading shows as `n` while typing | Normal IME behaviour; `toKana` converts it on submit |
| Browser audio requests come back 206 | Normal (byte ranges) |
| An `academy-*` agent created or edited during a session is "not found", or runs its old text | Agents load when a session starts. Start a new session, or meanwhile run a general-purpose agent told to follow the agent file (`.claude/agents/<name>.md`) and stay read-only |
| `git config core.autocrlf` is `true`: a checkout can turn LF text files into CRLF, and a rebuilt `data/*.json` (LF) then shows as modified with no content change | Harmless: `git diff` shows nothing, `git checkout -- data/<file>` clears it. The PHP readers accept CRLF; the build-data test compares without it |
| `rmdir` says "Device or resource busy" for an empty folder | A tool shell still has its working directory inside it: move that shell out first (e.g. `Set-Location` in PowerShell) |
| Claude Code's sandbox blocks github.com (npm, PyPI, Hugging Face and Google's APIs work) | Don't plan on GitHub downloads; ask the owner to download, or use npm |
| `php src/build-audio.php` says "No API key" | The key goes in `.env` as `GOOGLE_TTS_API_KEY=…` (gitignored). Never print it or paste it into a message |

## Ports

The real app: 127.0.0.1:3000 (`npm start`, `php server.php`, or the owner's
`start.ps1`). Use another port (e.g. 3100) for any manual test server, always
with a throwaway database — see the `academy-run` skill. The automated suites
pick a free port themselves. PostgreSQL: localhost:5433.
