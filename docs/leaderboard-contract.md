# Leaderboard Data Contract (v1)

This is the single source of truth for what a leaderboard entry contains and how
entries are ranked. **Backend and frontend MUST implement this same schema.**
It is intentionally written before the submission system, backend, and UI are
built (tickets `896e6ea5`, `d14a34a5`, `3048aa3c`, `afbc8b2c`, `f5c6f03e`,
`7f02e282`) so all of them agree on one shape.

The run-derived half of this contract is produced in code by `buildSubmission()`
in `js/game.js` and is observable in the browser console via
`eightBitSatoshi.getLastRun()`. The timing rules it stamps come from
`TIMING_RULES`; the build identifier comes from `GAME_VERSION`.

---

## 1. Categories

Timing in this game is governed by a **single ruleset** (`TIMING_RULES`,
category `ANY%`). To keep the contract honest with the timing-rules epic, v1
ships exactly one active category per board:

| Board            | Active category (v1) | Key                                    |
| ---------------- | -------------------- | -------------------------------------- |
| Level 1          | `ANY%`               | `levelId = "whitepaper-run"`           |
| Level 2          | `ANY%`               | `levelId = "running-bitcoin"`          |
| Combined (total) | `ANY%`               | `levelId = "combined"` (virtual board) |

`ANY%` means: reach the goal as fast as possible. Collectibles (coins/SATS,
pages/PATCHES) and deaths do **not** gate the run — they are recorded as stats
but do not change which category a run belongs to.

### Reserved variants (NOT active in v1)

`All Pages` and `No Deaths` are **not** separate boards in v1, because the game
exposes only one timing ruleset today. They are reserved so we never repurpose
the names later for something incompatible. When/if they ship, they are derived
from the **same** run payload — no new fields are required:

- `All Pages` qualifier: `pages === pagesTotal`.
- `No Deaths` qualifier: `deaths === 0`.

A future category MUST get its own `category` value (e.g. `"ALL_PAGES"`) and, if
its timing differs, its own `rulesVersion` — it must never silently reinterpret
an `ANY%` row.

---

## 2. Submitted fields

A submission has two parts: the **run payload** (produced by the game from the
completed run) and the **submission envelope** (the player-entered name plus
timestamps). The backend adds its own authoritative fields on accept.

### 2.1 Run payload — produced by `buildSubmission()`

| Field         | Type              | Required | Meaning                                                                 |
| ------------- | ----------------- | -------- | ----------------------------------------------------------------------- |
| `levelId`     | string            | yes      | Stable level key. Authoritative grouping key. `"whitepaper-run"` / `"running-bitcoin"`. Never the display title. |
| `level`       | string            | yes      | Display title for UI only (e.g. `"THE WHITEPAPER RUN"`). Never used as a key. |
| `gameVersion` | string            | yes      | Playable build the run was set on (`GAME_VERSION`, e.g. `"1.0.0"`).      |
| `rulesVersion`| integer           | yes      | Timing ruleset version (`TIMING_RULES.version`, currently `1`).          |
| `category`    | string            | yes      | Category key (`"ANY%"` in v1).                                           |
| `time`        | number (seconds)  | yes      | Final run time in **seconds**, float, paused time excluded (see §4). Displayed as `m:ss.cc`. |
| `deaths`      | integer           | yes      | Deaths during the run (`>= 0`).                                          |
| `coins`       | integer           | yes      | Coins/SATS collected (`>= 0`).                                           |
| `pages`       | integer           | yes      | Pages/PATCHES collected this run (`>= 0`).                               |
| `pagesTotal`  | integer           | yes      | Pages available in the level. Lets a reader validate `All Pages` without hard-coding per-level counts. |
| `lives`       | integer           | yes      | Lives remaining at the goal (`>= 1`; a run ends in failure at 0).        |
| `isNewBest`   | boolean           | yes      | Whether this beat the local personal best. Advisory only; the backend re-decides ranking. |
| `splits`      | array<Split>      | yes      | Checkpoint splits, ordered by `index`. May be empty if no checkpoints were crossed. |

**Split** object:

| Field   | Type             | Meaning                                                        |
| ------- | ---------------- | ------------------------------------------------------------- |
| `index` | integer (1-based)| Stable checkpoint order within the level.                     |
| `name`  | string           | Checkpoint/section display name (e.g. `"GENESIS"`).           |
| `total` | number (seconds) | Cumulative run time when this checkpoint was reached.         |
| `split` | number (seconds) | Segment time since the previous checkpoint (or run start).    |

### 2.2 Submission envelope — added by the submission flow (`d14a34a5`)

| Field            | Type              | Required | Meaning                                                        |
| ---------------- | ----------------- | -------- | ------------------------------------------------------------- |
| `playerName`     | string            | yes      | Player display name/initials. Rules in §5 and ticket `7f02e282`. |
| `clientTimestamp`| string (ISO 8601) | yes      | When the client submitted (UTC). Advisory; never trusted for ranking. |

### 2.3 Server-assigned fields — added by the backend (`896e6ea5`)

| Field            | Type              | Meaning                                                        |
| ---------------- | ----------------- | ------------------------------------------------------------- |
| `id`             | string            | Unique entry id assigned by the backend.                      |
| `serverTimestamp`| string (ISO 8601) | Authoritative accept time (UTC). Used for tie-breaking (§3).  |
| `rank`           | integer           | Computed on read, not stored on the row (1-based).            |

The backend MUST recompute/validate everything that affects ranking. Client
fields are inputs to validation, never trusted blindly (see anti-cheat ticket
`f5c6f03e`).

---

## 3. Tie-breaking / sort order

Entries on a board are sorted by:

1. `time` **ascending** (lower is better). This is the only ranking signal.
2. Ties (identical `time` after rounding to the stored precision) are broken by
   **earlier `serverTimestamp`** — first to achieve the time ranks higher.
3. Final, fully deterministic tiebreak: ascending `id`. Guarantees a stable,
   reproducible order even if two entries share a time and timestamp.

Deaths, coins, and pages do **not** affect `ANY%` ranking; they are shown as
context only.

`time` is compared at **centisecond precision** (two decimal places), matching
the on-screen `m:ss.cc` display, so two runs that display the same time are
treated as tied rather than separated by sub-frame float noise.

---

## 4. Paused time (matches the timing-rules epic)

Paused time is **excluded** from `time`. This matches `TIMING_RULES`
(`timerPausesWhilePaused: true`) and the engine: the run clock only advances
while `phase === "playing"` and the game is not paused, and it also stops when
the tab is hidden mid-run. The submitted `time` is therefore pause-excluded
elapsed play time, not wall-clock.

Deaths keep the clock running (`deathsAllowed: true`); checkpoint respawns keep
the same timer and earlier splits (`respawnKeepsTimer: true`). See `README.md`
("Timing Rules") for the player-facing summary.

If a real timing rule changes, bump `TIMING_RULES.version`; entries with an
older `rulesVersion` MUST NOT be ranked against the new ruleset.

---

## 5. Combined board

The combined board (`levelId: "combined"`) ranks **total time across both
levels** for the same player.

- Requires a valid `ANY%` entry for **both** `whitepaper-run` and
  `running-bitcoin` at the same `gameVersion` and `rulesVersion`.
- `time` = sum of the player's best qualifying Level 1 and Level 2 `time`.
- The UI shows the combined total plus each contributing level time, and tells a
  player which level they still need to qualify (ticket `afbc8b2c`).
- Ranked and tie-broken exactly as §3, using the summed `time`. Its
  `serverTimestamp` (for the §3 tie-break) is the **later** of the two contributing
  level timestamps — the instant the player qualified — and its `id` is the derived,
  stable `combined::<normalized-name>`, which never collides with a real entry id.

A combined entry is derived from level entries; it is not submitted directly by
the client. A derived row therefore adds one field beyond §2:

| Field    | Type   | Meaning                                                                 |
| -------- | ------ | ---------------------------------------------------------------------- |
| `levels` | object | Per-level breakdown keyed by `levelId`, each `{ levelId, level, time, serverTimestamp, id }`, so the UI can show each contributing level time beside the total. |

Player identity for grouping is the display name compared case-insensitively after
trimming (the same identity rule the backend uses for duplicate detection) — the
game has no accounts. Because the board is recomputed on every read from the best
level entries, a faster time on either level updates the combined total
automatically.

The read API also exposes a player's progress toward qualifying: a `GET` for the
combined board with an optional `playerName` returns a `you` object
`{ playerName, qualified, time, levels, missing }`, where `missing` lists the level
ids the player still needs. This is advisory UI data, never a ranked row.

---

## 6. Versioning & isolation

A leaderboard board is uniquely identified by the tuple:

```
(levelId, category, gameVersion, rulesVersion)
```

Runs are only ever compared within the same tuple. This guarantees:

- A run on an old build (`gameVersion`) is never ranked against a different game.
- A run under an old ruleset (`rulesVersion`) is never ranked against new rules.

`gameVersion` tracks the playable build (level geometry, physics, content).
`rulesVersion` tracks only the timing ruleset. They move independently.

---

## 7. Privacy & name rules

- Public fields: `playerName`, level/category, final time, run stats, versions,
  entry id, and server submit time. These are the fields shown by leaderboard
  reads.
- The submission flow does not ask for or store emails, accounts, passwords,
  wallet addresses, IP addresses, device identifiers, or location data.
- `playerName` is trimmed, must be 1-12 characters, and may contain only letters,
  numbers, spaces, dots, underscores, and dashes.
- `playerName` is checked against the shared abusive-name blocklist. Invalid or
  blocked names are rejected on submission. Stored rows whose names no longer pass
  the current policy are filtered from reads, and maintainers can delete rows with
  private deployment maintenance.
- The submission UI must state clearly that the display name, level, time, run
  stats, and submit date become public.

The deployment policy and moderation runbook live in
[`leaderboard-privacy.md`](leaderboard-privacy.md).

---

## 8. Canonical example (run payload)

```json
{
  "levelId": "whitepaper-run",
  "level": "THE WHITEPAPER RUN",
  "gameVersion": "1.0.0",
  "rulesVersion": 1,
  "category": "ANY%",
  "time": 92.47,
  "deaths": 1,
  "coins": 38,
  "pages": 9,
  "pagesTotal": 9,
  "lives": 2,
  "isNewBest": true,
  "splits": [
    { "index": 1, "name": "CYPHERPUNKS", "total": 14.20, "split": 14.20 },
    { "index": 2, "name": "GENESIS",     "total": 30.06, "split": 15.86 }
  ]
}
```

Full submission = run payload **+** `{ "playerName": "SAT", "clientTimestamp": "2026-06-07T04:35:00.000Z" }`,
with the backend adding `id`, `serverTimestamp`, and (on read) `rank`.
