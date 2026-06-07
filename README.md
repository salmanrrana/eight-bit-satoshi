# 8-Bit Satoshi

Playable static canvas game. No install step is required.

## Start

```bash
npm start
```

Open:

```text
http://127.0.0.1:5000/
```

That runs in the current terminal. Stop it with `Ctrl+C`.

## Start In Background

```bash
npm run start:service
```

Stop the background server:

```bash
npm stop
```

## Leaderboard Backend

Public leaderboards need shared storage, so they are backed by a small
dependency-free Node service (the game itself stays fully static). Run it
alongside the game during development:

```bash
npm run server
```

That listens on `http://127.0.0.1:5050/`. Setup, endpoints, configuration, and
deployment are documented in
[`docs/leaderboard-backend.md`](docs/leaderboard-backend.md); the data shape it
stores is the contract in
[`docs/leaderboard-contract.md`](docs/leaderboard-contract.md). Leaderboard calls
are optional — if the backend is offline, local play and personal bests are
unaffected.

### Submitting a Score

After finishing a level, the results screen shows an optional **SUBMIT TIME**
form: enter a short display name (1–12 characters) and submit your run to the
public leaderboard. A note on the form states that the name, time, and run stats
become public. The name is validated both in the browser and again on the server.

Submitting is never required — **PLAY AGAIN** and **LEVELS** always work. The form
reports a clear outcome for every case: success, an already-on-the-board duplicate,
a validation problem (e.g. an empty or too-long name), the backend being offline,
or an unexpected error. Offline and error states leave the form editable so you can
retry; a successful or duplicate submit locks it so the same run is not posted twice.

### Viewing the Leaderboard

The **LEADERBOARD** button on the title screen — and on the results screen after a
run — opens an in-game rankings view. Tabs switch between the Level 1, Level 2, and
**COMBINED** boards; each row shows the rank, player name, final time, and the run's
context stats (deaths, coins, pages) plus the date. A run you submitted this session
is highlighted. The view handles loading, empty, offline, and error states cleanly
(offline/error offer a **RETRY**), and **BACK** (or `Esc`) returns to where you
opened it from. Like the rest of the feature it is optional: if the backend is
offline the rest of the game is unaffected.

The **COMBINED** board ranks players by their **total time across both levels** — it
sums your best Level 1 and Level 2 times, so you only appear once you have posted a
time on each. Each row shows the combined total plus the contributing per-level
times (`L1 … · L2 …`), and a line at the top tells you what you still need (for
example, "Finish L2 (RUNNING BITCOIN) to qualify for the combined total."). Improving
either level time updates your combined total automatically the next time the board
loads.

You can also open it from the browser console:

```js
eightBitSatoshi.openLeaderboard()                  // first board
eightBitSatoshi.openLeaderboard("running-bitcoin") // Level 2 board
eightBitSatoshi.openLeaderboard("combined")        // combined total board
```

## Check

```bash
npm run check
```

## Timing Rules

The timed category is **ANY%**. These rules are defined once in `TIMING_RULES`
(in `js/game.js`) and applied consistently across the HUD timer, the results
screen, locally saved personal bests, and the future leaderboard submission
payload:

- **Pausing:** the run timer **pauses on the pause screen** (real-time, but
  pausable). It also pauses if the tab is hidden mid-run.
- **Deaths:** deaths **are allowed**. Each death costs a life and is counted
  (shown in the results), but the timer keeps running. The run ends only when
  lives reach zero.
- **Checkpoint respawns:** respawning at a checkpoint **keeps the same timer**
  and all earlier checkpoint splits. The timer and splits reset only on a full
  restart.

The rules are summarized on the title screen so players can read them before a
run without interrupting gameplay. Personal bests are stamped with the ruleset
version; bumping `TIMING_RULES.version` after a real rules change retires bests
recorded under the old rules so comparisons stay fair.

The leaderboard schema these timing rules feed into — categories, submitted
fields, tie-breaking, and versioning — is specified in
[`docs/leaderboard-contract.md`](docs/leaderboard-contract.md). Backend and
frontend leaderboard work must implement that contract.

You can inspect the active rules and the last completed run in the browser
console:

```js
eightBitSatoshi.getTimingRules()
eightBitSatoshi.getLastRun()
```

## Personal Bests

Best final time and checkpoint splits are saved per level in `localStorage`
under the versioned key `8bit-satoshi:bests:v1`. To clear saved bests during
development or testing, run this in the browser console and reload:

```js
eightBitSatoshi.resetBests()
```
