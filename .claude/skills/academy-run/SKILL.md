---
name: academy-run
description: Start, stop, restart or health-check the Japanese Academy server, either the real one on port 3000 (the owner's data) or a throwaway one with temp data. Use after changing server.js, src/ or data/, when a port is busy, or to try something by hand.
---

# Running Japanese Academy

There are two kinds of server. Never mix them up.

| | Real | Throwaway |
|---|---|---|
| Port | 3000 | 3100 (or any free port) |
| Data | `progress/`, `results/`, `reports/`: the owner's | new temp folders |
| For | the owner's daily study | trying things by hand: lessons, reviews, exam submits |

Never take lessons, answer reviews or submit exams on the real server. Doing
so changes the owner's progress and history.

## The real server (port 3000)

The owner starts it with `start.ps1` (Windows) or `start.sh`, which also check
Node and open the browser. Both servers listen on 127.0.0.1 only; host and
port come from `config` in `package.json` (`HOST` / `PORT` override them).

To start it yourself, use the Bash tool with `run_in_background: true`, from
the repository root:

```bash
npm start
```

If it was running when you began, leave it running when you finish. If it
wasn't, stop yours when you're done: `start.ps1` can't start the app while the
port is taken.

It builds the question bank at start-up, which takes a few seconds, then prints
the kanji, exam and audio counts. Check it's answering:

```bash
curl -s 127.0.0.1:3000/api/meta | head -c 200; echo; curl -s 127.0.0.1:3000/api/kanji/summary | head -c 200
```

To stop it, use the PowerShell tool (`pkill` can't see Windows processes):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

To restart, stop it, start it, then run the health check.

- **Restart** after changing `server.js`, anything in `src/`, `data/*.json` or
  `data/authored-items*.js`. All of these are read once, at start-up.
- **Don't restart** for `public/**`. Those are static files, so reloading the
  page is enough.

A restart is safe for the data, because every save is atomic and immediate. The
owner may be in the middle of a session, though, so keep the downtime short and
say in your final message that you restarted the server. If the question bank
changed, an exam paper started before the restart can't be submitted after it
(409).

`EADDRINUSE` means something is already listening on the port. To see what:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess } | Select-Object Id, ProcessName, StartTime
```

A `node` process there is an older copy of this server. Stop it and start again.

## The throwaway server (port 3100, temp data)

Run this in the background, from the repository root:

```bash
node -e "const d=require('./tests/helpers').isolate('academy-manual'); require('./server').listen(3100, '127.0.0.1', () => console.log('throwaway on :3100, data in', d))"
```

How it works:

- `isolate()` points all three data folders at a new temp folder before any
  app module loads.
- `require('./server')` returns the app without listening, so the script
  starts it on 3100 itself.

Stop it with the PowerShell snippet above, using port 3100.

To give it some progress, post to its API from Node. Git Bash `curl` can
mangle Japanese in arguments.

```bash
node -e "(async()=>{for(const id of ['k:一','k:二','k:大'])console.log(id,(await fetch('http://127.0.0.1:3100/api/kanji/learn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})).status)})()"
```

Making reviews due requires editing the store inside the server's own process.
For screens that need due reviews, `tests/browser/screens.js` already seeds
that state in-process. Reuse its approach rather than building your own.
