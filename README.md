# 8-Bit Satoshi

Playable static canvas game. No install step is required.

## Levels & Local Development

Levels normally unlock in order — clearing a level unlocks the next. When the
game is served from a loopback host (`npm start` → `127.0.0.1`) or opened from
disk, **every level is unlocked** so any of them can be played or tested
directly; a real deployment keeps the normal progression. You can also
deep-link a level with `?level=N` (e.g. `http://127.0.0.1:5000/?level=4`).

Level 4 (**SHITCOIN CITY**) is a top-down overworld: walk with WASD/arrows,
step onto a numbered doorway to enter that venue as a side-view brawl, clear
every venue, then enter the vault to finish the run.

Level 5 (**WALL STREET**) scales that formula up into a New York style financial
district: a bigger map with a park, crosswalks, steaming manholes, and taxi
traffic that costs a life on contact. Saylor, Fink, and the freshly converted
bankers work the streets — but inside each of the four buildings, Matrix-style
agents in suits try to bounce you out. Every building has multiple floors
linked by stairwells: climb UP to a roof exit or descend DOWN to a vault exit,
and stomp every agent across all floors in one visit to bank the clear. Clear
all four to wake the Charging Bull.

Level 6 (**FOR THE PEOPLE**) is an arcade beat-em-up with **eight districts,
sixteen fights, and 55 enemies**, ending at the **Bullshit Machine** boss. Its
8,640-pixel street is three times the original Level 6 route. Choose a fighter
on the title screen:

| Fighter | Combo style | Signature throw | Charged special |
| --- | --- | --- | --- |
| Jack Mallers | Heavy uppercut | Lightning sats | People Power shockwave |
| Satoshi | Sweeping kicks | Piercing Bitcoin discs | Genesis Spin coin ring |
| CryptoWizzardd | Long staff strikes | Exploding shitcoins | Moonshot token storm |
| Random Coder | Fast keyboard jabs | Flying keyboards | Hotfix heals and stuns |

Move with **WASD / arrows**, hold **X / F** to chain attacks, press **Space** to
jump, and attack in the air to jump-kick. Press **E / Q** near a chair, trash
can, crate, cone, bottle, or shitcoin to pick it up; press again to throw it in
the direction you face. Away from loose objects, the same key throws your
fighter's signature projectile. Holding the key won't accidentally launch a
fresh pickup. **C** uses your special when the green meter is full.

Enemies also grab objects and throw their own junk. A **THROW!** tell warns you
before they release; change lanes or jump to dodge. Missed enemy chairs, cans,
tokens, and bottles can land as pickups. Heavy throws can bowl through more
than one enemy, and exploding objects damage nearby crowds.

Clear each crowd, then walk right when GO appears. Health partially refills
between fights and districts; deaths use the shared three-life pool and preserve
the current fight and run timer. Smash newsboxes for power secrets and crates
for healing pizza. **P / Escape** pauses, **R** restarts, and **M** toggles sound.
Touch has a four-way pad and Attack / Jump / Power / Grab–Throw buttons.

The scenery uses a 640 × 360 coordinate system rendered into a 1280 × 720 canvas.
Health, charge, score, time, dialogue, and item prompts are sharp HTML text
outside the playfield, so the pixel effect doesn't blur essential instructions.

The Level 6 story is an **alternate 2026 satire**, with imagined dialogue and
events, rather than a news report. CryptoWizzardd, Willy Woo, Larry Fink and
Michael Saylor appear as satirical cameos. Enemy crowds are fictional spin
doctors, gatekeepers, token shills, and fiat enforcers.

Jump directly to its local level selection at `http://127.0.0.1:5000/?level=6`.
The first five levels keep their original graphics and play styles.

## Deployment

The live game is https://eight-bit-satoshi.netlify.app/. Netlify is connected to
`salmanrrana/eight-bit-satoshi` and deploys the `main` branch. Run `npm run check`
and `npm test` before pushing. Confirm the published Netlify deploy references
the pushed commit before considering a release complete.

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

## Leaderboard

The leaderboard is a **local high-score table** saved in your browser's
`localStorage` on this device — there is no server, account, or network call. The
game stays fully static. Scores are stored under the key
`8bit-satoshi:leaderboard:v1`.

### Submitting a Score

After finishing a level, the results screen shows an optional **SUBMIT TIME**
form: enter a short display name (1–12 characters; letters, numbers, spaces,
dots, underscores, and dashes only) and save your run to the local leaderboard.
The display name, level, time, and run stats are stored only on this device. The
flow does not ask for an account, email, wallet, location, or device identifier.

Submitting is never required — **PLAY AGAIN** and **LEVELS** always work. The form
reports a clear outcome for every case: success, an already-saved duplicate, a
validation problem (e.g. an empty or too-long name), storage being unavailable, or
an unexpected error. Offline and error states leave the form editable so you can
retry; a successful or duplicate submit locks it so the same run is not saved twice.

### Viewing the Leaderboard

The **LEADERBOARD** button on the title screen — and on the results screen after a
run — opens an in-game rankings view. Tabs switch between each level's board
and the **COMBINED** board; each row shows the rank, player name, final time,
and the run's context stats (deaths, coins, pages) plus the date. A run you
submitted this session is highlighted. The view handles loading, empty, and
storage-unavailable states cleanly, and **BACK** (or `Esc`) returns to where you
opened it from. Like the rest of the feature it is optional: if storage is
unavailable the rest of the game is unaffected.

The **COMBINED** board ranks players by their **total time across every level** — it
sums your best time on each level, so you only appear once you have posted a time on
all of them. Each row shows the combined total plus the contributing per-level times
(`L1 … · L2 … · L3 …`), and a line at the top tells you what you still need (for
example, "Finish L2 (RUNNING BITCOIN) to qualify for the combined total."). Improving
any level time updates your combined total automatically the next time the board
loads.

You can also open it from the browser console:

```js
eightBitSatoshi.openLeaderboard()                  // first board
eightBitSatoshi.openLeaderboard("running-bitcoin") // Level 2 board
eightBitSatoshi.openLeaderboard("internet-of-money") // Level 3 board
eightBitSatoshi.openLeaderboard("wall-street")       // Level 5 board
eightBitSatoshi.openLeaderboard("for-the-people")    // Level 6 board
eightBitSatoshi.openLeaderboard("combined")        // combined total board
```

## Check

```bash
npm install
npm run check:fast
```

`npm install` enables the tracked pre-commit hook. It checks supported staged
files with Prettier, then runs ESLint and the focused game checks. Running the
whole fast check also catches broken references after a deletion. Prettier is
applied incrementally so adopting it does not rewrite the existing game in one
large diff.

The 15 focused Level 6 checks cover facing/lane collision, combos, jumping,
special charge, life loss, pickup/carry/throw behavior, piercing hits, enemy
throws and dodging, quick input taps, lethal hits at exits, and a complete input-only run with each
of the four fighters through every district and the boss.

## Timing Rules

The timed category is **ANY%**. These rules are defined once in `TIMING_RULES`
(in `js/game.js`) and applied consistently across the HUD timer, the results
screen, locally saved personal bests, and the leaderboard submission payload:

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
recorded under the old rules so comparisons stay fair. The leaderboard groups
entries by the same `gameVersion` and ruleset, so a run is never ranked against a
different build.

You can inspect the active rules and the last completed run in the browser
console:

```js
eightBitSatoshi.getTimingRules()
eightBitSatoshi.getLastRun()
```

## Personal Bests

Best final time and checkpoint splits are saved per level in `localStorage`
under the versioned key `8bit-satoshi:bests:v1`. The extended Level 6 retires
personal best times from its shorter route while preserving its cleared flag.
To clear saved bests during
development or testing, run this in the browser console and reload:

```js
eightBitSatoshi.resetBests()
```

The leaderboard is stored separately under `8bit-satoshi:leaderboard:v1`. To clear
all saved scores, run this in the browser console and reload:

```js
localStorage.removeItem("8bit-satoshi:leaderboard:v1")
```
