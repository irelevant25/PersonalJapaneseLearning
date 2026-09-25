---
name: academy-run
description: Start, stop, restart or health-check the Japanese Academy server, either the real one on port 3000 (the owner's database) or a throwaway one with its own database. Use after changing server.php, src/, data/ or the migrations, when a port is busy, or to try something by hand.
---

# Running Japanese Academy

There are two kinds of server. Never mix them up.

| | Real | Throwaway |
|---|---|---|
| Port | 3000 | 3100 (or any free port) |
| Data | the database `japanese_academy` and `backups/`: the owner's | its own database `academy_test_manual`, copied from the test template, and a temp backup folder |
| For | the owner's daily study | trying things by hand: lessons, reviews, exam submits |

Never take lessons, answer reviews or submit exams on the real server. Doing
so changes the owner's progress and history.

**PHP:** on this PC `php` on PATH is 7.4, which can't run the app. The npm
scripts find PHP 8 themselves. By hand, use the full path; below,
`PHP=C:/Users/pastorekf/Documents/php-8.5.10/php.exe`.

## The real server (port 3000)

The owner starts it with `start.ps1` (Windows) or `start.sh`, which also find
PHP, run `setup.php` and open the browser. The server listens on 127.0.0.1
only; host and port come from `src/config.php` (`HOST` / `PORT` override them).

To start it yourself, use the Bash tool with `run_in_background: true`, from
the repository root:

```bash
npm start
```

If it was running when you began, leave it running when you finish. If it
wasn't, stop yours when you're done: `start.ps1` can't start the app while the
port is taken.

At start it checks the database (it must exist and be migrated, or it says
"Run: php setup.php" — do that with `npm run setup`), rebuilds the catalog and
the question bank if `data/` or the generators changed (~3 s), takes the day's
backup, prints the counts, then serves. Check it's answering, and that it is
the real database:

```bash
curl -s 127.0.0.1:3000/api/health; echo; curl -s 127.0.0.1:3000/api/kanji/summary | head -c 200; echo
```

To stop it, use the PowerShell tool (`pkill` can't see Windows processes).
Stopping PHP's web server also ends the `php server.php` (and `npm`) that
started it:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

To restart, stop it, start it, then run the health check.

- **Restart** after changing `server.php`, anything in `src/`, `data/*.json` or
  `data/authored-items*.php`. A new migration needs `npm run setup` first
  (`php setup.php --check` tells you).
- **Don't restart** for `public/**`. Those are static files, so reloading the
  page is enough.

A restart is safe for the data: every answer is a finished transaction. The
owner may be in the middle of a session, though, so keep the downtime short and
say in your final message that you restarted the server. If the question bank
changed, an exam paper started before the restart can't be submitted after it
(409).

"Failed to listen on 127.0.0.1:3000" means something already listens there. To
see what:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess } | Select-Object Id, ProcessName, StartTime
```

A `php` process there is an older copy of this server. Stop it and start again.

## The throwaway server (port 3100, its own database)

Make its database (a copy of the test template, which the first command brings
up to date), then run the server in the background, from the repository root:

```bash
PHP=C:/Users/pastorekf/Documents/php-8.5.10/php.exe
"$PHP" tests/tools/testdb.php template
"$PHP" tests/tools/testdb.php create academy_test_manual
ACADEMY_DB_NAME=academy_test_manual ACADEMY_BACKUPS_DIR="$TEMP/academy-manual" "$PHP" -S 127.0.0.1:3100 -t public server.php
```

`curl -s 127.0.0.1:3100/api/health` must say `"database":"academy_test_manual"`
before you use it. Stop it with the PowerShell snippet above, using port 3100,
then drop its database:

```bash
"$PHP" tests/tools/testdb.php drop academy_test_manual
```

To give it some progress, post to its API from Node. Git Bash `curl` can
mangle Japanese in arguments.

```bash
node -e "(async()=>{for(const id of ['k:一','k:二','k:大'])console.log(id,(await fetch('http://127.0.0.1:3100/api/kanji/learn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})).status)})()"
```

To make its reviews due, change its database (`testdb.php` only ever touches
`academy_test_…` databases):

```bash
"$PHP" tests/tools/testdb.php sql academy_test_manual "UPDATE srs_progress SET next_review = now() - interval '1 minute' WHERE stage BETWEEN 1 AND 8"
```

Never point `ACADEMY_DB_NAME` at `japanese_academy`, and never run a command
that changes a database without it: a PHP process without it uses the real
one.
