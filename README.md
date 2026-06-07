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
