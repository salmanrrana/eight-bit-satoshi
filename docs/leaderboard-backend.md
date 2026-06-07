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
- **Swappable.** The API routes are the contract. If the JSON file outgrows its
  welcome, put a managed datastore (Supabase, Firestore, a hosted Postgres) behind
  the same routes without touching the front-end — see [Swapping the datastore](#swapping-the-datastore).

## Endpoints

| Method   | Path                                                                | Purpose                              |
| -------- | ------------------------------------------------------------------- | ------------------------------------ |
| `GET`    | `/api/health`                                                       | Liveness probe.                      |
| `GET`    | `/api/leaderboard?levelId&category&gameVersion&rulesVersion[&limit]` | Ranked rows for one board.           |
| `POST`   | `/api/leaderboard`                                                   | Submit a completed run.              |
| `DELETE` | `/api/leaderboard?id=<entryId>`                                      | Remove one bogus entry (admin only). |

`DELETE` is the maintenance path for removing fake submissions; it is disabled
unless `LEADERBOARD_ADMIN_TOKEN` is set and requires a matching `X-Admin-Token`
header. See [`leaderboard-anti-cheat.md`](leaderboard-anti-cheat.md) for the full
flow and the limits of anti-cheat on a static browser game. The same path can
remove abusive display names; see
[`leaderboard-privacy.md`](leaderboard-privacy.md) for the privacy and moderation
policy.

All four board-identifying params (`levelId`, `category`, `gameVersion`,
`rulesVersion`) are **required** on read, so runs from different builds or rulesets
are never mixed (contract §6).

### The combined board (`levelId=combined`)

`combined` is a **virtual** board (contract §5): nothing is ever submitted to it.
On read, the server derives it from each player's best entry on *both* levels
(matched by case-insensitive display name within the same
`category`/`gameVersion`/`rulesVersion`), sums those two times, and ranks the totals
with the same rules as any other board. Players missing either level are excluded.
Each returned row carries a `levels` breakdown of the contributing level times, a
derived `id` (`combined::<name>`), and a `serverTimestamp` equal to the later of the
two level times (the instant the player qualified). Because it is recomputed on
every read, a faster level time updates the combined total automatically.

An optional `playerName` query param asks the server to also return a `you` object
describing that player's own progress — `{ playerName, qualified, time, levels,
missing }`, where `missing` lists the level ids still needed — so the UI can tell a
player exactly what is left to qualify. It is omitted (null) for normal boards.

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

Display names are checked by the shared rules module on both write and read.
Submissions with blocked names are rejected. If the blocklist changes later, older
stored rows that no longer pass `validateName()` are omitted from leaderboard
responses until a maintainer deletes them.

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
| `LEADERBOARD_ADMIN_TOKEN` | unset                    | Enables authenticated `DELETE` for bogus or abusive entries. |

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
4. Set a long random `LEADERBOARD_ADMIN_TOKEN` so bogus or abusive rows can be
   removed without opening public deletes.
5. Review host/proxy/CDN access logs. The app does not store IP addresses or
   device identifiers in leaderboard data, but infrastructure logs may.
6. Review the display-name blocklist in `js/leaderboard-rules.js` for your
   audience and update it as needed.
7. Add a `<meta name="leaderboard-api-base">` (or set `window.LEADERBOARD_API_BASE`)
   on the static page pointing at the deployed API origin.

The API sends permissive CORS (`Access-Control-Allow-Origin: *`) because it is
public by design and is consumed from a different origin than the static files.
It stores nothing but freely-chosen display names and run stats. The deployment
privacy and moderation checklist lives in
[`leaderboard-privacy.md`](leaderboard-privacy.md).

## Resilience

The leaderboard is an **optional** feature: the client (`js/leaderboard-client.js`)
never throws into gameplay. Every call resolves to a result object with a `status`
of `ok` / `duplicate` / `invalid` / `offline` / `error`, and unreachable-backend
cases collapse to `offline` after an 8s timeout. If the API is down, local play —
including locally saved personal bests — is unaffected.

## Swapping the datastore

To move off the JSON file, reimplement the storage helpers in
`server/leaderboard-server.js` (`loadEntries`, `persistEntries`, the read filter,
`findDuplicate`, and delete-by-id persistence) against your datastore, keeping:

- the endpoint shapes above: health, leaderboard read, submit, and authenticated
  delete,
- `js/leaderboard-rules.js` as the validation + ranking authority.

The browser never knows or cares which datastore is behind the endpoints.

## Limits

This is deliberately lightweight. It validates **obviously malformed** submissions
(bad types, out-of-range values, inconsistent stats/splits) but is not, by itself,
cheat-proof — a determined player can still hand-craft a plausible POST. Stronger
plausibility checks, rate limiting, and an admin path to remove bogus entries are
the anti-cheat ticket (`f5c6f03e`). Name moderation is also deliberately
lightweight: it rejects and read-filters obvious abusive display names, but a
maintainer should still review reports and remove rows when needed.
