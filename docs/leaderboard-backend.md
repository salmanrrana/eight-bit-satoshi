# Leaderboard Backend

Public leaderboards need shared storage, and a static browser game has none on its
own (`localStorage` is per-device). This is the smallest backend that fills that
gap: a **dependency-free Node HTTP service** that persists entries to a JSON file
and serves ranked rows. It implements [`leaderboard-contract.md`](leaderboard-contract.md)
through the shared rules module [`js/leaderboard-rules.js`](../js/leaderboard-rules.js)
— the *same* module the browser loads, so validation and ranking can never drift
between client and server.

## Why this approach

- **Static-friendly.** The game stays a pile of static files (HTML/CSS/JS) served
  by anything. Only the leaderboard talks to a server, over two HTTP endpoints.
- **Zero dependencies.** Node built-ins only (`http`, `fs`, `crypto`), matching
  the rest of the project. Nothing to `npm install`.
- **Swappable.** The two endpoints are the contract. If the JSON file outgrows its
  welcome, put a managed datastore (Supabase, Firestore, a hosted Postgres) behind
  the same routes without touching the front-end — see [Swapping the datastore](#swapping-the-datastore).

## Endpoints

| Method | Path                                                                | Purpose                         |
| ------ | ------------------------------------------------------------------- | ------------------------------- |
| `GET`  | `/api/health`                                                       | Liveness probe.                 |
| `GET`  | `/api/leaderboard?levelId&category&gameVersion&rulesVersion[&limit]` | Ranked rows for one board.      |
| `POST` | `/api/leaderboard`                                                   | Submit a completed run.         |

All four board-identifying params (`levelId`, `category`, `gameVersion`,
`rulesVersion`) are **required** on read, so runs from different builds or rulesets
are never mixed (contract §6).

A `POST` body is a full submission: the run payload from `buildSubmission()` plus
the envelope `{ playerName, clientTimestamp }`. Responses:

- `201 { ok: true, duplicate: false, entry }` — stored. `entry` carries the
  server-assigned `id` and `serverTimestamp`.
- `200 { ok: true, duplicate: true, entry }` — an identical run by the same player
  on the same board already exists; the existing row is returned. This makes
  accidental double-submits idempotent.
- `400 { ok: false, error, details }` — validation failed; `details` lists each
  problem.
- `413` / `500` — body too large / unexpected server failure.

## Local development

The static game and the API run as two processes.

```bash
# Terminal 1 — the game (static files)
npm start                 # http://127.0.0.1:5000/

# Terminal 2 — the leaderboard API
npm run server            # http://127.0.0.1:5050/
```

The browser client (`js/leaderboard-client.js`) defaults to `:5050` on the same
hostname, so no extra configuration is needed in dev.

Smoke-test the API directly:

```bash
curl -s http://127.0.0.1:5050/api/health

curl -s -X POST http://127.0.0.1:5050/api/leaderboard \
  -H 'Content-Type: application/json' \
  -d '{"levelId":"whitepaper-run","level":"THE WHITEPAPER RUN","gameVersion":"1.0.0",
       "rulesVersion":1,"category":"ANY%","time":92.47,"deaths":1,"coins":38,
       "pages":9,"pagesTotal":9,"lives":2,"isNewBest":true,"splits":[],"playerName":"SAT"}'

curl -s 'http://127.0.0.1:5050/api/leaderboard?levelId=whitepaper-run&category=ANY%25&gameVersion=1.0.0&rulesVersion=1'
```

### Configuration

| Env var            | Default                          | Meaning                                  |
| ------------------ | -------------------------------- | ---------------------------------------- |
| `PORT`             | `5050`                           | Port the API listens on.                 |
| `LEADERBOARD_DATA` | `server/data/leaderboard.json`   | Path to the JSON store.                  |

The store directory is created on first write and is **git-ignored** — entries are
runtime data, not source.

### Pointing the front-end at a different API

The client resolves its API base URL in this order:

1. `window.LEADERBOARD_API_BASE` (set in a `<script>` before `leaderboard-client.js`).
2. `<meta name="leaderboard-api-base" content="https://api.example.com">`.
3. Default: same hostname, port `5050`.

So a production page hosting the API elsewhere just adds a meta tag.

## Deployment

1. Host the static files (`index.html`, `js/`, `styles/`) on any static host/CDN.
2. Run `node server/leaderboard-server.js` on a small always-on host (a tiny VM,
   a container, or a platform that runs a long-lived Node process). Set `PORT` to
   match your platform and put it behind HTTPS (a reverse proxy such as nginx/Caddy,
   or the platform's built-in TLS).
3. Persist `LEADERBOARD_DATA` on a durable volume so entries survive restarts.
4. Add a `<meta name="leaderboard-api-base">` (or set `window.LEADERBOARD_API_BASE`)
   on the static page pointing at the deployed API origin.

The API sends permissive CORS (`Access-Control-Allow-Origin: *`) because it is
public by design and is consumed from a different origin than the static files.
It stores nothing but freely-chosen display names and run stats.

## Resilience

The leaderboard is an **optional** feature: the client (`js/leaderboard-client.js`)
never throws into gameplay. Every call resolves to a result object with a `status`
of `ok` / `duplicate` / `invalid` / `offline` / `error`, and unreachable-backend
cases collapse to `offline` after an 8s timeout. If the API is down, local play —
including locally saved personal bests — is unaffected.

## Swapping the datastore

To move off the JSON file, reimplement the storage helpers in
`server/leaderboard-server.js` (`loadEntries`, `persistEntries`, the read filter,
and `findDuplicate`) against your datastore, keeping:

- the two endpoint shapes above, and
- `js/leaderboard-rules.js` as the validation + ranking authority.

The browser never knows or cares which datastore is behind the endpoints.

## Limits

This is deliberately lightweight. It validates **obviously malformed** submissions
(bad types, out-of-range values, inconsistent stats/splits) but is not, by itself,
cheat-proof — a determined player can still hand-craft a plausible POST. Stronger
plausibility checks, rate limiting, and an admin path to remove bogus entries are
the anti-cheat ticket (`f5c6f03e`); name moderation and the public-data notice are
the privacy ticket (`7f02e282`).
