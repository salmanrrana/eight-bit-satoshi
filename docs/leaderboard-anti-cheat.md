# Leaderboard Anti-Cheat & Fair Play

8-Bit Satoshi is a static browser game with a public, account-free leaderboard.
That shape makes perfect cheat-proofing impossible: the client runs entirely on
the player's machine and the submission API is public-write by design. This
document describes the **lightweight** checks that reduce *obvious* fakes, the
inconsistencies the server can catch, what it deliberately **cannot** catch, and
the maintenance path for removing bogus entries after the fact.

The checks live in the shared rules module
[`js/leaderboard-rules.js`](../js/leaderboard-rules.js) (so client and server
enforce the same thing) and in the backend
[`server/leaderboard-server.js`](../server/leaderboard-server.js). The data shape
they validate is the contract in
[`leaderboard-contract.md`](leaderboard-contract.md).

## What the server rejects

Every submission is re-validated server-side — client validation is only for
instant feedback and is never trusted (contract §2.3). A submission is rejected
(`400`) when any of these fail:

- **Malformed times.** `time` must be a finite, positive number no larger than
  `MAX_TIME_SECONDS` (24h). Zero, negative, `NaN`, and absurd values are rejected.
- **Impossibly fast times.** Each level has a physical floor (`LEVEL_MIN_TIME`).
  The player's horizontal speed is hard-capped (`MAX_RUN = 148 px/s`) and nothing
  carries the player forward, so a run can never be faster than the distance from
  spawn to the first possible goal overlap divided by that cap (~34.18s for
  `whitepaper-run`, ~36.88s for `running-bitcoin`). The floors sit just below
  those hard minimums — low enough never to reject a real run, high enough to
  reject a 20-second clear.
- **Out-of-range stats.** `deaths`, `coins`, `pages` must be non-negative integers;
  `pagesTotal` must match the submitted level; `pages`, `coins`, and `lives` must
  stay inside that level's possible bounds; and `deaths + lives` must match the
  three lives a completed run starts with.
- **Inconsistent splits.** Splits must be well-formed and ordered, cumulative
  totals must be non-decreasing, no split total may exceed the final time, and the
  checkpoint index/name sequence must match the submitted level's checkpoint
  prefix. Each segment time must equal the gap between consecutive cumulative
  totals (the game records `split = total − prevTotal` exactly, so a mismatch
  means hand-edited splits).
- **Wrong build / ruleset / level / category.** `levelId` must be a real
  submittable level, `category` an active category, `gameVersion` a semver string,
  and `rulesVersion` a positive integer. Runs are only ever ranked within the same
  `(levelId, category, gameVersion, rulesVersion)` tuple (contract §6), so a run
  can never be compared against a different build or ruleset.
- **Bad names.** `playerName` length, allowed characters, and the lightweight
  abusive-name blocklist are enforced (contract §7 and
  [`leaderboard-privacy.md`](leaderboard-privacy.md)).

Every accepted entry therefore carries enough run metadata — `gameVersion`,
`levelId`, time, splits, and stats — to detect the obvious inconsistencies above
and to let a maintainer eyeball a suspicious row.

## Duplicate-submission prevention

Two layers stop a single completion from spamming the board:

- **Frontend.** The results-screen submit form locks after the first successful
  (or duplicate) submission and disables the button while a request is in flight,
  so a double-tap or re-press cannot post twice (`buildSubmitSection` in
  `js/game.js`). PLAY AGAIN starts a fresh run with a fresh form.
- **Backend.** A POST that matches an existing row on the same board, same player
  (case-insensitive name), and same `time` is treated as a duplicate: the server
  returns the existing row with `duplicate: true` instead of storing a second copy,
  making accidental re-submits idempotent.

## What this canNOT catch (the honest limits)

These checks are a speed bump, not a wall. Because the game is fully client-side:

- A determined player can **hand-craft a plausible POST** directly to the API —
  any time at or above the level floor, with internally-consistent splits and
  stats, will pass validation. There is no server-side replay or proof of play.
- There are **no accounts and no rate limiting**, so the same person can submit
  under many names. Identity is just a freely-chosen display name.
- The client is inspectable and modifiable; nothing it reports (including
  `isNewBest`) is trusted for ranking — but nothing stops the player editing what
  it sends.
- CORS is intentionally open (`Access-Control-Allow-Origin: *`) because the API is
  public by design; this is not a security boundary.

Stronger guarantees would require accounts, server-authoritative simulation, or
input replay — all out of scope for a small static game. The remaining defense is
the maintenance path below.

## Maintenance: removing bogus entries

A maintainer can delete a single entry after the fact. This is **disabled by
default** and only turns on when a shared secret is configured:

1. Start the server with a token set:

   ```bash
   LEADERBOARD_ADMIN_TOKEN='choose-a-long-random-secret' npm run server
   ```

2. Find the offending entry's `id` (returned on submit, and present on every row
   from `GET /api/leaderboard`).

3. Delete it:

   ```bash
   curl -s -X DELETE \
     -H 'X-Admin-Token: choose-a-long-random-secret' \
     'http://127.0.0.1:5050/api/leaderboard?id=<entryId>'
   ```

Responses:

- `200 { ok: true, deleted }` — entry removed and persisted.
- `400` — missing `id`.
- `401` — missing or invalid `X-Admin-Token`.
- `403` — admin actions disabled (no `LEADERBOARD_ADMIN_TOKEN` configured).
- `404` — no entry with that id.

Notes:

- The token is compared as a fixed-length digest, so a wrong token cannot be
  discovered by timing or token-length probes. Keep it secret and, in production,
  only expose `DELETE` over HTTPS.
- Combined-board rows are **virtual** (derived on read); they cannot be deleted
  directly. Remove a contributing level entry instead and the combined row
  recomputes automatically.
- Deleting a level entry the player has improved on is harmless — the board ranks
  their best remaining entry.
