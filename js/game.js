(() => {
  "use strict";

  const VIEW_W = 256;
  const VIEW_H = 240;
  // World width is loaded from the active level definition (see LEVELS) so it can
  // vary per level. Set in initLevel before the game loop reads it.
  let WORLD_W = 0;
  const STEP = 1 / 60;
  const MAX_FRAME = 1 / 15;
  const GRAVITY = 1220;
  const RUN_ACCEL = 980;
  const AIR_ACCEL = 720;
  const FRICTION = 760;
  const MAX_RUN = 148;
  const JUMP = -396;
  const JUMP_PER_BTC = 1.2;
  const MAX_BTC_JUMP_BOOST = 72;
  const STOMP = -280;
  // Launch impulse from a CROWD SURGE pad (Level 3's signature platform kind).
  // Stronger than any coin-boosted jump (max -468) so the pads open routes a
  // plain jump never can, but still deterministic — no randomness, ANY% safe.
  const CROWD_BOUNCE = -520;
  const COYOTE = 0.085;
  const JUMP_BUFFER = 0.11;
  const TILE = 16;
  // Overworld (Level 4) walking speed and player collision box. Tuned so
  // crossing the city reads brisk but tile corridors stay easy to thread —
  // the box is smaller than a tile so doorways never snag.
  const OW_SPEED = 92;
  const OW_PW = 10;
  const OW_PH = 12;
  const SOUND_KEY = "8bit-satoshi:sound:v1";

  // Single source of truth for how the timed category works. Every surface that
  // touches timing (HUD, results, local bests, future leaderboard submissions)
  // reads these decisions so the rules stay consistent and are versioned:
  // bumping `version` after a real rules change invalidates stale personal bests
  // recorded under the old ruleset. The chosen rules for this category:
  //   - The run timer pauses on the pause screen (real-time, but pausable).
  //   - Deaths are allowed; each costs a life and is counted, the timer keeps
  //     running, and the run ends only when lives reach zero.
  //   - Respawning at a checkpoint keeps the same timer and earlier splits.
  const TIMING_RULES = {
    version: 1,
    category: "ANY%",
    timerPausesWhilePaused: true,
    deathsAllowed: true,
    respawnKeepsTimer: true,
    summary: "ANY%: timer pauses when paused, deaths cost a life but keep the clock, checkpoints save your spot — not your time."
  };

  // Build identifier stamped onto every run/leaderboard submission. Distinct from
  // TIMING_RULES.version: GAME_VERSION tracks the playable build (level geometry,
  // physics, content) while rulesVersion tracks only the timing ruleset. The
  // leaderboard groups entries by gameVersion so a run set on an older build is
  // never silently ranked against a different game. Keep this in sync with the
  // "version" field in package.json on any release that changes timed play.
  const GAME_VERSION = "1.3.0";

  // Local/dev detection. When the game is served from a loopback host (npm
  // start) or opened straight from disk, every level is playable so any level
  // can be tested directly. A real deployment (any non-loopback host) keeps
  // the normal clear-the-previous-level progression.
  const IS_DEV = location.protocol === "file:" ||
    ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const titleScreen = document.getElementById("title-screen");
  const messageScreen = document.getElementById("message-screen");
  const messageTitle = document.getElementById("message-title");
  const messageCopy = document.getElementById("message-copy");
  const messageResults = document.getElementById("message-results");
  const startButton = document.getElementById("start-button");
  const continueButton = document.getElementById("continue-button");
  const restartButton = document.getElementById("restart-button");
  const menuButton = document.getElementById("menu-button");
  const levelSelect = document.getElementById("level-select");
  const hudCoins = document.getElementById("hud-coins");
  const hudLives = document.getElementById("hud-lives");
  const hudZone = document.getElementById("hud-zone");
  const hudTimer = document.getElementById("hud-timer");
  const titleRules = document.getElementById("title-rules");
  const leaderboardButton = document.getElementById("leaderboard-button");
  const resultsLeaderboardButton = document.getElementById("results-leaderboard-button");
  const leaderboardScreen = document.getElementById("leaderboard-screen");
  const leaderboardTabs = document.getElementById("leaderboard-tabs");
  const leaderboardBody = document.getElementById("leaderboard-body");
  const leaderboardBack = document.getElementById("leaderboard-back");
  const soundButton = document.getElementById("sound-button");

  // The two leaderboard modules load before this script (see index.html order).
  // Captured once; both are optional — a missing client means the feature simply
  // never appears and local play is untouched.
  const leaderboardClient = window.eightBitSatoshiLeaderboard || null;
  const leaderboardRules = window.LeaderboardRules || null;

  ctx.imageSmoothingEnabled = false;

  const palette = {
    ink: "#101018",
    ink2: "#1b1e2b",
    paper: "#f4ead2",
    paper2: "#cfc2a2",
    orange: "#f7931a",
    orange2: "#a95514",
    blue: "#4aa8f0",
    blue2: "#2459a8",
    green: "#36bd63",
    green2: "#12643a",
    red: "#d64533",
    red2: "#7f251d",
    violet: "#8d6de8",
    gray: "#66706f",
    gray2: "#343b3b",
    brown: "#7b5130",
    brown2: "#3b2519",
    yellow: "#ffd166",
    white: "#f8f1dc"
  };

  // Enemy archetypes. Each enemy `type` resolves to one tuning row so the engine
  // never hardcodes type strings: `speed` (patrol px/s), `score` (stomp reward),
  // `shape` (which existing draw routine to reuse), `spark` (stomp burst color),
  // and `stompToast` (the line shown on a clean stomp). Level 1's banker/printer/
  // miner keep their exact original values; Level 2's fud/chargeback/exploit map
  // onto the same engine behaviors (patrol + stompable) with new identities.
  // The `shape` field is the fallback art; Level-2 types additionally have
  // bespoke sprites (drawFud/drawChargeback/drawExploit, ticket 60f350ff) so the
  // legacy-system threats read distinctly from Level 1's enemies. Level 3's
  // suit/agent/wiretap follow the same pattern (drawSuit/drawAgent/drawWiretap):
  // the forces that pushed back on early adoption — bank lobbyists, three-letter
  // agents, and the surveillance bug you stomp to sweep. Level 5's Wall Street
  // interiors reuse those crews — agent (the Matrix-grade tail in shades),
  // suit, degen, rugpull — plus the shitgun as vault-defense turrets.
  const ENEMY_TYPES = {
    banker: { speed: 28, score: 200, shape: "patroller", spark: palette.red, stompToast: "Threat cleared." },
    printer: { speed: 28, score: 200, shape: "machine", spark: palette.red, stompToast: "Printer jammed." },
    miner: { speed: 36, score: 350, shape: "critter", spark: palette.green, stompToast: "Threat cleared." },
    fud: { speed: 30, score: 200, shape: "patroller", spark: palette.red, stompToast: "FUD debunked." },
    chargeback: { speed: 26, score: 200, shape: "machine", spark: palette.violet, stompToast: "Reversal blocked." },
    exploit: { speed: 40, score: 350, shape: "critter", spark: palette.green, stompToast: "Exploit patched." },
    suit: { speed: 30, score: 200, shape: "patroller", spark: palette.red, stompToast: "Lobbyist bounced." },
    agent: { speed: 26, score: 200, shape: "machine", spark: palette.blue, stompToast: "Tail shaken." },
    wiretap: { speed: 44, score: 350, shape: "critter", spark: palette.violet, stompToast: "Wiretap crushed." },
    // Level 4's venue threats — the 2019-2022 mania crews (drawShiller/
    // drawRugpull/drawDegen): the token shiller working the room, the rug-pull
    // machine winding up exit liquidity, and the overleveraged degen.
    shiller: { speed: 32, score: 200, shape: "patroller", spark: palette.violet, stompToast: "Shill silenced." },
    rugpull: { speed: 26, score: 200, shape: "machine", spark: palette.red, stompToast: "Rug pinned down." },
    degen: { speed: 42, score: 350, shape: "critter", spark: palette.yellow, stompToast: "Position liquidated." },
    // Stationary turret that lobs shitcoins at the player (see updateEnemies).
    // speed 0 = it never patrols; still stompable, and the sat cannon kills it.
    shitgun: { speed: 0, score: 400, shape: "machine", spark: palette.brown, stompToast: "Shooter scrapped." }
  };

  // Projectile tuning. Both pools are deterministic (fixed timers, fixed
  // speeds — no randomness) so timed runs stay fair.
  const SHITGUN_RANGE = 210;      // turret opens fire inside this distance
  const SHITGUN_PERIOD = 1.7;     // seconds between shots
  const SHITCOIN_SPEED = 120;     // enemy shot px/s
  const SAT_SHOT_SPEED = 300;     // player shot px/s
  const FIRE_COOLDOWN = 0.35;     // player refire delay
  // Arcing shitcoin lobs (Level 5): agents hurl coins at the player. All
  // values fixed - no randomness, ANY% safe.
  const SHOT_GRAVITY = 760;       // downward pull on lobbed coins
  const AGENT_THROW_RANGE = 165;  // an agent winds up inside this distance
  const AGENT_THROW_PERIOD = 2.8; // seconds between agent throws
  const AGENT_WINDUP = 0.35;      // raised-arm telegraph before the throw

  // Resolve an enemy type to its tuning row, falling back to a patroller so a
  // typo in a level definition renders and behaves sanely instead of throwing.
  function enemyConfig(type) {
    return ENEMY_TYPES[type] || ENEMY_TYPES.banker;
  }

  // Level definitions. All per-level content lives here so the game loop, timer,
  // checkpoints, HUD, completion, and respawn logic stay generic and read from
  // the active level — adding a level never duplicates the loop. Each definition
  // carries:
  //   id          stable key for personal bests (never shown to players)
  //   title       display/leaderboard name
  //   description short one-line summary
  //   worldW      level length in world pixels (varies per level)
  //   goal        finish marker box {x, y, w, h} (placement varies per level)
  //   zones       ordered scenery/section bands keyed by world x
  //   layout      declarative collections consumed by the add* builders in
  //               initLevel: ground, platforms, blockStacks, coinArcs, pages,
  //               enemies, hazards, and checkpoints
  const LEVELS = [
    {
      id: "whitepaper-run",
      title: "THE WHITEPAPER RUN",
      description: "Build Bitcoin from the broken world to the whitepaper.",
      // Visual theme — selects the backdrop, ground accents, collectible, and
      // checkpoint/goal art families (see getTheme + the draw* routines). "city"
      // is Level 1's dystopian-skyline → green-hills look.
      theme: "city",
      worldW: 5200,
      goal: { x: 5102, y: 128, w: 22, h: 48 },
      zones: [
        { x: 0, name: "BROKEN WORLD", sky: "#52675b", sky2: "#2c3432", ground: "#4a4d47", accent: "#7d3a2c", text: "2008: money printers and broken banks." },
        { x: 720, name: "CYPHERPUNKS", sky: "#435070", sky2: "#24283e", ground: "#3b4055", accent: "#8d6de8", text: "Cryptography gives the individual a shield." },
        { x: 1450, name: "GENESIS", sky: "#6b778a", sky2: "#30394b", ground: "#565d63", accent: "#f7931a", text: "Mine the genesis block and keep moving." },
        { x: 2300, name: "BLOCKCHAIN", sky: "#66a2d8", sky2: "#345a88", ground: "#2f8d50", accent: "#ffd166", text: "Blocks link together. Enemies cannot rewrite them." },
        { x: 3150, name: "NETWORK", sky: "#5eb7c7", sky2: "#2a6770", ground: "#298766", accent: "#36bd63", text: "Nodes, miners, and users harden the network." },
        { x: 4000, name: "HANDOFF", sky: "#526b9f", sky2: "#222c55", ground: "#3e5f48", accent: "#f4ead2", text: "Satoshi fades. The system keeps running." },
        { x: 4700, name: "WHITEPAPER", sky: "#6aa9f2", sky2: "#385a93", ground: "#2f8d50", accent: "#f7931a", text: "Reach the whitepaper. The code lives on." }
      ],
      layout: {
        ground: [
          [0, 620], [700, 450], [1220, 360], [1640, 520], [2260, 460],
          [2820, 520], [3420, 460], [3920, 360], [4380, 330], [4800, 400]
        ],
        platforms: [
          [236, 154, 72, 14, "ledger"], [350, 128, 56, 14, "question"],
          [762, 154, 70, 14, "ledger"], [936, 132, 54, 14, "question"],
          [1288, 142, 78, 14, "ledger"], [1518, 150, 64, 14, "question"],
          [1788, 132, 58, 14, "ledger"], [1998, 154, 76, 14, "ledger"],
          [2328, 144, 76, 14, "question"], [2548, 120, 62, 14, "ledger"],
          [2860, 152, 72, 14, "ledger"], [3066, 132, 64, 14, "question"],
          [3460, 146, 78, 14, "ledger"], [3668, 120, 64, 14, "ledger"],
          [3970, 150, 74, 14, "question"], [4230, 134, 72, 14, "ledger"],
          [4480, 152, 62, 14, "ledger"], [4842, 150, 78, 14, "question"]
        ],
        blockStacks: [
          [540, 2], [1120, 3], [2190, 2], [3340, 3], [4720, 2]
        ],
        coinArcs: [
          [156, 132, 5], [770, 126, 5], [1268, 112, 6], [1770, 104, 5],
          [2380, 112, 6], [2896, 120, 5], [3494, 112, 6], [4216, 106, 5],
          [4848, 116, 6]
        ],
        pages: [
          [610, 150], [1194, 138], [1626, 124], [2206, 136], [2786, 138],
          [3366, 122], [3890, 136], [4550, 138], [5024, 116]
        ],
        enemies: [
          [420, 178, 450, 575, "banker"], [880, 178, 822, 1060, "printer"],
          [1346, 178, 1280, 1470, "banker"], [1900, 178, 1850, 2100, "printer"],
          [2448, 178, 2398, 2700, "miner"], [3230, 178, 3020, 3320, "banker"],
          [3550, 178, 3480, 3770, "printer"], [4100, 178, 4016, 4300, "miner"],
          [4890, 178, 4820, 5040, "banker"]
        ],
        hazards: [
          [655, 190, 40, 15], [1162, 190, 42, 15], [1570, 190, 42, 15],
          [2762, 190, 42, 15], [3378, 190, 42, 15], [3870, 190, 42, 15],
          [4338, 190, 42, 15]
        ],
        // Checkpoints carry a stable 1-based index and display name (the section
        // they open) so splits stay identifiable across results and bests.
        checkpoints: [
          { x: 760, y: 172, index: 1, name: "CYPHERPUNKS" },
          { x: 1510, y: 172, index: 2, name: "GENESIS" },
          { x: 2350, y: 172, index: 3, name: "BLOCKCHAIN" },
          { x: 3180, y: 172, index: 4, name: "NETWORK" },
          { x: 4020, y: 172, index: 5, name: "HANDOFF" },
          { x: 4750, y: 172, index: 6, name: "WHITEPAPER" }
        ]
      }
    },
    {
      // Level 2 — implements plans/level-2-design.md ("RUNNING BITCOIN"). Picks
      // up after Satoshi fades: running the first nodes, hardening the code, and
      // growing the network with Hal Finney and the early builders. Distinct
      // mechanic = CONFIRMATION BLOCKS (the "confirm" platform kind below): the
      // cadence is deterministic (driven by the run clock, no randomness), so
      // timed attempts stay fair. Enemy/collectible art and the full palette
      // pass are later tickets (60f350ff); this entry is the playable course.
      id: "running-bitcoin",
      title: "RUNNING BITCOIN",
      description: "Run a node, harden the code, and grow the network with Hal and the early builders.",
      // "network" theme (ticket 60f350ff): a "network at night" look — server
      // towers and a mempool node-map backdrop that lights up as you advance,
      // terminal-green ground accents, SATS/PATCH collectibles, node-beacon
      // checkpoints, and a server goal. Distinct from Level 1's "city" theme.
      theme: "network",
      worldW: 5600,
      goal: { x: 5502, y: 128, w: 22, h: 48 },
      // Level-specific display strings so the shared HUD/results/pickup copy reads
      // in Level 2's terms (SATS / PATCHES) instead of Level 1's (BTC / pages).
      // Absent on Level 1, which keeps the defaults baked into the code.
      labels: { coin: "SATS", pageStat: "PATCHES", pageNote: "Patch" },
      zones: [
        { x: 0, name: "FIRST SEND", sky: "#1d2138", sky2: "#0e1020", ground: "#2a2e44", accent: "#36bd63", text: "Block 170: the first coins ever sent." },
        { x: 780, name: "RUNNING BITCOIN", sky: "#22304e", sky2: "#101a30", ground: "#2f3a52", accent: "#4aa8f0", text: "Running bitcoin. The first nodes wake up." },
        { x: 1650, name: "BUG REPORTS", sky: "#2a3a52", sky2: "#16223a", ground: "#34465c", accent: "#ffd166", text: "Bug reports roll in. The code gets read." },
        { x: 2550, name: "HARDENING", sky: "#395066", sky2: "#1d3346", ground: "#2f8d50", accent: "#36bd63", text: "A patch closes the hole. The chain heals." },
        { x: 3500, name: "MINING RACE", sky: "#4a6b6f", sky2: "#24484c", ground: "#2f8d50", accent: "#f7931a", text: "Hashes climb. Honest work secures the ledger." },
        { x: 4550, name: "THE NETWORK", sky: "#6aa9f2", sky2: "#385a93", ground: "#2f8d50", accent: "#f7931a", text: "More builders join. No one owns it now." }
      ],
      layout: {
        // Ground runs in segments with deliberate 80px gaps (pits) between them.
        // The exception is the 160px gap at 3900–4060, which is too wide to clear
        // in a single jump and is bridged only by the Confirmation Block wave —
        // that is where Level 2's signature mechanic carries the route.
        ground: [
          [0, 640], [720, 470], [1270, 420], [1770, 500], [2350, 470],
          [2900, 520], [3500, 400], [4060, 380], [4520, 440], [5040, 560]
        ],
        platforms: [
          [300, 150, 70, 14, "ledger"], [430, 124, 54, 14, "question"],
          [820, 150, 72, 14, "ledger"], [980, 128, 54, 14, "question"],
          [1120, 146, 64, 14, "ledger"],
          [1700, 140, 70, 14, "ledger"], [1900, 132, 56, 14, "question"],
          [2120, 150, 74, 14, "ledger"],
          [2560, 144, 76, 14, "question"], [2740, 122, 62, 14, "ledger"],
          [2980, 150, 72, 14, "ledger"], [3180, 132, 64, 14, "question"],
          // CONFIRMATION BLOCK wave across the 160px pit (3900–4060). Three
          // blocks on a 1800ms cycle, staggered 600ms apart and up 1300ms each
          // (~72%), so a confirmed step is almost always available while still
          // demanding the player read the rhythm. Tuning is owned by 5905b7a5.
          [3905, 170, 44, 12, "confirm", { periodMs: 1800, phaseMs: 0, onMs: 1300 }],
          [3970, 166, 44, 12, "confirm", { periodMs: 1800, phaseMs: 600, onMs: 1300 }],
          [4035, 170, 44, 12, "confirm", { periodMs: 1800, phaseMs: 1200, onMs: 1300 }],
          [4560, 146, 72, 14, "ledger"], [4720, 124, 60, 14, "question"],
          // Optional elevated Confirmation Block guarding a bonus PATCH. If it is
          // unconfirmed when you jump you simply land back on the ground, so the
          // main route is never gated by it.
          [4860, 118, 44, 12, "confirm", { periodMs: 2000, phaseMs: 0, onMs: 1300 }],
          [5080, 148, 72, 14, "ledger"], [5260, 130, 64, 14, "question"]
        ],
        blockStacks: [
          [600, 2], [1340, 2], [2680, 3], [3300, 2], [4860, 2]
        ],
        // SATS — fast-pickup scatter (Level 2 reskin of Level 1 coin arcs).
        coinArcs: [
          [180, 130, 5], [430, 100, 5], [840, 124, 6], [1140, 110, 5],
          [1700, 116, 6], [2140, 110, 6], [2760, 118, 5], [3220, 108, 6],
          [3960, 150, 5], [4760, 110, 6], [5260, 116, 5]
        ],
        // PATCHES — milestone collectibles (Level 2 reskin of whitepaper pages):
        // signed code contributions from the early builders, ~one per section
        // plus two bonuses tied to Confirmation Blocks.
        pages: [
          [560, 150], [1080, 126], [1480, 122], [2160, 128], [2780, 130],
          [3320, 118], [4040, 118], [4875, 96], [5320, 128]
        ],
        // fud/chargeback patrol the legacy world; exploit is the faster,
        // higher-value stompable threat (a live bug you patch by landing on it).
        enemies: [
          [420, 178, 380, 600, "fud"], [900, 178, 820, 1150, "chargeback"],
          [1380, 178, 1300, 1660, "fud"], [1950, 178, 1820, 2240, "exploit"],
          [2480, 178, 2380, 2780, "chargeback"], [3050, 178, 2940, 3380, "fud"],
          // Playtest tune (5905b7a5): this chargeback follows the Confirmation
          // Block bridge (exits at x~4079). Its patrol used to start at 4090 —
          // 11px past the bridge exit — so a clean crossing could be immediately
          // contested, and a hit here respawns at checkpoint 4 (x=3560), forcing
          // a full re-cross of the level's hardest section. minX nudged to 4150 to
          // leave a ~70px enemy-free landing zone past the ~4079 bridge exit so the
          // bridge clear is bankable on repeated timed attempts.
          [3650, 178, 3540, 3880, "exploit"], [4200, 178, 4150, 4420, "chargeback"],
          [4650, 178, 4540, 4920, "fud"], [5150, 178, 5060, 5400, "exploit"]
        ],
        // Downtime gaps / chain-fork cracks — static damage zones on the ground.
        hazards: [
          [500, 190, 36, 15], [1080, 190, 42, 15], [2000, 190, 42, 15],
          [2980, 190, 42, 15], [3700, 190, 40, 15], [4660, 190, 42, 15]
        ],
        // Five checkpoints opening zones 2–6 (zone 1 is the spawn). One fewer
        // than Level 1, giving Level 2 a tighter five-segment split structure.
        checkpoints: [
          { x: 800, y: 172, index: 1, name: "RUNNING BITCOIN" },
          { x: 1800, y: 172, index: 2, name: "BUG REPORTS" },
          { x: 2600, y: 172, index: 3, name: "HARDENING" },
          { x: 3560, y: 172, index: 4, name: "MINING RACE" },
          { x: 4600, y: 172, index: 5, name: "THE NETWORK" }
        ],
        // Ally cameos (ticket 944f5c8b), one per the two beats the design reserved
        // (plans/level-2-design.md "Ally cameo hooks"). Decorative only: a small
        // 8-bit sprite plus a single ambient line fired once when the player first
        // crosses `triggerX`. They never pause the timer or lock input, so they
        // stay invisible to the ANY% leaderboard and are skippable by simply
        // running past. Copy stays factual and avoids overclaiming history.
        //   kind     which draw routine (see drawAllies)
        //   x, y     sprite top-left in world space (feet rest on the ground band)
        //   triggerX world x that fires the ambient line (slightly ahead of the
        //            sprite so the line reads as you arrive; offset from zone and
        //            checkpoint boundaries so it never clobbers those toasts)
        //   name     who the cameo is — kept as readable metadata for the data row
        //   line     the one-shot ambient toast text shown when triggerX is crossed
        allies: [
          // Zone 1 FIRST SEND — Hal Finney receiving the first coins ever sent.
          { kind: "hal", x: 340, y: 182, triggerX: 290, name: "HAL FINNEY", line: "Hal Finney: got the coins — thanks!" },
          // Zone 6 THE NETWORK — early builders bringing more nodes online. Placed
          // at x:4930 so it sits clear of the zone-6 fud patrol (maxX 4920) while
          // staying on ground segment [4520,440] (spans 4520–4960).
          { kind: "nodes", x: 4930, y: 184, triggerX: 4880, name: "EARLY BUILDERS", line: "Early builders: more nodes online." }
        ]
      }
    },
    {
      // Level 3 — "THE INTERNET OF MONEY". The evangelist era: taking the word
      // on tour, Andreas Antonopoulos-style — conference stages in big cities,
      // the Mallers' living-room meetup in Chicago, sats collected talk by talk,
      // while bank lobbyists and three-letter agencies try to shut it down and
      // fail, because the network is too big to stop. Distinct mechanic =
      // CROWD SURGE pads (the "crowd" platform kind): rows of supporters that
      // launch you far higher than any jump — the people literally carry you.
      // Like Confirmation Blocks, the pads are fully deterministic (a fixed
      // impulse, no randomness), so timed attempts stay fair.
      id: "internet-of-money",
      title: "THE INTERNET OF MONEY",
      description: "Take the word on tour — talks, meetups, and sats from Chicago to the world.",
      // "tour" theme: a world-tour dusk that warms zone by zone into sunrise —
      // landmark skylines in the far parallax, and a near-layer crowd whose
      // heads light up orange as adoption spreads. SATS/TALK collectibles,
      // megaphone tour-stop checkpoints, and a globe goal.
      theme: "tour",
      worldW: 6000,
      goal: { x: 5902, y: 128, w: 22, h: 48 },
      labels: { coin: "SATS", pageStat: "TALKS", pageNote: "Talk" },
      zones: [
        { x: 0, name: "FIRST TALK", sky: "#3a2f4e", sky2: "#1c1530", ground: "#3e3450", accent: "#f7931a", text: "2013: one talk turns a room of skeptics curious." },
        { x: 820, name: "WORLD TOUR", sky: "#4e3358", sky2: "#251536", ground: "#45374f", accent: "#ffd166", text: "City to city, the same question: what is money?" },
        { x: 1700, name: "THE LIVING ROOM", sky: "#5c3a50", sky2: "#2b1830", ground: "#4a3a44", accent: "#36bd63", text: "Chicago: a living-room meetup. Bring folding chairs." },
        { x: 2600, name: "BANKER PUSHBACK", sky: "#6b4448", sky2: "#331f26", ground: "#54423c", accent: "#d64533", text: "The banks push back. The message keeps moving." },
        { x: 3500, name: "THE CRACKDOWN", sky: "#75504a", sky2: "#3a2521", ground: "#5a463a", accent: "#8d6de8", text: "Three-letter agencies watch. Nodes keep syncing." },
        { x: 4400, name: "NO OFF SWITCH", sky: "#8a6a4e", sky2: "#45301f", ground: "#2f8d50", accent: "#36bd63", text: "Too many nodes, too many minds. No off switch." },
        { x: 5300, name: "INTERNET OF MONEY", sky: "#e08a4a", sky2: "#7a3d2a", ground: "#2f8d50", accent: "#f7931a", text: "Not just money — the internet of money." }
      ],
      layout: {
        // Ground segments with 80px pits, except the 180px gap at 4020–4200:
        // too wide for any jump and bridged only by the CROWD SURGE pad floating
        // mid-gap — Level 3's signature crossing (crowd-surf it or fall).
        ground: [
          [0, 700], [780, 500], [1360, 480], [1920, 560], [2560, 520],
          [3160, 500], [3740, 280], [4200, 420], [4700, 540], [5320, 680]
        ],
        platforms: [
          [260, 152, 72, 14, "ledger"], [400, 126, 56, 14, "question"],
          // Teaching pad: on safe ground under a high sat arc, so the first
          // crowd surge is a reward, never a requirement.
          [560, 164, 40, 10, "crowd"],
          [880, 150, 70, 14, "ledger"], [1050, 128, 56, 14, "question"],
          [1200, 148, 64, 14, "ledger"],
          // Bonus pad guarding a high TALK — optional, the route never needs it.
          [1480, 164, 44, 10, "crowd"],
          [1780, 146, 70, 14, "ledger"], [1960, 130, 56, 14, "question"],
          [2160, 150, 74, 14, "ledger"], [2360, 126, 60, 14, "ledger"],
          [2680, 148, 76, 14, "question"], [2860, 124, 62, 14, "ledger"],
          [3080, 150, 72, 14, "ledger"], [3280, 130, 64, 14, "question"],
          [3580, 146, 70, 14, "ledger"], [3800, 128, 60, 14, "question"],
          // The signature crossing: the only foothold in the 180px gap. Landing
          // on it auto-launches (CROWD_BOUNCE), carrying you to the far edge;
          // missing it drops you into the pit. Bouncing straight up lands you
          // back on the pad, so a hesitant crossing is retryable, not fatal.
          [4080, 166, 48, 10, "crowd"],
          [4480, 148, 72, 14, "ledger"], [4660, 124, 58, 14, "question"],
          // Second bonus pad under the level's highest TALK.
          [4840, 162, 44, 10, "crowd"],
          [5000, 148, 70, 14, "ledger"], [5160, 128, 60, 14, "question"],
          [5420, 150, 74, 14, "ledger"], [5600, 128, 62, 14, "question"],
          [5760, 150, 66, 14, "ledger"]
        ],
        blockStacks: [
          [640, 2], [1240, 2], [2440, 2], [3560, 2], [4940, 3], [5700, 2]
        ],
        // SATS — tips tossed to the speaker, scattered along the route plus
        // high arcs above each crowd pad so surges pay out.
        coinArcs: [
          [170, 128, 5], [560, 96, 5], [900, 122, 6], [1230, 108, 5],
          [1500, 92, 5], [1820, 118, 6], [2200, 112, 5], [2700, 120, 6],
          [3120, 112, 5], [3600, 118, 5], [4084, 128, 5], [4520, 120, 6],
          [4856, 88, 5], [5440, 122, 5], [5780, 110, 6]
        ],
        // TALKS — nine microphones, roughly one stage per stop; the high ones
        // (x1495, x4850) are crowd-surge bonuses and the x4104 one is grabbed
        // mid-flight while crossing the signature gap.
        pages: [
          [500, 150], [1495, 100], [1990, 116], [2390, 112], [2890, 110],
          [3830, 114], [4104, 118], [4850, 84], [5560, 130]
        ],
        // suit/agent patrol the pushback; wiretap is the fast, higher-value
        // stompable threat and only appears from THE CRACKDOWN on. Zone 3 (the
        // living room) is deliberately light — meetups are friendly territory.
        // The 4200–4270 band after the signature gap is kept enemy-free so a
        // clean crowd-surf crossing is always bankable (Level 2 playtest rule).
        enemies: [
          [430, 178, 380, 540, "suit"], [1000, 178, 940, 1120, "agent"],
          [1880, 178, 1800, 2080, "suit"], [2760, 178, 2660, 2960, "suit"],
          [3300, 178, 3220, 3440, "agent"], [3800, 178, 3750, 3980, "wiretap"],
          [4310, 178, 4270, 4560, "suit"], [4720, 178, 4640, 4980, "wiretap"],
          [5480, 178, 5400, 5680, "suit"], [5780, 178, 5730, 5880, "agent"]
        ],
        // Red-tape barriers — the paperwork walls thrown in the messenger's way.
        // Same engine hazard as L1 spikes; placed clear of every patrol range.
        hazards: [
          [660, 190, 36, 15], [1150, 190, 40, 15], [2110, 190, 42, 15],
          [3020, 190, 42, 15], [3470, 190, 38, 15], [5060, 190, 42, 15]
        ],
        // Six tour stops opening zones 2–7 (zone 1 is the spawn) — back to
        // Level 1's six-split shape but over a longer world.
        checkpoints: [
          { x: 860, y: 172, index: 1, name: "WORLD TOUR" },
          { x: 1740, y: 172, index: 2, name: "THE LIVING ROOM" },
          { x: 2640, y: 172, index: 3, name: "BANKER PUSHBACK" },
          { x: 3540, y: 172, index: 4, name: "THE CRACKDOWN" },
          { x: 4440, y: 172, index: 5, name: "NO OFF SWITCH" },
          { x: 5340, y: 172, index: 6, name: "INTERNET OF MONEY" }
        ],
        allies: [
          // Zone 3 THE LIVING ROOM — Jack & Bill Mallers hosting the Chicago
          // meetup on their couch. x:2120 sits clear of the zone-3 suit patrol
          // (maxX 2080) and under no platform; trigger offset from the zone
          // (1700) and checkpoint (1740/2640) boundaries.
          { kind: "mallers", x: 2120, y: 182, w: 26, h: 22, triggerX: 2070, name: "JACK & BILL MALLERS", line: "Jack & Bill Mallers: meetup's in our living room." },
          // Zone 6 NO OFF SWITCH — the crowd itself, keys in hand. On ground
          // segment [4700,540] past the wiretap patrol (maxX 4980) and the
          // red-tape hazard (5060–5102); trigger clear of zone 7 (5300).
          { kind: "crowd", x: 5150, y: 182, w: 32, h: 22, triggerX: 5115, name: "THE CROWD", line: "The crowd: we hold our own keys now." }
        ]
      }
    },
    {
      // Level 4 — "SHITCOIN CITY". The 2019-2022 mania: LUNA, FTX, 100x
      // leverage, a token for everything — and one everyday person walking
      // through it all, unbothered, stacking sats. This level introduces
      // mode: "overworld": a top-down tile city (Zelda / NES-TMNT overworld
      // view) where you walk in four directions, pass the era's loudest
      // voices (proximity dialog, never blocking), and collect sats — then
      // step through venue doors into side-view beat-em-up interiors that run
      // on the existing platformer engine. Clear every venue (stomp all the
      // shills inside) to open the COLD STORAGE vault, the level's exit.
      // Timer/splits/deaths follow the normal rules; each venue clear records
      // a split, so the ANY% category stays coherent.
      id: "shitcoin-city",
      title: "SHITCOIN CITY",
      description: "2021 mania: a shill on every corner. Stay focused, stack sats, clear the venues.",
      theme: "mania",
      mode: "overworld",
      labels: { coin: "SATS", pageStat: "STASHES", pageNote: "Stash" },
      // worldW/goal are unused in the overworld itself (the tile map defines
      // its own bounds; each venue interior carries its own exit box), but the
      // fields stay present so generic readers never see undefined.
      worldW: 512,
      goal: { x: 0, y: 0, w: 0, h: 0 },
      // Single HUD/scenery zone for the overworld; venue interiors swap in
      // their own zone while you are inside.
      zone: { name: "SHITCOIN CITY", sky: "#2a2438", sky2: "#141020", ground: "#565d63", accent: "#8d6de8", text: "2021: a shill on every corner. Stack sats. Clear the venues." },
      spawn: { tx: 8, ty: 12 },
      // Tile legend: '#' building (solid; south faces render as walls),
      // '~' water (solid), '.' street, 'o' manhole (decor), 'c' sat pickup,
      // '1'-'4' venue doors (walk in to enter), 'X' the exit vault (opens
      // once every venue is cleared). Rows are validated for equal length on
      // load so a map typo fails loudly instead of rendering garbage.
      map: [
        "################################",
        "#..............................#",
        "#.#####...c...#####...c..#####.#",
        "#.#####.......#####......#####.#",
        "#.##1##.......##2##......##3##.#",
        "#.....c...o..............c.....#",
        "#..............................#",
        "#...####.......#####......c....#",
        "#...####...c...#####...####....#",
        "#...####.......##4##...####....#",
        "#..........................o...#",
        "#..o.....c.....................#",
        "#..............................#",
        "#~~~~~....#####....c....####...#",
        "#~~~~~....#####.........####...#",
        "#~~~~~....#####.........####...#",
        "#~~~~~.c..........o.......c....#",
        "#~~~~~~..............c.........#",
        "#~~~~~~....###............###..#",
        "#~~~~~~....###.....c......#X#..#",
        "#~~~~~~~.......................#",
        "#~~~~~~~~..c......o......c.....#",
        "#~~~~~~~~......................#",
        "################################"
      ],
      // Era voices. Proximity-triggered ambient dialog only — the lines queue
      // through the existing non-blocking toast, fire once per run, and never
      // lock input or pause the timer, so the player literally walks past the
      // noise. Every exchange ends with the player refocusing on sats.
      npcs: [
        { kind: "dokwon", tx: 3, ty: 5, name: "DO KWON", lines: ["Do Kwon: LUNA never goes down. 20% yield, forever.", "You: cool story. Stacking sats."] },
        { kind: "sbf", tx: 18, ty: 5, name: "SBF", lines: ["SBF: FTX is fine. The funds are... around.", "You: not your keys, not your coins."] },
        { kind: "vitalik", tx: 12, ty: 11, name: "VITALIK", lines: ["Vitalik: Ethereum scales right after the merge.", "You: neat. Still stacking sats."] },
        { kind: "influencer", tx: 21, ty: 10, name: "INFLUENCER", lines: ["Influencer: my new token is a guaranteed 100x, ser.", "You: hard pass. Sats only."] },
        { kind: "maxi", tx: 10, ty: 17, name: "MAXI", lines: ["Maxi: tick tock, next block. Stay humble.", "You: tick tock."] },
        // The warner outside FTX ARENA (door 2) — flags the shitcoin shooters
        // before the first room that has them.
        { kind: "warner", tx: 14, ty: 5, name: "SHAKEN TRADER", lines: ["Trader: careful in there — turrets shoot shitcoins!", "Trader: jump the coins, stomp the guns.", "You: noted. Sats don't flinch."] }
      ],
      // Venue interiors, keyed by their door tile. Each is a short side-view
      // room on the shared platformer engine: enter left, fight across, grab
      // the WHALE STASH, leave through the right EXIT. A venue counts as
      // cleared when every enemy in it is stomped; leaving early is allowed
      // but resets the room's enemies for the next entry.
      venues: {
        "1": {
          key: "1", index: 1, name: "LUNA LOUNGE", worldW: 880, spawnX: 22,
          zone: { name: "LUNA LOUNGE", sky: "#1d3a38", sky2: "#0b191c", ground: "#25443c", accent: "#36bd63", text: "Do Kwon's lounge: 20% yield forever, they say. Clear it." },
          goal: { x: 842, y: 140, w: 20, h: 64 },
          // The teaching room: longer floor, one pit to jump, one spike strip,
          // patrol enemies only — no shooters yet (the warner outside door 2
          // flags where those start).
          layout: {
            ground: [[0, 340], [420, 460]],
            platforms: [
              [170, 150, 64, 14, "ledger"], [300, 128, 56, 14, "question"],
              // Bridge pad over the 80px pit at 340-420.
              [352, 158, 56, 14, "ledger"],
              [470, 148, 66, 14, "ledger"], [620, 126, 56, 14, "question"],
              [740, 150, 62, 14, "ledger"]
            ],
            coinArcs: [[100, 126, 4], [300, 108, 5], [360, 132, 3], [600, 110, 5]],
            pages: [[770, 126]],
            enemies: [
              [130, 178, 90, 240, "shiller"], [280, 178, 250, 335, "shiller"],
              [500, 178, 440, 610, "degen"], [700, 178, 650, 820, "shiller"]
            ],
            hazards: [[560, 190, 40, 15]]
          }
        },
        "2": {
          key: "2", index: 2, name: "FTX ARENA", worldW: 960, spawnX: 22,
          zone: { name: "FTX ARENA", sky: "#16204a", sky2: "#0a0f26", ground: "#232c4e", accent: "#4aa8f0", text: "Watch the shitcoin shooters — hop the coins, stomp the guns." },
          goal: { x: 922, y: 140, w: 20, h: 64 },
          // First shooter room: two shitgun turrets cover the long stretches;
          // their coins fly at chest height so a jump clears them. Two pits.
          layout: {
            ground: [[0, 300], [380, 320], [780, 180]],
            platforms: [
              [150, 150, 60, 14, "ledger"], [250, 128, 56, 14, "question"],
              [312, 158, 56, 14, "ledger"],
              [440, 148, 68, 14, "ledger"], [560, 126, 58, 14, "question"],
              [706, 156, 62, 14, "ledger"],
              [820, 148, 60, 14, "ledger"]
            ],
            coinArcs: [[110, 128, 4], [330, 134, 3], [460, 120, 5], [700, 128, 4], [850, 118, 4]],
            pages: [[886, 124]],
            enemies: [
              [140, 178, 100, 250, "rugpull"],
              // Turret on the mid stretch, then a patroller pushing you into
              // its firing line, then a second turret guarding the exit.
              [600, 178, 600, 600, "shitgun"],
              [460, 178, 400, 560, "shiller"],
              [900, 178, 900, 900, "shitgun"],
              [820, 178, 790, 880, "degen"]
            ],
            hazards: [[520, 190, 38, 15]]
          }
        },
        "3": {
          key: "3", index: 3, name: "LEVERAGE CASINO", worldW: 1040, spawnX: 22,
          zone: { name: "LEVERAGE CASINO", sky: "#3a2b18", sky2: "#1c1408", ground: "#4a3a22", accent: "#ffd166", text: "100x or nothing — and the house shoots back. Clear the floor." },
          goal: { x: 1002, y: 140, w: 20, h: 64 },
          // The platforming gauntlet: three pits, high question blocks, fast
          // degens, and a turret covering the last approach.
          layout: {
            ground: [[0, 260], [340, 280], [700, 140], [920, 120]],
            platforms: [
              [160, 150, 62, 14, "ledger"], [272, 156, 58, 14, "ledger"],
              [380, 128, 56, 14, "question"], [520, 148, 66, 14, "ledger"],
              [630, 158, 60, 14, "ledger"],
              [760, 126, 56, 14, "question"], [848, 154, 62, 14, "ledger"],
              [940, 128, 56, 14, "question"]
            ],
            coinArcs: [[120, 126, 4], [290, 132, 3], [420, 108, 5], [650, 132, 3], [770, 104, 4], [950, 110, 4]],
            pages: [[964, 106]],
            enemies: [
              [150, 178, 110, 250, "degen"], [420, 178, 350, 560, "degen"],
              [560, 178, 500, 610, "shiller"],
              [730, 178, 710, 830, "degen"],
              [960, 178, 960, 960, "shitgun"]
            ],
            hazards: [[470, 190, 38, 15], [745, 190, 40, 15]]
          }
        },
        "4": {
          key: "4", index: 4, name: "ICO TOWER", worldW: 1120, spawnX: 22,
          zone: { name: "ICO TOWER", sky: "#33204a", sky2: "#170e24", ground: "#3c2a52", accent: "#8d6de8", text: "Grab the SAT CANNON — blast the token walls and clear the tower." },
          goal: { x: 1082, y: 140, w: 20, h: 64 },
          // The cannon room: you carry the SAT CANNON here (X or F fires).
          // Token barricades wall off the route and only shots break them;
          // turrets trade fire with you across each barricade.
          weapon: "satcannon",
          layout: {
            ground: [[0, 480], [560, 560]],
            platforms: [
              [150, 150, 60, 14, "ledger"], [280, 130, 58, 14, "question"],
              [430, 148, 62, 14, "ledger"], [492, 158, 56, 14, "ledger"],
              [650, 128, 56, 14, "question"], [790, 150, 62, 14, "ledger"],
              [950, 128, 56, 14, "question"]
            ],
            coinArcs: [[110, 128, 4], [350, 118, 5], [610, 112, 4], [830, 120, 4], [1000, 112, 4]],
            pages: [[1036, 106]],
            enemies: [
              [140, 178, 100, 230, "shiller"],
              [330, 178, 330, 330, "shitgun"],
              [410, 178, 375, 445, "rugpull"],
              [740, 178, 740, 740, "shitgun"],
              [800, 178, 780, 900, "degen"],
              [1010, 178, 1010, 1010, "shitgun"],
              [980, 178, 960, 1050, "shiller"]
            ],
            hazards: [[600, 190, 40, 15]],
            // Destructible token walls: [x, height-in-blocks]. 4 blocks tall so
            // a plain jump can't clear one — the cannon is the way through (3
            // hits each). Each wall has a shitgun dug in behind it; enemy shots
            // die on solids, so the trade-fire starts the moment a wall drops.
            // Placed clear of every patrol and pit so enemies never clip in.
            barricades: [[250, 4], [712, 4], [925, 4]]
          }
        }
      }
    },
    {
      // Level 5 — "WALL STREET". The institutional-adoption era: the same
      // bankers who mocked Bitcoin now custody it, Saylor buys every dip,
      // and Larry Fink files the ETF. This is Level 4's overworld formula
      // scaled up into a New York style financial district — a bigger tile
      // map with a park, crosswalks, steaming manholes, water towers, and
      // deterministic taxi traffic that costs a life on contact. Inside the
      // four buildings, though, the welcome is cold: MATRIX-STYLE AGENTS in
      // suits and shades patrol marble lobbies trying to bounce you out.
      // Each venue is a MULTI-FLOOR building (venue.floors): stairwell goals
      // chain floors together, so you climb UP to a roof exit or descend DOWN
      // to a vault exit. A venue clears only when every agent across ALL
      // floors was stomped in one visit (state.visitKills); leaving resets
      // the building. Clear all four to wake the CHARGING BULL and finish.
      id: "wall-street",
      title: "WALL STREET",
      description: "2024: institutions pile in. Clear four towers, dodge taxis, wake the Bull.",
      theme: "wallstreet",
      mode: "overworld",
      labels: { coin: "SATS", pageStat: "KEYS", pageNote: "Key" },
      worldW: 512,
      goal: { x: 0, y: 0, w: 0, h: 0 },
      zone: { name: "WALL STREET", sky: "#3a4356", sky2: "#1c2130", ground: "#565d63", accent: "#f7931a", text: "2024: Wall Street piles in. The agents want you out." },
      spawn: { tx: 8, ty: 20 },
      // Tile legend (extends Level 4's): '#' building, '~' water (both solid),
      // 'g' park grass (walkable), 't' tree (solid), 'z' crosswalk (decor),
      // '.' street, 'o' steaming manhole, 'c' sat pickup, '1'-'4' venue doors,
      // 'X' the Charging Bull exit. Rows validated for equal length on load.
      map: [
        "~######################################~",
        "~##..####..#####..#####..#####..####...~",
        "~##..####..#####..#####..#####..####...~",
        "~##..####..#####..#####..#####..####...~",
        "~##..####..#####..##1##..#####..####...~",
        "~.c....c..o..c..........o..c......c....~",
        "~.........o.........c...o..............~",
        "~##..####..tgggt..#####..#####..####...~",
        "~##..####..gcggg..#####..#####..####...~",
        "~##..####..gg~~g..#####..#####..####...~",
        "~##..####..tggcg..#####..#####..####...~",
        "~##..####..ggggg..##4##..#####..####...~",
        "~..zz.c..zz..c..zz.....zz..c..zz..c.zzz~",
        "~...o............c.....o.......o.......~",
        "~##..####..#####..#####..#####..####...~",
        "~##..####..#####..#####..#####..#..#...~",
        "~##..####..#####..#####..#####..#.X#...~",
        "~##..####..#####..#####..#####..#..#...~",
        "~##..#2##..#####..#####..#####..#.##...~",
        "~.c.....c.............................o~",
        "~..zz....zz.....zz..c..zz....czz....zzz~",
        "~##..####..#####..#####..tgggt..####...~",
        "~##..####..#####..#####..gcggg..####...~",
        "~##..####..#####..#####..gg~gg..####...~",
        "~##..####..#####..#####..gggcg..####...~",
        "~##..####..##3##..#####..ggggt..####...~",
        "~.....c..........o..c......c...........~",
        "~........o...c...................c.....~",
        "~....c...............c...............c.~",
        "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
      ],
      // Adoption-era voices on the street. Proximity ambient dialog only —
      // never blocks input or the timer. Ends on the player stacking sats.
      npcs: [
        { kind: "fink", tx: 18, ty: 6, name: "LARRY FINK", lines: ["Larry Fink: Bitcoin is here to stay. Our clients asked.", "You: welcome to the network."] },
        { kind: "saylor", tx: 21, ty: 6, name: "MICHAEL SAYLOR", lines: ["Saylor: we bought more. Then more. There is no top.", "You: conviction noted."] },
        // The warner outside BLACKROCK TOWER (door 1) flags the agents inside.
        { kind: "warner", tx: 22, ty: 5, name: "TOWER GUARD", lines: ["Guard: suits inside keep tossing visitors out.", "Guard: stomp their heads. Watch for shooters.", "You: they cannot eject the network."] },
        { kind: "vendor", tx: 12, ty: 6, name: "VENDOR", lines: ["Vendor: hot dogs now cost 2,000 sats. Progress.", "You: cheap at twice the price."] },
        { kind: "banker", tx: 19, ty: 13, name: "BANKER", lines: ["Banker: we mocked it in 2013. Now we custody it.", "You: funny how that works."] },
        { kind: "analyst", tx: 22, ty: 13, name: "ANALYST", lines: ["Analyst: ETFs approved, supply halved. Do the math.", "You: the math was always there."] },
        { kind: "cabbie", tx: 6, ty: 20, name: "CABBIE", lines: ["Cabbie: Wall Street? Everybody asks for Bitcoin now.", "You: then drive fast."] },
        { kind: "maxi", tx: 33, ty: 20, name: "MAXI", lines: ["Maxi: they finally came to us. Stay humble.", "You: tick tock."] }
      ],
      // Taxi routes over the avenues/streets. Ping-pong on a fixed clock —
      // no randomness, ANY% safe. Touching a cab costs a life and respawns
      // you at the spawn curb. Routes avoid the spawn tile by a safe margin.
      taxis: [
        { axis: "v", lane: 3, from: 5, to: 27, speed: 64, phase: 0 },
        { axis: "v", lane: 31, from: 5, to: 27, speed: 76, phase: 260 },
        { axis: "h", row: 12, from: 3, to: 38, speed: 88, phase: 140 }
      ],
      // Multi-floor venues. Each floor carries its own zone, layout, and a
      // goal that is either a stairwell ({kind: up|down, goalTo}) or the
      // final EXIT. Floors list top-to-bottom as played; the last floor of
      // every venue holds the VAULT KEY stash and the exit.
      venues: {
        "1": {
          key: "1", index: 1, name: "BLACKROCK TOWER",
          // The UP climb: lobby → trading floor → boardroom roof exit.
          floors: [
            {
              name: "LOBBY", worldW: 800, spawnX: 22,
              zone: { name: "BLACKROCK · LOBBY", sky: "#a89c82", sky2: "#6a6250", ground: "#5c5248", accent: "#f7931a", text: "The lobby of adoption. The agents didn't get the memo." },
              goal: { x: 742, y: 140, w: 30, h: 64, kind: "up" }, goalTo: 1,
              hint: "Take the stairs up.",
              layout: {
                ground: [[0, 800]],
                platforms: [
                  [180, 158, 64, 14, "ledger"], [330, 136, 56, 14, "question"],
                  [480, 152, 66, 14, "ledger"], [640, 130, 54, 14, "ledger"]
                ],
                coinArcs: [[120, 128, 4], [340, 112, 5], [500, 116, 4], [650, 106, 4]],
                pages: [],
                enemies: [
                  [150, 178, 110, 260, "agent"], [300, 178, 270, 430, "suit"],
                  [520, 178, 470, 640, "agent"], [680, 178, 630, 726, "agent"]
                ],
                hazards: []
              }
            },
            {
              name: "TRADING FLOOR", worldW: 920, spawnX: 22,
              zone: { name: "BLACKROCK · TRADING FLOOR", sky: "#a89c82", sky2: "#6a6250", ground: "#5c5248", accent: "#f7931a", text: "Traders, terminals, tails. Elevator shafts are open." },
              goal: { x: 852, y: 140, w: 30, h: 64, kind: "up" }, goalTo: 2,
              hint: "One floor up. Mind the shafts.",
              layout: {
                ground: [[0, 380], [460, 460]],
                platforms: [
                  [160, 150, 62, 14, "ledger"], [300, 128, 56, 14, "question"],
                  [392, 158, 56, 14, "ledger"],
                  [520, 146, 68, 14, "ledger"], [660, 124, 58, 14, "question"],
                  [800, 150, 62, 14, "ledger"]
                ],
                coinArcs: [[130, 126, 4], [310, 108, 5], [420, 132, 3], [540, 120, 5], [680, 102, 4]],
                pages: [],
                enemies: [
                  [200, 178, 140, 320, "agent"], [350, 178, 300, 450, "suit"],
                  [560, 178, 500, 680, "agent"], [750, 178, 700, 836, "suit"]
                ],
                hazards: [[600, 190, 38, 15]]
              }
            },
            {
              name: "BOARDROOM", worldW: 860, spawnX: 22,
              zone: { name: "BLACKROCK · BOARDROOM", sky: "#a89c82", sky2: "#6a6250", ground: "#5c5248", accent: "#f7931a", text: "The boardroom. Even here, they want you out." },
              goal: { x: 792, y: 140, w: 30, h: 64, kind: "exit" },
              hint: "Top floor. Roof door is the way out.",
              layout: {
                ground: [[0, 360], [440, 420]],
                platforms: [
                  [170, 148, 64, 14, "ledger"], [280, 126, 56, 14, "question"],
                  [372, 156, 56, 14, "ledger"],
                  [452, 144, 66, 14, "ledger"], [600, 122, 56, 14, "question"],
                  [730, 148, 62, 14, "ledger"]
                ],
                coinArcs: [[140, 124, 4], [300, 106, 5], [470, 118, 5], [620, 98, 4]],
                pages: [[760, 124]],
                enemies: [
                  [190, 178, 130, 300, "suit"], [400, 178, 360, 520, "agent"],
                  [560, 178, 530, 660, "agent"], [700, 178, 660, 770, "suit"]
                ],
                hazards: [[500, 190, 36, 15]]
              }
            }
          ]
        },
        "2": {
          key: "2", index: 2, name: "FIAT NATIONAL BANK",
          // The DOWN dive: marble hall → security corridor → the vault.
          floors: [
            {
              name: "MARBLE HALL", worldW: 880, spawnX: 22,
              zone: { name: "FIAT NATIONAL · MARBLE HALL", sky: "#9aa0ac", sky2: "#5a6070", ground: "#4e545c", accent: "#f7931a", text: "Marble halls, reversible promises. Head down." },
              goal: { x: 822, y: 140, w: 30, h: 64, kind: "down" }, goalTo: 1,
              hint: "The stairs go DOWN here.",
              layout: {
                ground: [[0, 400], [480, 400]],
                platforms: [
                  [180, 152, 64, 14, "ledger"], [320, 130, 56, 14, "question"],
                  [392, 158, 56, 14, "ledger"],
                  [540, 148, 66, 14, "ledger"], [690, 126, 56, 14, "question"],
                  [800, 150, 60, 14, "ledger"]
                ],
                coinArcs: [[130, 128, 4], [330, 110, 5], [410, 132, 3], [560, 120, 5], [700, 104, 4]],
                pages: [],
                enemies: [
                  [160, 178, 110, 290, "suit"], [360, 178, 300, 460, "suit"],
                  [580, 178, 520, 700, "agent"], [740, 178, 700, 806, "suit"]
                ],
                hazards: []
              }
            },
            {
              name: "SECURITY CORRIDOR", worldW: 960, spawnX: 22,
              zone: { name: "FIAT NATIONAL · SECURITY", sky: "#9aa0ac", sky2: "#5a6070", ground: "#4e545c", accent: "#f7931a", text: "Vault defense: turrets and suits. Hop the shots." },
              goal: { x: 882, y: 140, w: 30, h: 64, kind: "down" }, goalTo: 2,
              hint: "Deeper. Watch the guns.",
              layout: {
                ground: [[0, 340], [420, 300], [800, 160]],
                platforms: [
                  [150, 150, 60, 14, "ledger"], [262, 156, 58, 14, "ledger"],
                  [352, 158, 56, 14, "ledger"],
                  [470, 146, 66, 14, "ledger"], [600, 124, 56, 14, "question"],
                  [722, 158, 56, 14, "ledger"]
                ],
                coinArcs: [[120, 126, 4], [370, 134, 3], [480, 120, 5], [610, 102, 4], [830, 116, 4]],
                pages: [],
                enemies: [
                  [140, 178, 100, 250, "agent"], [430, 178, 390, 560, "suit"],
                  [600, 178, 600, 600, "shitgun"], [700, 178, 650, 760, "suit"],
                  [880, 178, 880, 880, "shitgun"]
                ],
                hazards: [[540, 190, 40, 15]]
              }
            },
            {
              name: "THE VAULT", worldW: 840, spawnX: 22,
              zone: { name: "FIAT NATIONAL · THE VAULT", sky: "#9aa0ac", sky2: "#5a6070", ground: "#4e545c", accent: "#f7931a", text: "They kept gold here once. Take the key instead." },
              goal: { x: 774, y: 140, w: 30, h: 64, kind: "exit" },
              hint: "Grab the key. Get out.",
              layout: {
                ground: [[0, 840]],
                platforms: [
                  [170, 150, 62, 14, "ledger"], [300, 128, 56, 14, "question"],
                  [450, 146, 66, 14, "ledger"], [590, 124, 56, 14, "ledger"],
                  [720, 150, 60, 14, "ledger"]
                ],
                coinArcs: [[120, 126, 4], [320, 108, 5], [470, 120, 5], [610, 102, 4]],
                pages: [[600, 100]],
                enemies: [
                  [180, 178, 120, 280, "shitgun"], [320, 178, 290, 430, "agent"],
                  [500, 178, 460, 620, "suit"], [660, 178, 630, 750, "agent"],
                  [700, 178, 690, 740, "shitgun"]
                ],
                hazards: []
              }
            }
          ]
        },
        "3": {
          key: "3", index: 3, name: "LEGACY MEDIA HOUSE",
          // The paywall climb: the SAT CANNON room. Token barricades are
          // literal paywalls; only shots break them (3 hits each).
          weapon: "satcannon",
          floors: [
            {
              name: "LOBBY", worldW: 860, spawnX: 22,
              zone: { name: "LEGACY MEDIA · LOBBY", sky: "#a89a82", sky2: "#6a5e4c", ground: "#5a5044", accent: "#f7931a", text: "Paywalls everywhere. The SAT CANNON opens them." },
              goal: { x: 792, y: 140, w: 30, h: 64, kind: "up" }, goalTo: 1,
              hint: "Blast the paywalls — X/F fires.",
              layout: {
                ground: [[0, 860]],
                platforms: [
                  [170, 150, 60, 14, "ledger"], [310, 128, 56, 14, "question"],
                  [470, 148, 64, 14, "ledger"], [620, 126, 56, 14, "question"],
                  [760, 150, 60, 14, "ledger"]
                ],
                coinArcs: [[120, 126, 4], [330, 108, 5], [490, 122, 5], [640, 102, 4]],
                pages: [],
                enemies: [
                  [150, 178, 100, 230, "agent"], [400, 178, 360, 520, "rugpull"],
                  [700, 178, 660, 760, "agent"]
                ],
                hazards: []
              },
              barricades: [[250, 4], [560, 4]]
            },
            {
              name: "NEWSROOM", worldW: 1040, spawnX: 22,
              zone: { name: "LEGACY MEDIA · NEWSROOM", sky: "#a89a82", sky2: "#6a5e4c", ground: "#5a5044", accent: "#f7931a", text: "They print FUD. The turrets print back." },
              goal: { x: 972, y: 140, w: 30, h: 64, kind: "up" }, goalTo: 2,
              hint: "Upstairs. Mind the turrets.",
              layout: {
                ground: [[0, 460], [540, 500]],
                platforms: [
                  [160, 150, 62, 14, "ledger"], [290, 128, 56, 14, "question"],
                  [472, 158, 56, 14, "ledger"],
                  [600, 146, 68, 14, "ledger"], [740, 124, 58, 14, "question"],
                  [880, 150, 62, 14, "ledger"]
                ],
                coinArcs: [[130, 126, 4], [310, 108, 5], [490, 134, 3], [620, 120, 5], [760, 100, 4]],
                pages: [],
                enemies: [
                  [180, 178, 120, 300, "agent"], [380, 178, 330, 520, "rugpull"],
                  [560, 178, 560, 560, "shitgun"], [760, 178, 720, 880, "agent"],
                  [950, 178, 950, 950, "shitgun"], [900, 178, 880, 940, "suit"]
                ],
                hazards: [[640, 190, 38, 15]]
              },
              barricades: [[680, 4]]
            },
            {
              name: "ROOFTOP STUDIO", worldW: 900, spawnX: 22,
              zone: { name: "LEGACY MEDIA · ROOFTOP", sky: "#a89a82", sky2: "#6a5e4c", ground: "#5a5044", accent: "#f7931a", text: "Broadcast from the roof — then take the exit." },
              goal: { x: 832, y: 140, w: 30, h: 64, kind: "exit" },
              hint: "Roof door. Go.",
              layout: {
                ground: [[0, 380], [460, 440]],
                platforms: [
                  [170, 148, 64, 14, "ledger"], [300, 126, 56, 14, "question"],
                  [392, 158, 56, 14, "ledger"],
                  [520, 146, 66, 14, "ledger"], [660, 122, 56, 14, "question"],
                  [790, 150, 60, 14, "ledger"]
                ],
                coinArcs: [[130, 124, 4], [320, 106, 5], [410, 132, 3], [540, 120, 5], [680, 98, 4]],
                pages: [[820, 126]],
                enemies: [
                  [200, 178, 140, 320, "agent"], [420, 178, 380, 520, "rugpull"],
                  [580, 178, 540, 680, "agent"], [720, 178, 690, 810, "suit"]
                ],
                hazards: [[500, 190, 36, 15]]
              }
            }
          ]
        },
        "4": {
          key: "4", index: 4, name: "THE EXCHANGE",
          // The mixed climb: up to the gallery, then back DOWN to the members'
          // lounge exit. Longest building — the finale before the Bull.
          floors: [
            {
              name: "TRADING FLOOR", worldW: 1120, spawnX: 22,
              zone: { name: "THE EXCHANGE · FLOOR", sky: "#98a4b4", sky2: "#5a6474", ground: "#505a64", accent: "#f7931a", text: "Open outcry, closed minds. Gallery is upstairs." },
              goal: { x: 1052, y: 140, w: 30, h: 64, kind: "up" }, goalTo: 1,
              hint: "Gallery stairs, far side.",
              layout: {
                ground: [[0, 480], [560, 560]],
                platforms: [
                  [160, 150, 62, 14, "ledger"], [290, 128, 56, 14, "question"],
                  [492, 158, 56, 14, "ledger"],
                  [620, 146, 68, 14, "ledger"], [760, 124, 58, 14, "question"],
                  [900, 150, 62, 14, "ledger"], [1010, 128, 56, 14, "question"]
                ],
                coinArcs: [[120, 126, 4], [310, 108, 5], [510, 134, 3], [640, 120, 5], [780, 100, 5], [1030, 112, 4]],
                pages: [],
                enemies: [
                  [170, 178, 120, 300, "degen"], [400, 178, 350, 540, "agent"],
                  [600, 178, 570, 720, "degen"], [820, 178, 780, 940, "agent"],
                  [980, 178, 950, 1030, "suit"], [930, 178, 920, 960, "shitgun"]
                ],
                hazards: [[680, 190, 40, 15]]
              }
            },
            {
              name: "GALLERY", worldW: 1000, spawnX: 22,
              zone: { name: "THE EXCHANGE · GALLERY", sky: "#98a4b4", sky2: "#5a6474", ground: "#505a64", accent: "#f7931a", text: "Watch the floor from the gallery. Then descend." },
              goal: { x: 932, y: 140, w: 30, h: 64, kind: "down" }, goalTo: 2,
              hint: "Lounge is one flight down.",
              layout: {
                ground: [[0, 380], [460, 540]],
                platforms: [
                  [150, 146, 62, 14, "ledger"], [280, 124, 56, 14, "question"],
                  [372, 158, 56, 14, "ledger"],
                  [500, 144, 66, 14, "ledger"], [640, 122, 56, 14, "question"],
                  [770, 148, 62, 14, "ledger"], [890, 126, 56, 14, "question"]
                ],
                coinArcs: [[120, 122, 4], [300, 104, 5], [390, 132, 3], [520, 118, 5], [660, 98, 4]],
                pages: [],
                enemies: [
                  [160, 178, 110, 270, "agent"], [340, 178, 300, 470, "suit"],
                  [550, 178, 510, 700, "agent"], [720, 178, 690, 850, "suit"],
                  [860, 178, 850, 890, "shitgun"]
                ],
                hazards: [[600, 190, 38, 15]]
              }
            },
            {
              name: "MEMBERS LOUNGE", worldW: 940, spawnX: 22,
              zone: { name: "THE EXCHANGE · LOUNGE", sky: "#98a4b4", sky2: "#5a6474", ground: "#505a64", accent: "#f7931a", text: "Leather chairs, leather lungs. Take the exit." },
              goal: { x: 862, y: 140, w: 30, h: 64, kind: "exit" },
              hint: "Last door. End the run.",
              layout: {
                ground: [[0, 940]],
                platforms: [
                  [180, 152, 64, 14, "ledger"], [320, 130, 56, 14, "question"],
                  [470, 148, 66, 14, "ledger"], [620, 126, 56, 14, "question"],
                  [770, 150, 60, 14, "ledger"]
                ],
                coinArcs: [[140, 128, 4], [340, 110, 5], [490, 122, 5], [640, 104, 4]],
                pages: [[790, 126]],
                enemies: [
                  [200, 178, 140, 320, "suit"], [400, 178, 360, 520, "agent"],
                  [600, 178, 570, 700, "suit"], [780, 178, 750, 830, "agent"],
                  [480, 178, 470, 510, "shitgun"]
                ],
                hazards: []
              }
            }
          ]
        }
      }
    }
  ];

  LEVELS.push({
    id: "for-the-people",
    title: "FOR THE PEOPLE",
    description: "Four fighters. Eight districts. Pick up, throw down, fight for the people.",
    mode: "brawler",
    theme: "brawler",
    worldW: window.SatoshiBrawler.STAGE_WIDTH * window.SatoshiBrawler.STAGES.length,
    labels: { coin: "SATS", pageStat: "BLOCKS" },
    zones: [{ x: 0, name: "FOR THE PEOPLE" }],
    layout: { pages: window.SatoshiBrawler.STAGES.map((_, index) => index) }
  });

  let brawler = null;
  let selectedFighter = "jack";
  const brawlerArt = window.SatoshiBrawlerArt.create(ctx);
  const arcadeFields = Object.fromEntries(["name", "lives", "health", "hp", "power-name", "power", "power-state", "district", "wave", "time", "score", "dialogue", "item-hint"]
    .map((key) => [key, document.getElementById(`arcade-${key}`)]));

  function renderFighterPicker() {
    const picker = document.getElementById("fighter-select");
    for (const [id, character] of Object.entries(window.SatoshiBrawler.CHARACTERS)) {
      const option = document.createElement("label");
      option.className = "fighter-option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "fighter";
      radio.value = id;
      radio.checked = id === selectedFighter;
      radio.setAttribute("aria-label", `${character.name}. ${character.description}`);
      const portrait = document.createElement("canvas");
      portrait.width = 80;
      portrait.height = 104;
      portrait.setAttribute("aria-hidden", "true");
      window.SatoshiBrawlerArt.create(portrait.getContext("2d")).portrait(id);
      const name = document.createElement("strong");
      name.textContent = character.short;
      const move = document.createElement("span");
      move.textContent = character.move;
      option.append(radio, portrait, name, move);
      radio.addEventListener("change", () => {
        if (state.phase !== "title") return;
        selectedFighter = id;
        initLevel();
        syncHud(true);
      });
      picker.append(option);
    }
  }

  // The important text lives in the DOM at screen resolution, independent of
  // the pixel scenery. Only changed values are written during the game loop.
  function syncBrawlerHud() {
    const fight = brawler.state;
    const character = window.SatoshiBrawler.CHARACTERS[fight.characterId];
    const nearby = brawler.nearbyItem();
    const held = fight.player.held;
    const itemName = window.SatoshiBrawler.ITEMS[(held || nearby)?.kind || character.projectile].name;
    const remaining = fight.enemies.filter((enemy) => enemy.hp > 0).length;
    const values = {
      name: character.name,
      lives: `${state.lives} ${state.lives === 1 ? "life" : "lives"}`,
      hp: `${Math.ceil(fight.player.hp)}/${fight.player.maxHp}`,
      "power-name": character.special,
      "power-state": fight.special === 100 ? "C · READY" : `${fight.special}%`,
      district: `${fight.stage + 1}/${window.SatoshiBrawler.STAGES.length} · ${window.SatoshiBrawler.STAGES[fight.stage].name}`,
      wave: fight.waveClear ? "Fight clear · Move right →" : `Fight ${fight.wave + 1}/2 · ${remaining} ${remaining === 1 ? "enemy" : "enemies"}`,
      time: formatTime(state.time),
      score: `Score ${state.score.toLocaleString()}`,
      dialogue: fight.messageTime > 0 ? fight.message : "Dodge into another lane. Jump over low throws. Hit E to grab or throw.",
      "item-hint": held ? `Holding ${itemName} · E to throw` : nearby ? `E · Pick up ${itemName}` : `E · Throw ${itemName}`
    };
    for (const [key, value] of Object.entries(values)) if (arcadeFields[key].textContent !== value) arcadeFields[key].textContent = value;
    arcadeFields.health.max = fight.player.maxHp;
    arcadeFields.health.value = fight.player.hp;
    arcadeFields.power.value = fight.special;
    const throwButton = document.querySelector('[data-action="throw"]');
    throwButton.textContent = !held && nearby ? "GRAB" : "THROW";
    throwButton.setAttribute("aria-label", values["item-hint"]);
  }

  // Active level's scenery bands. Mirrors getCurrentLevel().zones so the existing
  // zone-index logic keeps working unchanged; assigned in initLevel.
  let zones = [];

  const state = {
    phase: "title",
    paused: false,
    levelIndex: 0,
    // Overworld (Level 4) play state. subMode is "side" for classic levels and
    // flips between "overworld" (top-down city) and "venue" (side-view interior)
    // on an overworld level. venuesCleared/stashesTaken persist for the run so
    // re-entering a venue can reset its enemies without double-counting rewards.
    subMode: "side",
    venueKey: null,
    venuesCleared: [],
    stashesTaken: [],
    owReturn: null,
    // Multi-floor venues (Level 5): which floor of the venue is loaded, and how
    // many enemies were stomped across all floors of the current visit. A venue
    // clears only when visitKills reaches the venue's total enemy count.
    floorIndex: 0,
    visitKills: 0,
    // Ambient dialog queue: extra toast lines shown one after another as the
    // current toast expires (used for NPC exchanges). Never blocks input.
    toastQueue: [],
    cameraX: 0,
    cameraY: 0,
    time: 0,
    accumulator: 0,
    lastNow: 0,
    coins: 0,
    pages: 0,
    lives: 3,
    score: 0,
    checkpointX: 30,
    currentZone: 0,
    toast: "",
    toastTime: 0,
    shake: 0,
    // One-shot per full run: the first CROWD SURGE launch shows a teaching
    // toast so the mechanic explains itself without a modal. Reset in resetRun.
    crowdSurfed: false,
    completionTime: 0,
    deaths: 0,
    splits: [],
    bestSplits: {},
    lastRun: null,
    // The entry the player most recently submitted (the stored row, with its id),
    // so the leaderboard view can highlight "their" run. Null until a submit succeeds.
    lastSubmittedEntry: null,
    // Which level board the leaderboard view is currently showing, and where to
    // return when it closes ("title" or "results"). Both null while it is closed.
    leaderboardLevelId: null,
    leaderboardOrigin: null,
    hudCache: "",
    timerCache: ""
  };

  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    pulseWave: null,
    narrowPulseWave: null,
    noiseBuffer: null,
    enabled: loadSoundEnabled(),
    unlocked: false,
    resumePromise: null,
    musicActive: false,
    musicStep: 0,
    nextStepTime: 0,
    songId: null
  };

  // Original chiptune-style loops: pulse-wave lead, triangle bass, and tiny
  // noise drums. They aim for a bright NES platformer feel without copying any
  // existing game melody.
  const SONGS = {
    city: {
      bpm: 156,
      leadGain: 0.075,
      harmonyGain: 0.04,
      bassGain: 0.085,
      lead: noteRow(`
        E5 . G5 . C6 . G5 E5 D5 . F5 . A5 . F5 D5
        C5 . E5 G5 C6 . B5 G5 A5 . G5 E5 D5 . C5 .
        G5 . B5 . D6 . B5 G5 E5 . G5 . C6 . E6 D6
        C6 . A5 . F5 . D5 . G5 . E5 . C5 . . .
      `),
      harmony: noteRow(`
        . . C5 . . . E5 . . . D5 . . . F5 .
        . . E5 . G5 . . . F5 . E5 . D5 . . .
        . . G5 . . . B5 . . . G5 . . . C6 .
        . . A5 . . . F5 . . . E5 . C5 . . .
      `),
      bass: noteRow(`
        C3 . G2 . C3 . G2 . F2 . C3 . F2 . C3 .
        A2 . E2 . A2 . E2 . G2 . D3 . G2 . D3 .
        E2 . B2 . E3 . B2 . C3 . G2 . C3 . G2 .
        F2 . C3 . F2 . C3 . G2 . D3 . C3 . G2 .
      `)
    },
    network: {
      bpm: 138,
      leadGain: 0.07,
      harmonyGain: 0.038,
      bassGain: 0.088,
      lead: noteRow(`
        A4 . C5 . E5 . C5 A4 B4 . D5 . F5 . D5 B4
        C5 . E5 A5 G5 . E5 C5 B4 . D5 G5 F5 . D5 B4
        E5 . G5 . B5 . G5 E5 D5 . F5 . A5 . F5 D5
        C5 . E5 . A5 . G5 E5 D5 . C5 . B4 . A4 .
      `),
      harmony: noteRow(`
        . . A4 . . . C5 . . . B4 . . . D5 .
        . . C5 . E5 . . . D5 . B4 . . . B4 .
        . . E5 . . . G5 . . . F5 . . . A5 .
        . . C5 . . . E5 . . . D5 . B4 . A4 .
      `),
      bass: noteRow(`
        A2 . E2 . A2 . E2 . G2 . D3 . G2 . D3 .
        C3 . G2 . C3 . G2 . B2 . F#2 . B2 . F#2 .
        E2 . B2 . E3 . B2 . D3 . A2 . D3 . A2 .
        C3 . G2 . A2 . E2 . F2 . C3 . E2 . A2 .
      `)
    },
    // Level 3 "world tour" anthem: brighter and faster than the network-night
    // song — a travelling major-key lead that keeps landing back on C, like a
    // tour that keeps coming home to the same message. Original melody.
    tour: {
      bpm: 150,
      leadGain: 0.072,
      harmonyGain: 0.04,
      bassGain: 0.086,
      lead: noteRow(`
        C5 . E5 . G5 . A5 G5 E5 . C5 . D5 . E5 .
        F5 . A5 . C6 . A5 F5 G5 . E5 . C5 . D5 .
        E5 . G5 . B5 . C6 B5 G5 . E5 . D5 . E5 G5
        A5 . G5 E5 F5 . E5 D5 C5 . D5 . C5 . . .
      `),
      harmony: noteRow(`
        . . C5 . . . E5 . . . G4 . . . B4 .
        . . A4 . . . C5 . . . B4 . . . G4 .
        . . C5 . . . E5 . . . G5 . . . B4 .
        . . F5 . . . D5 . . . B4 . C5 . . .
      `),
      bass: noteRow(`
        C3 . G2 . C3 . E3 . F2 . C3 . F2 . G2 .
        F2 . C3 . F2 . A2 . G2 . D3 . G2 . B2 .
        C3 . G2 . E3 . C3 . A2 . E2 . A2 . E3 .
        F2 . C3 . D3 . A2 . G2 . D3 . C3 . G2 .
      `)
    },
    // Level 4 "mania" groove: a restless minor vamp with chromatic slips — the
    // casino-city buzz of 2021 — that keeps resolving back to a steady A minor
    // walk, the focused player moving through the noise. Original melody.
    // Level 4 "mania" groove: a restless minor vamp with chromatic slips — the
    // casino-city buzz of 2021 — that keeps resolving back to a steady A minor
    // walk, the focused player moving through the noise. Original melody.
    mania: {
      bpm: 144,
      leadGain: 0.07,
      harmonyGain: 0.036,
      bassGain: 0.09,
      lead: noteRow(`
        A4 . C5 . E5 . D#5 E5 G5 . E5 . C5 . B4 .
        A4 . C5 . E5 . G5 A5 G5 . E5 . D5 . C5 .
        F5 . E5 . D#5 . E5 . C5 . A4 . B4 . C5 .
        D5 . B4 . E5 . C5 . A4 . B4 . A4 . . .
      `),
      harmony: noteRow(`
        . . A4 . . . C5 . . . B4 . . . E4 .
        . . A4 . . . C5 . . . D5 . . . G4 .
        . . D5 . . . C5 . . . A4 . . . E4 .
        . . B4 . . . C5 . . . E4 . A4 . . .
      `),
      bass: noteRow(`
        A2 . E2 . A2 . E2 . F2 . C3 . E2 . E2 .
        A2 . E2 . A2 . E2 . G2 . D3 . G2 . G2 .
        D3 . A2 . D3 . A2 . F2 . C3 . E2 . E2 .
        E2 . B2 . E3 . B2 . A2 . E2 . A2 . E2 .
      `)
    },
    // Level 5 "wall street" strut: a bright, confident major-key walk with
    // brass-y pulse stabs — the institutional era arriving with briefcases.
    // It keeps circling home to C, like price and adoption both do now.
    // Original melody.
    wallstreet: {
      bpm: 148,
      leadGain: 0.072,
      harmonyGain: 0.04,
      bassGain: 0.088,
      lead: noteRow(`
        C5 . E5 G5 . G5 E5 C5 D5 . F5 A5 . A5 F5 D5
        E5 . G5 B5 . B5 G5 E5 F5 . A5 C6 . C6 A5 F5
        G5 . E5 C5 . D5 E5 F5 E5 . D5 C5 . B4 C5 D5
        E5 . C5 . G4 . C5 . . .
      `),
      harmony: noteRow(`
        . . E5 . . . G5 . . . F5 . . . A5 .
        . . G5 . . . B5 . . . A5 . . . C6 .
        . . E5 . . . G5 . . . F5 . . . D5 .
        . . C5 . . . E5 . . . D5 . C5 . . .
      `),
      bass: noteRow(`
        C3 . G2 . C3 . E3 . F2 . C3 . F2 . G2 .
        A2 . E3 . A2 . E3 . F2 . C3 . G2 . G2 .
        C3 . G2 . C3 . E3 . D3 . A2 . D3 . F3 .
        E3 . B2 . C3 . G2 . C3 . G2 . C3 . . .
      `)
    }
  };

  // An original slower, bass-led arcade groove for the street fights.
  SONGS.brawler = {
    bpm: 122, leadGain: 0.06, harmonyGain: 0.038, bassGain: 0.12,
    lead: noteRow(`
      E4 . G4 A4 . B4 . D5 B4 . A4 G4 E4 . . .
      E4 . G4 A4 . B4 D5 E5 . D5 B4 . A4 G4 . .
      A4 . C5 . E5 . D5 C5 B4 . G4 A4 . G4 E4 .
      B4 . A4 G4 . E4 . D4 E4 . G4 . E4 . . .
    `),
    harmony: noteRow(`
      . . B3 . . . E4 . . . G4 . . . E4 .
      . . B3 . . . E4 . . . G4 . . . B4 .
      . . E4 . . . A4 . . . D4 . . . G4 .
      . . F#4 . . . D4 . . . B3 . E4 . . .
    `),
    bass: noteRow(`
      E2 E2 . B2 . D3 E3 . E2 . G2 A2 B2 . G2 .
      E2 E2 . B2 . D3 E3 . E2 . G2 A2 B2 . D3 .
      A2 A2 . E3 . G3 A3 . G2 . D3 . G2 . A2 .
      B2 . B2 D3 . F#3 . D3 E2 E2 . G2 B2 . E3 .
    `)
  };

  // The active level definition. Declared after `state` (which it reads) to avoid
  // any temporal-dead-zone hazard, and guarded so a bad levelIndex fails loudly
  // with an actionable message instead of throwing a cryptic TypeError frames
  // later when a caller dereferences undefined.
  function getCurrentLevel() {
    const level = LEVELS[state.levelIndex];
    if (!level) {
      throw new Error(`No level at index ${state.levelIndex} (LEVELS.length=${LEVELS.length}); check state.levelIndex.`);
    }
    return level;
  }

  // Read a display label from the active level, falling back to the Level 1
  // default when a level does not override it. Keeps HUD, results, and pickup
  // copy data-driven so each level reads in its own terms (e.g. SATS vs BTC).
  function levelLabel(key, fallback) {
    const labels = getCurrentLevel().labels;
    // Nullish (not falsy) so a level can intentionally set an empty-string label.
    return labels && labels[key] != null ? labels[key] : fallback;
  }

  // Active level's visual theme, driving which backdrop/ground/collectible/
  // checkpoint/goal art family the draw* routines use. Defaults to "city" so a
  // level that omits `theme` renders exactly like Level 1.
  function getTheme() {
    return getCurrentLevel().theme || "city";
  }

  // Personal bests persist across reloads in localStorage under a versioned key.
  // Bumping the version (or calling resetBests, exposed below for testing)
  // invalidates older shapes so corrupt or legacy data never breaks a run.
  const BESTS_KEY = "8bit-satoshi:bests:v1";

  // Read the full bests map, tolerating missing, unavailable, or corrupt
  // storage by falling back to an empty map. Storage access itself can throw
  // (private mode, disabled cookies), so the whole read is guarded.
  function loadBests() {
    try {
      const raw = localStorage.getItem(BESTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveBests(bests) {
    try {
      localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
    } catch (err) {
      // Storage unavailable or over quota. Persistence now also gates level
      // unlock, so surface the failure (a cleared level may not unlock on the
      // next load) instead of failing completely silently.
      console.warn("8-Bit Satoshi: could not persist bests; progress and level unlock may not be saved.", err);
    }
  }

  // Return a validated best for a level, or null when absent/corrupt. Guards the
  // exact fields the UI reads so a partially-written entry never throws later.
  // Bests are tied to the timing ruleset: an entry recorded under a different
  // (newer) rules version is treated as absent so stale times never compete
  // against the current rules. Entries predating versioning lack the field and
  // are accepted as the current version, since they were set under these rules.
  function getLevelBest(level) {
    const entry = loadBests()[level];
    if (!entry || typeof entry.time !== "number" || !Number.isFinite(entry.time)) return null;
    // The extended arcade route cannot be compared with its old four-block run.
    if (level === "for-the-people" && entry.gameVersion !== GAME_VERSION) return null;
    const rulesVersion = typeof entry.rulesVersion === "number" ? entry.rulesVersion : TIMING_RULES.version;
    if (rulesVersion !== TIMING_RULES.version) return null;
    const splits = Array.isArray(entry.splits) ? entry.splits : [];
    return { time: entry.time, splits };
  }

  function saveLevelBest(level, time, splits) {
    const bests = loadBests();
    bests[level] = {
      gameVersion: GAME_VERSION,
      rulesVersion: TIMING_RULES.version,
      // `cleared` records that the level was completed at all, independent of the
      // timing ruleset. Level unlock reads this (see isLevelCleared) so bumping
      // TIMING_RULES.version retires the best *time* for comparison without
      // silently re-locking a level the player genuinely finished.
      cleared: true,
      time,
      splits: splits.map((entry) => ({
        index: entry.index,
        name: entry.name,
        total: entry.total,
        split: entry.split
      }))
    };
    saveBests(bests);
  }

  // Whether a level has ever been completed, independent of the timing-rules
  // version. The first completion of a level is always a new best (no prior
  // entry), so saveLevelBest writes the `cleared` flag then; this is the durable
  // unlock signal that survives a TIMING_RULES.version bump.
  function isLevelCleared(level) {
    return loadBests()[level]?.cleared === true;
  }

  // Wipe persisted personal bests. Exposed on `window.eightBitSatoshi.resetBests`
  // for development/testing — run it in the browser console and reload to clear
  // saved times and splits. Returns true when storage was cleared.
  function resetBests() {
    try {
      localStorage.removeItem(BESTS_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }
  // Build a structured, rules- and build-stamped summary of a finished run. This
  // is the canonical "run payload" half of the leaderboard entry: the same fields
  // and ruleset that drive the HUD, results, and local bests also drive the saved
  // score. The submission flow wraps this with the player-supplied { playerName }
  // and a { clientTimestamp } before it is stored locally.
  function buildSubmission(isNewBest) {
    const level = getCurrentLevel();
    return {
      // Stable key the leaderboard groups a board by. The display title can be
      // reworded without splitting a board, so id — not title — is authoritative.
      levelId: level.id,
      level: level.title,
      gameVersion: GAME_VERSION,
      rulesVersion: TIMING_RULES.version,
      category: TIMING_RULES.category,
      time: state.completionTime,
      deaths: state.deaths,
      // Collectibles. pagesTotal travels with pages so a reader can validate
      // "All Pages" without hard-coding each level's page count.
      coins: state.coins,
      pages: state.pages,
      pagesTotal: levelPageTotal(level),
      lives: state.lives,
      isNewBest,
      splits: state.splits.map((entry) => ({
        index: entry.index,
        name: entry.name,
        total: entry.total,
        split: entry.split
      }))
    };
  }

  // Expose timing helpers for development/testing and future leaderboard wiring:
  //   resetBests()   wipe persisted personal bests
  //   getTimingRules() read the active ruleset (frozen copy)
  //   getLastRun()   read the last completed run's submission payload, or null
  function getTimingRules() {
    return Object.freeze(Object.assign({}, TIMING_RULES));
  }
  function getLastRun() {
    return state.lastRun ? JSON.parse(JSON.stringify(state.lastRun)) : null;
  }

  // Load a level by 1-based number (the order players see). The full title-screen
  // level select with unlock rules and best-time display is a separate ticket
  // (00c3fc77); this is the minimal seam that lets a level be chosen now — used
  // by the `?level=N` URL param and exposed for dev/testing/the demo. Rejects
  // out-of-range values and refuses to swap the world out from under an active
  // run; returns true only when the level was loaded.
  function setLevel(levelNumber) {
    // Accept only an in-range 1-based integer; reject NaN/floats/out-of-range
    // rather than silently truncating, since this is a public API.
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > LEVELS.length) return false;
    if (state.phase === "playing") return false;
    state.levelIndex = levelNumber - 1;
    initLevel();
    state.currentZone = 0;
    syncHud(true);
    return true;
  }
  window.eightBitSatoshi = Object.assign({}, window.eightBitSatoshi, {
    resetBests,
    getTimingRules,
    getLastRun,
    setLevel,
    // Open the leaderboard view to a given level id (defaults to the first board).
    // Exposed for the demo and manual testing; the in-game buttons call it too.
    openLeaderboard: (levelId) => openLeaderboard(levelId, "title"),
    levelCount: LEVELS.length,
    gameVersion: GAME_VERSION
  });

  // Dev-only test seam (loopback/file origins only — see IS_DEV): lets local
  // playtests read and place the overworld walker deterministically instead of
  // relying on timed key holds. Never present in production, and placement is
  // refused mid-venue so it cannot skip a fight.
  if (IS_DEV) {
    window.eightBitSatoshi.dev = {
      getState: () => ({
        subMode: state.subMode,
        phase: state.phase,
        paused: state.paused,
        time: state.time,
        brawler: state.subMode === "brawler" ? brawler.snapshot() : null,
        venueKey: state.venueKey,
        venuesCleared: state.venuesCleared.slice(),
        floorIndex: state.floorIndex,
        visitKills: state.visitKills,
        coins: state.coins,
        pages: state.pages,
        owTile: state.subMode === "overworld"
          ? { tx: Math.floor((owPlayer.x + owPlayer.w / 2) / TILE), ty: Math.floor((owPlayer.y + owPlayer.h / 2) / TILE) }
          : null,
        playerX: player.x,
        enemiesAlive: enemies.filter((e) => e.alive).length,
        enemiesTotal: enemies.length,
        shotsLive: shots.filter((s) => s.alive).length,
        satShotsLive: satShots.filter((s) => s.alive).length,
        barricadesLeft: barricades.length,
        barricadeHp: barricades.map((b) => `${b.x}:${b.hp}`),
        lives: state.lives,
        deaths: state.deaths
      }),
      placeWalker: (tx, ty) => {
        if (state.subMode !== "overworld" || owSolidAt(tx, ty)) return false;
        owPlayer.x = tx * TILE + (TILE - OW_PW) / 2;
        owPlayer.y = ty * TILE + (TILE - OW_PH) / 2;
        return true;
      },
      // Teleport the side-view player within the current venue (test aid for
      // skipping pits the scripted driver can't time; humans just jump them).
      placePlayer: (x) => {
        if (state.subMode !== "venue") return false;
        player.x = x;
        player.y = 150;
        player.vy = 0;
        return true;
      },
      // Kill every enemy in the current venue floor, as if each was stomped.
      // Tallies visitKills too, so the multi-floor clear check treats this
      // exactly like real stomps. Lets a local playtest exercise the
      // clear → split → exit chain without scripting frame-perfect combat.
      stompAll: () => {
        if (state.subMode !== "venue") return false;
        let killed = 0;
        for (const enemy of enemies) {
          if (enemy.alive) {
            enemy.alive = false;
            enemy.squashed = 0.3;
            killed += 1;
          }
        }
        state.visitKills += killed;
        return true;
      }
    };
  }

  // Level unlock rule: Level 1 is always available, and each later level unlocks
  // once the previous level has been completed. Completion is tracked by the
  // persisted, rules-version-independent `cleared` flag (isLevelCleared) so the
  // unlock survives reloads — and a TIMING_RULES.version bump — without extra
  // storage.
  function isLevelUnlocked(index) {
    if (index < 0 || index >= LEVELS.length) return false;
    // Local development: every level is open so any of them can be launched
    // directly. Production keeps the sequential unlock.
    if (IS_DEV) return true;
    if (index === 0) return true;
    return isLevelCleared(LEVELS[index - 1].id);
  }

  // Title-screen level select. Cards are built from LEVELS so the picker scales
  // to any number of levels without new markup. Each card shows the level name,
  // best time, and completion/lock state; the selected card is the one START /
  // PLAY AGAIN / RESTART launch (state.levelIndex). Rebuilt whenever the title is
  // shown so a freshly cleared level reflects its new best and unlock immediately.
  function renderLevelSelect() {
    if (!levelSelect) return;
    const cards = LEVELS.map((level, index) => {
      const unlocked = isLevelUnlocked(index);
      // `cleared` is the durable completion flag; `best` is the current-ruleset
      // best time (null after a rules-version bump even when still cleared).
      const cleared = isLevelCleared(level.id);
      const best = unlocked ? getLevelBest(level.id) : null;
      const selected = index === state.levelIndex;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "level-card";
      card.classList.toggle("selected", selected);
      card.classList.toggle("locked", !unlocked);
      card.classList.toggle("cleared", cleared);
      card.dataset.index = String(index);
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", selected ? "true" : "false");
      card.disabled = !unlocked;

      // One three-way status used for both the visible label and the aria-label,
      // so the screen-reader text never drifts from what is shown.
      let status;
      if (!unlocked) status = `LOCKED · CLEAR ${LEVELS[index - 1].title}`;
      else if (best) status = `BEST ${formatTime(best.time)}`;
      else if (cleared) status = "CLEARED";
      else status = "NOT CLEARED";

      card.append(
        makeSpan("level-card-num", `LEVEL ${index + 1}`),
        makeSpan("level-card-title", level.title),
        makeSpan("level-card-status", status)
      );
      card.setAttribute("aria-label", `Level ${index + 1}, ${level.title}. ${status}.`);
      return card;
    });
    levelSelect.replaceChildren(...cards);
  }

  // Select a level by 0-based index from the title screen. Refuses locked levels
  // so START always has a playable target, loads the chosen level (setLevel, which
  // also previews it behind the title), then refreshes the cards so the highlight
  // and best times stay in sync. Returns true when the selection changed.
  function selectLevel(index) {
    if (!isLevelUnlocked(index)) return false;
    if (!setLevel(index + 1)) return false;
    renderLevelSelect();
    return true;
  }

  // Move the title-screen selection by `dir` (-1 left / +1 right) to the next
  // unlocked level, skipping locked entries so keyboard and touch navigation
  // never land on an unstartable level.
  function moveSelection(dir) {
    if (!dir) return; // a zero step would loop forever; callers pass ±1.
    for (let i = state.levelIndex + dir; i >= 0 && i < LEVELS.length; i += dir) {
      if (isLevelUnlocked(i)) {
        selectLevel(i);
        return;
      }
    }
  }

  // Return to the title screen / level select from a finished or failed run.
  // Refreshes the picker first so a level just cleared shows its new best and
  // unlocks the next level without needing a page reload.
  function showTitle() {
    state.phase = "title";
    state.paused = false;
    stopMusic();
    menuButton.classList.add("hidden");
    messageScreen.classList.add("hidden");
    if (leaderboardScreen) leaderboardScreen.classList.add("hidden");
    // Re-validate the selection: if the current level is no longer unlocked
    // (e.g. bests were wiped via resetBests), fall back to Level 1 so START
    // never launches a level the picker would lock. selectLevel re-renders.
    if (!isLevelUnlocked(state.levelIndex)) selectLevel(0);
    else renderLevelSelect();
    titleScreen.classList.remove("hidden");
  }

  // Map of checkpoint index -> best split duration for the active level, captured
  // once per full run so the in-run toast can flag faster sections without
  // re-reading storage at every checkpoint.
  function loadBestSplitMap(level) {
    const best = getLevelBest(level);
    const map = {};
    if (best) {
      for (const entry of best.splits) {
        if (typeof entry.index === "number" && typeof entry.split === "number") {
          map[entry.index] = entry.split;
        }
      }
    }
    return map;
  }

  const input = {
    left: false,
    right: false,
    // Up/down move through city maps and brawler lanes. Classic side-view
    // levels map their up key to jumping.
    up: false,
    down: false,
    jump: false,
    jumpPressed: false,
    jumpReleased: false,
    // Fire shoots the sat cannon in armed venues and punches in the brawler.
    fire: false,
    firePressed: false,
    special: false,
    specialPressed: false,
    throw: false,
    throwPressed: false
  };

  const player = {
    x: 32,
    y: 160,
    w: 14,
    h: 24,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    invincible: 0,
    deadTimer: 0,
    fireCooldown: 0,
    dustT: 0
  };

  const solids = [];
  const coins = [];
  const pages = [];
  const enemies = [];
  const hazards = [];
  const checkpoints = [];
  // Ally/cameo markers (e.g. Hal Finney, the early-builder node cluster). Purely
  // decorative: they are never solids, hazards, or collectibles, so they cannot
  // affect collision, timing, or the leaderboard. Each carries a one-shot ambient
  // line shown via the existing non-blocking toast when the player first passes
  // its trigger. Optional per level — Level 1 has none.
  const allies = [];
  // Enemy shitcoin shots and player sat-cannon shots. Fixed-size pools like
  // particles, so a busy room never allocates mid-frame.
  const shots = new Array(12).fill(null).map(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, lob: false }));
  const satShots = new Array(6).fill(null).map(() => ({ alive: false, x: 0, y: 0, vx: 0 }));
  // Destructible barricades (ICO TOWER): solid stacks of shit-tokens the sat
  // cannon breaks. Also in `solids` while intact; killing one removes it there.
  const barricades = [];
  const particles = new Array(48).fill(null).map(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, color: palette.orange }));
  // Finish marker box. Position and size are loaded from the active level's
  // definition in initLevel so the goal can sit anywhere per level.
  const goal = { x: 0, y: 0, w: 0, h: 0 };

  // ----- Overworld (top-down) state ------------------------------------------
  // Built by initOverworld from the level's ASCII map. Lives beside the
  // side-view collections; only one of the two is active at a time (subMode).
  const ow = {
    grid: [],          // rows of tile chars
    cols: 0,
    rows: 0,
    coins: [],         // { tx, ty, taken }
    doors: [],         // { tx, ty, key }
    exit: null,        // { tx, ty }
    npcs: [],          // { kind, tx, ty, name, lines, greeted }
    taxis: []          // { axis, lane|row, from, to, speed, phase, box, dir }
  };

  // Top-down walker. Position is in world pixels (tile * TILE); w/h are the
  // collision box (smaller than a tile so corridors never snag). invincible
  // grants a grace window after a traffic hit (overworld-only field).
  const owPlayer = { x: 0, y: 0, w: OW_PW, h: OW_PH, facing: "down", moving: false, invincible: 0 };

  function isOverworldLevel() {
    return getCurrentLevel().mode === "overworld";
  }

  // Tiles that block walking. Doors and the exit are deliberately walkable —
  // stepping onto them is how you enter a venue / finish the level.
  function owSolidAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= ow.cols || ty >= ow.rows) return true;
    const t = ow.grid[ty][tx];
    // Trees are the park's solid props; buildings and water stay solid.
    return t === "#" || t === "~" || t === "t";
  }

  // Build the overworld collections from the level definition. Coins, doors,
  // the exit, and NPCs are pulled out of the ASCII map / npc list into live
  // per-run objects; the map rows themselves stay immutable.
  function initOverworld(level) {
    if (!Array.isArray(level.map) || level.map.length === 0) {
      throw new Error(`Level "${level.id}" is mode:"overworld" but has no map.`);
    }
    const width = level.map[0].length;
    for (const row of level.map) {
      if (row.length !== width) {
        throw new Error(`Level "${level.id}" map rows must all be ${width} chars.`);
      }
    }
    ow.grid = level.map;
    ow.cols = width;
    ow.rows = level.map.length;
    ow.coins.length = 0;
    ow.doors.length = 0;
    ow.exit = null;
    ow.npcs.length = 0;

    for (let ty = 0; ty < ow.rows; ty += 1) {
      for (let tx = 0; tx < ow.cols; tx += 1) {
        const t = ow.grid[ty][tx];
        if (t === "c") ow.coins.push({ tx, ty, taken: false });
        else if (t >= "1" && t <= "9") {
          if (!level.venues || !level.venues[t]) {
            throw new Error(`Level "${level.id}" map has door "${t}" with no matching venue.`);
          }
          ow.doors.push({ tx, ty, key: t });
        } else if (t === "X") ow.exit = { tx, ty };
      }
    }
    if (!ow.exit) throw new Error(`Level "${level.id}" map has no exit tile "X".`);

    for (const npc of level.npcs || []) {
      ow.npcs.push({ ...npc, greeted: false });
    }

    // Traffic routes (Level 5): cloned with runtime fields for the computed
    // collision box and travel direction each frame.
    ow.taxis = (level.taxis || [])
      .filter((t) => t.axis === "h" || t.axis === "v")
      .map((t) => ({ ...t, box: null, dir: 1 }));

    owPlayer.x = level.spawn.tx * TILE + (TILE - OW_PW) / 2;
    owPlayer.y = level.spawn.ty * TILE + (TILE - OW_PH) / 2;
    owPlayer.facing = "down";
    owPlayer.moving = false;
    owPlayer.invincible = 0;
    // Aim the camera at the spawn immediately so the title-screen preview and
    // the first played frame are already centered on the walker.
    state.cameraX = clamp(owPlayer.x - VIEW_W / 2, 0, Math.max(0, ow.cols * TILE - VIEW_W));
    state.cameraY = clamp(owPlayer.y - VIEW_H / 2, 0, Math.max(0, ow.rows * TILE - VIEW_H));
  }

  // The zone descriptor render/HUD should use right now. Overworld levels have
  // one city zone plus a per-venue zone (cloned on entry so the lazy gradient
  // cache never mutates the immutable definitions); classic levels use the
  // zones array as before.
  let venueZone = null;
  function activeZone() {
    if (state.subMode === "venue" && venueZone) return venueZone;
    if (isOverworldLevel()) return zones[0];
    return zones[state.currentZone];
  }

  // Total milestone collectibles for a level. Classic levels read their layout;
  // an overworld level's stashes live inside its venue layouts (multi-floor
  // venues sum their floors).
  function levelPageTotal(level) {
    if (level.mode === "overworld") {
      return Object.values(level.venues).reduce((sum, venue) => {
        const layouts = venue.floors ? venue.floors.map((f) => f.layout) : [venue.layout];
        return sum + layouts.reduce((n, layout) => n + ((layout.pages || []).length), 0);
      }, 0);
    }
    return level.layout.pages.length;
  }

  // Load the active level: pull its metadata (world width, scenery zones, goal
  // box) into the live game state, then rebuild every collection from the level's
  // declarative layout. The add* builders create fresh objects each call, and
  // checkpoints are cloned with a per-run `taken` flag, so the immutable level
  // definition is never mutated between runs.
  // Layout collections every level definition must provide. Validated on load so
  // a missing or misspelled key fails loudly instead of leaving the world empty.
  const LAYOUT_KEYS = ["ground", "platforms", "blockStacks", "coinArcs", "pages", "enemies", "hazards", "checkpoints"];

  function initLevel() {
    const level = getCurrentLevel();
    const arcade = level.mode === "brawler";
    canvas.width = arcade ? window.SatoshiBrawler.WIDTH * 2 : VIEW_W;
    canvas.height = arcade ? window.SatoshiBrawler.HEIGHT * 2 : VIEW_H;
    ctx.imageSmoothingEnabled = false;
    document.body.classList.toggle("brawler-mode", arcade);
    document.getElementById("arcade-brief").hidden = !arcade;
    document.getElementById("arcade-controls").hidden = !arcade;
    document.getElementById("arcade-status").hidden = !arcade;
    document.getElementById("arcade-readout").hidden = !arcade;
    document.getElementById("fighter-picker").hidden = !arcade;
    document.getElementById("fighter-description").textContent = window.SatoshiBrawler.CHARACTERS[selectedFighter].description;
    document.querySelector(".title-stack > h1").textContent = arcade ? "FOR THE PEOPLE" : "8-BIT SATOSHI";
    document.getElementById("title-tagline").textContent = arcade
      ? "Pick your fighter. Take the people's route."
      : "Build Bitcoin. Beat fiat. Reach the whitepaper.";
    startButton.textContent = arcade ? "LET'S GO" : "START";
    canvas.setAttribute("aria-label", arcade ? "For the People: arcade street brawler" : "8-Bit Satoshi game canvas");
    if (arcade) {
      state.subMode = "brawler";
      state.cameraX = 0;
      state.currentZone = 0;
      state.venueKey = null;
      zones = level.zones.map((zone) => ({ ...zone }));
      brawler = window.SatoshiBrawler.create({
        sfx: playSfx,
        reward: (sats, score) => { state.coins += sats; state.score += score; },
        checkpoint: (index, name) => { state.pages += 1; recordSplit({ index: index + 1, name }); },
        death: () => {
          state.lives -= 1;
          state.deaths += 1;
          if (state.lives <= 0) { gameOver(); return false; }
          return true;
        },
        complete: completeGame
      }, selectedFighter);
      return;
    }
    brawler = null;

    // Overworld levels build the tile city instead of the side-view course.
    // The side-view collections are cleared so nothing stale renders, and the
    // per-run venue progress resets with the level.
    if (level.mode === "overworld") {
      state.subMode = "overworld";
      state.venueKey = null;
      state.venuesCleared = [];
      state.stashesTaken = [];
      state.owReturn = null;
      state.floorIndex = 0;
      state.visitKills = 0;
      state.toastQueue = [];
      WORLD_W = level.worldW;
      zones = [{ ...level.zone }];
      Object.assign(goal, { x: -100, y: -100, w: 0, h: 0 });
      solids.length = 0;
      coins.length = 0;
      pages.length = 0;
      enemies.length = 0;
      hazards.length = 0;
      checkpoints.length = 0;
      allies.length = 0;
      barricades.length = 0;
      clearProjectiles();
      initOverworld(level);
      return;
    }

    state.subMode = "side";
    const layout = level.layout || {};
    for (const key of LAYOUT_KEYS) {
      if (!Array.isArray(layout[key])) {
        throw new Error(`Level "${level.id}" layout.${key} must be an array (use [] for an empty collection).`);
      }
    }

    WORLD_W = level.worldW;
    // Shallow-clone zones so the lazy gradient cache (getZoneGradient) lives on
    // per-run copies and never mutates the immutable LEVELS definition.
    zones = level.zones.map((zone) => ({ ...zone }));
    Object.assign(goal, level.goal);

    solids.length = 0;
    coins.length = 0;
    pages.length = 0;
    enemies.length = 0;
    hazards.length = 0;
    checkpoints.length = 0;
    allies.length = 0;
    barricades.length = 0;
    clearProjectiles();

    for (const [x, w] of layout.ground) addGround(x, w);
    for (const [x, y, w, h, kind, cycle] of layout.platforms) addPlatform(x, y, w, h, kind, cycle);
    for (const [x, count] of layout.blockStacks) addBlockStack(x, count);
    for (const [x, y, count] of layout.coinArcs) addCoinArc(x, y, count);
    for (const [x, y] of layout.pages) addPage(x, y);
    for (const [x, y, minX, maxX, type] of layout.enemies) addEnemy(x, y, minX, maxX, type);
    for (const [x, y, w, h] of layout.hazards) addHazard(x, y, w, h);
    for (const cp of layout.checkpoints) {
      checkpoints.push({ ...cp, taken: false });
    }
    // Allies are optional (absent on Level 1). Cloned with a per-run `greeted`
    // flag so each ambient line fires at most once per full run. Rebuilt here
    // (only on a full reset, not on checkpoint respawn) so a respawn does not
    // replay lines the player already saw — keeping them unobtrusive on retry.
    for (const ally of layout.allies || []) addAlly(ally);
  }

  // Build one floor of a venue into the side-view collections and drop the
  // player at its left edge. Works for both shapes: single-layout venues
  // (Level 4) pass floorIndex 0 and read venue.layout directly; multi-floor
  // venues (Level 5) read venue.floors[i]. Enemies rebuild on every floor load
  // when the venue is uncleared; a cleared venue stays empty. The floor spawn
  // doubles as the respawn checkpoint while inside.
  function loadVenueLayout(venue, floorIndex) {
    const floor = venue.floors ? venue.floors[floorIndex] : null;
    const layout = floor ? floor.layout : venue.layout;
    const key = state.venueKey;

    state.floorIndex = floorIndex;
    venueZone = { ...(floor ? floor.zone : venue.zone) };
    WORLD_W = floor ? floor.worldW : venue.worldW;
    Object.assign(goal, floor ? floor.goal : venue.goal);

    solids.length = 0;
    coins.length = 0;
    pages.length = 0;
    enemies.length = 0;
    hazards.length = 0;
    barricades.length = 0;
    clearProjectiles();
    player.fireCooldown = 0;

    for (const [x, w] of layout.ground) addGround(x, w);
    for (const [x, y, w, h, kind, cycle] of layout.platforms || []) addPlatform(x, y, w, h, kind, cycle);
    // Barricades persist for the room visit only — a re-entry rebuilds them
    // even in a cleared venue, but by then the cannon is still granted, so the
    // route stays open.
    for (const [x, count] of layout.barricades || []) addBarricade(x, count);
    for (const [x, y, count] of layout.coinArcs || []) addCoinArc(x, y, count);
    if (!state.stashesTaken.includes(key)) {
      for (const [x, y] of layout.pages || []) addPage(x, y);
    }
    if (!state.venuesCleared.includes(key)) {
      for (const [x, y, minX, maxX, type] of layout.enemies || []) addEnemy(x, y, minX, maxX, type);
    }
    for (const [x, y, w, h] of layout.hazards || []) addHazard(x, y, w, h);

    player.x = floor ? floor.spawnX : venue.spawnX;
    player.y = 150;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.invincible = 1.1;
    state.checkpointX = player.x;
    state.cameraX = 0;
    if (venue.floors) {
      state.toast = venue.weapon === "satcannon" && floorIndex === 0
        ? "SAT CANNON armed! X/F shoots. Break the paywalls."
        : `${venue.name} · ${floor.name} — ${floor.hint}`;
    } else {
      state.toast = venue.weapon === "satcannon"
        ? "SAT CANNON armed! X/F shoots. Break the token walls."
        : `${venue.name} — clear the room.`;
    }
    state.toastTime = 2.4;
    playSfx("start");
    syncHud(true);
  }

  // Enter a venue: remember where to put the walker on exit, reset per-visit
  // progress (floors climbed, enemies stomped this visit), then build floor 0.
  function enterVenue(key) {
    const level = getCurrentLevel();
    const venue = level.venues[key];
    if (!venue) return;

    state.subMode = "venue";
    state.venueKey = key;
    // Where to put the walker when they come back out: just south of the door.
    const door = ow.doors.find((d) => d.key === key);
    if (door) state.owReturn = { tx: door.tx, ty: door.ty + 1 };

    state.visitKills = 0;
    loadVenueLayout(venue, 0);
  }

  // Enemy totals for the active venue visit. Single-layout venues read the live
  // room; multi-floor venues compare this visit's stomp tally against every
  // floor's roster (floors behind you stay counted via visitKills).
  function venueEnemyTotals() {
    const level = getCurrentLevel();
    const venue = level.venues[state.venueKey];
    if (venue && venue.floors) {
      const total = venue.floors.reduce((sum, f) => sum + ((f.layout.enemies || []).length), 0);
      return { total, killed: Math.min(state.visitKills, total) };
    }
    const total = venue ? (venue.layout.enemies || []).length : 0;
    return { total, killed: enemies.filter((e) => !e.alive).length };
  }

  // Return from a venue interior to the city. Records the clear (and its
  // split) when every enemy in the building was stomped this visit; the level
  // exit opens once all venues are cleared.
  function exitVenue() {
    const level = getCurrentLevel();
    const key = state.venueKey;
    const venue = level.venues[key];
    // An already-cleared venue rebuilds no enemies, so "cleared now" only
    // applies on the visit that actually emptied the building.
    const alreadyCleared = state.venuesCleared.includes(key);
    const totals = venueEnemyTotals();
    const clearedNow = !alreadyCleared && totals.total > 0 && totals.killed >= totals.total;
    if (clearedNow) {
      state.venuesCleared.push(key);
      recordSplit({ index: venue.index, name: venue.name });
      const total = Object.keys(level.venues).length;
      state.toast = state.venuesCleared.length >= total
        ? "All venues cleared! The Bull is awake."
        : `${venue.name} cleared. ${state.venuesCleared.length}/${total} venues.`;
      state.toastTime = 2.6;
    } else {
      state.toast = alreadyCleared ? "Back to the streets."
        : venue && venue.floors ? "Agents remain — the visit resets."
        : "Shills remain — come back to clear it.";
      state.toastTime = 2.2;
    }

    state.subMode = "overworld";
    state.venueKey = null;
    venueZone = null;
    solids.length = 0;
    coins.length = 0;
    pages.length = 0;
    enemies.length = 0;
    hazards.length = 0;
    barricades.length = 0;
    clearProjectiles();

    if (state.owReturn) {
      owPlayer.x = state.owReturn.tx * TILE + (TILE - OW_PW) / 2;
      owPlayer.y = state.owReturn.ty * TILE + (TILE - OW_PH) / 2;
    }
    owPlayer.facing = "down";
    playSfx("checkpoint");
    syncHud(true);
  }

  function addGround(x, w) {
    solids.push({ x, y: 204, w, h: 36, kind: "ground", hit: false });
  }

  // Confirmation Blocks pass an optional `cycle` ({ periodMs, phaseMs, onMs }):
  // a platform that toggles between confirmed (solid) and unconfirmed (passable)
  // on a deterministic cadence. Static platforms omit it and store `cycle: null`.
  function addPlatform(x, y, w, h, kind, cycle) {
    solids.push({ x, y, w, h, kind, hit: false, cycle: cycle || null });
  }

  function addBlockStack(x, count) {
    for (let i = 0; i < count; i += 1) {
      solids.push({ x, y: 188 - i * TILE, w: TILE, h: TILE, kind: "block", hit: false });
    }
  }

  function addCoinArc(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      coins.push({ x: x + i * 22, y: y - Math.abs(i - Math.floor(count / 2)) * 8, w: 8, h: 8, taken: false });
    }
  }

  function addPage(x, y) {
    pages.push({ x, y, w: 11, h: 14, taken: false });
  }

  function addEnemy(x, y, minX, maxX, type) {
    // fireTimer staggers turrets by position (deterministic — no randomness)
    // so two shitguns on screen never fire in lockstep. Agents get a
    // similarly staggered coin-throw clock; windup holds the telegraph.
    enemies.push({
      x, y, w: 16, h: 18,
      vx: enemyConfig(type).speed,
      minX, maxX, type,
      alive: true, squashed: 0,
      fireTimer: (x % 100) / 100 * SHITGUN_PERIOD,
      throwTimer: type === "agent" ? 0.9 + (x % 131) / 131 * AGENT_THROW_PERIOD : AGENT_THROW_PERIOD,
      windup: 0
    });
  }

  function addHazard(x, y, w, h) {
    hazards.push({ x, y, w, h });
  }

  // A destructible token wall: `count` stacked 16px blocks rising from the
  // ground line. One object in `barricades` (with hp) plus one solid slab in
  // `solids`; breaking it removes the slab so collision and rendering agree.
  function addBarricade(x, count) {
    const h = count * TILE;
    const solid = { x, y: 204 - h, w: TILE, h, kind: "barricade", hit: false };
    solids.push(solid);
    barricades.push({ x, y: 204 - h, w: TILE, h, hp: 3, solid });
  }

  function clearProjectiles() {
    for (const s of shots) s.alive = false;
    for (const s of satShots) s.alive = false;
  }

  // Build a decorative ally cameo. `triggerX` defaults to the sprite's x so a
  // definition can omit it; `greeted` tracks the once-per-run ambient line.
  function addAlly(spec) {
    allies.push({
      kind: spec.kind,
      x: spec.x,
      y: spec.y,
      w: spec.w || 18,
      h: spec.h || 22,
      name: spec.name || "",
      line: spec.line || "",
      triggerX: typeof spec.triggerX === "number" ? spec.triggerX : spec.x,
      greeted: false
    });
  }

  function loadSoundEnabled() {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch (err) {
      return true;
    }
  }

  function saveSoundEnabled(enabled) {
    try {
      localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
    } catch (err) {
      // Sound preference is convenience-only; blocked storage should not affect play.
    }
  }

  function noteRow(value) {
    return value.trim().split(/\s+/).map((token) => (token === "." ? null : token));
  }

  function noteFrequency(name) {
    if (typeof name === "number") return name;
    if (!name) return 0;
    const match = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!match) return 0;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]];
    const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    const octave = Number.parseInt(match[3], 10);
    const midi = 12 * (octave + 1) + base + accidental;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function makePulseWave(duty) {
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n += 1) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    }
    return audio.ctx.createPeriodicWave(real, imag);
  }

  function makeNoiseBuffer() {
    const length = audio.ctx.sampleRate;
    const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function ensureAudio() {
    if (!audio.enabled) return false;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;

    if (!audio.ctx) {
      try {
        audio.ctx = new AudioCtor();
        audio.master = audio.ctx.createGain();
        audio.musicGain = audio.ctx.createGain();
        audio.sfxGain = audio.ctx.createGain();
        audio.master.gain.value = 0.95;
        audio.musicGain.gain.value = 0;
        audio.sfxGain.gain.value = 0.72;
        audio.musicGain.connect(audio.master);
        audio.sfxGain.connect(audio.master);
        audio.master.connect(audio.ctx.destination);
        try {
          audio.pulseWave = typeof audio.ctx.createPeriodicWave === "function" ? makePulseWave(0.5) : null;
          audio.narrowPulseWave = typeof audio.ctx.createPeriodicWave === "function" ? makePulseWave(0.25) : null;
        } catch (waveError) {
          audio.pulseWave = null;
          audio.narrowPulseWave = null;
        }
        audio.noiseBuffer = makeNoiseBuffer();
      } catch (err) {
        console.warn("8-Bit Satoshi: audio could not start.", err);
        return false;
      }
    }

    audio.unlocked = audio.ctx.state === "running";
    syncSoundButton();
    return true;
  }

  function runWhenAudioReady(callback) {
    if (!ensureAudio()) return false;
    if (audio.ctx.state === "running") {
      audio.unlocked = true;
      syncSoundButton();
      callback();
      return true;
    }

    if (!audio.resumePromise) {
      audio.resumePromise = audio.ctx.resume()
        .then(() => {
          audio.unlocked = audio.ctx.state === "running";
          audio.resumePromise = null;
          if (audio.unlocked && audio.musicActive) {
            audio.nextStepTime = audio.ctx.currentTime + 0.035;
          }
          syncSoundButton();
        })
        .catch((err) => {
          audio.resumePromise = null;
          console.warn("8-Bit Satoshi: audio unlock was blocked.", err);
          syncSoundButton();
        });
    }

    audio.resumePromise.then(() => {
      if (audio.ctx && audio.ctx.state === "running") callback();
    });
    return true;
  }

  function syncSoundButton() {
    if (!soundButton) return;
    soundButton.textContent = audio.enabled ? (audio.unlocked ? "MUTE" : "TAP FOR SOUND") : "SOUND OFF";
    soundButton.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
  }

  function setSoundEnabled(enabled) {
    audio.enabled = !!enabled;
    saveSoundEnabled(audio.enabled);
    syncSoundButton();
    if (!audio.enabled) {
      stopMusic();
      return;
    }
    if (audio.sfxGain) audio.sfxGain.gain.value = 0.72;
    if (state.phase === "playing" && !state.paused) startMusic(false);
  }

  function toggleSound() {
    if (audio.enabled && !audio.unlocked) {
      playSfx("toggle");
      return;
    }
    setSoundEnabled(!audio.enabled);
    if (audio.enabled) playSfx("toggle");
  }

  function fadeMusic(target, timeConstant = 0.025) {
    if (!audio.ctx || !audio.musicGain) return;
    const now = audio.ctx.currentTime;
    audio.musicGain.gain.cancelScheduledValues(now);
    audio.musicGain.gain.setTargetAtTime(target, now, timeConstant);
  }

  function startMusic(restart) {
    if (!ensureAudio()) return;
    const songId = getCurrentLevel().id;
    if (restart || audio.songId !== songId) {
      audio.musicStep = 0;
      audio.songId = songId;
    }
    audio.musicActive = true;
    runWhenAudioReady(() => {
      audio.nextStepTime = audio.ctx.currentTime + 0.045;
      fadeMusic(1, 0.018);
    });
  }

  function stopMusic() {
    audio.musicActive = false;
    fadeMusic(0, 0.02);
  }

  function getCurrentSong() {
    return SONGS[getTheme()] || SONGS.city;
  }

  function updateAudio() {
    if (!audio.musicActive || !audio.ctx || audio.ctx.state !== "running") return;
    const song = getCurrentSong();
    const stepTime = 60 / song.bpm / 4;
    const leadLength = song.lead.length;
    if (audio.nextStepTime < audio.ctx.currentTime - 0.05) {
      audio.nextStepTime = audio.ctx.currentTime + 0.02;
    }
    while (audio.nextStepTime < audio.ctx.currentTime + 0.14) {
      playMusicStep(song, audio.musicStep % leadLength, audio.nextStepTime, stepTime);
      audio.musicStep = (audio.musicStep + 1) % leadLength;
      audio.nextStepTime += stepTime;
    }
  }

  function playMusicStep(song, step, time, stepTime) {
    const lead = song.lead[step];
    const harmony = song.harmony[step % song.harmony.length];
    const bass = song.bass[step % song.bass.length];
    if (lead) {
      playTone(lead, time, stepTime * 0.82, song.leadGain, {
        wave: audio.narrowPulseWave,
        destination: audio.musicGain
      });
    }
    if (harmony) {
      playTone(harmony, time, stepTime * 0.72, song.harmonyGain, {
        wave: audio.pulseWave,
        destination: audio.musicGain
      });
    }
    if (bass) {
      playTone(bass, time, stepTime * 1.08, song.bassGain, {
        type: "triangle",
        destination: audio.musicGain
      });
    }
    if (step % 8 === 0) playKick(time, audio.musicGain, 0.045);
    if (step % 8 === 4) playNoise(time, 0.055, 0.032, 1200, audio.musicGain);
    if (step % 2 === 1) playNoise(time, 0.018, 0.012, 5200, audio.musicGain);
  }

  function playTone(note, time, duration, gain, options = {}) {
    if (!audio.ctx) return;
    const frequency = noteFrequency(note);
    if (!frequency) return;
    const end = time + duration;
    const osc = audio.ctx.createOscillator();
    const amp = audio.ctx.createGain();
    if (options.wave) osc.setPeriodicWave(options.wave);
    else osc.type = options.type || "square";
    osc.frequency.setValueAtTime(frequency, time);
    if (options.slideTo) {
      const target = Math.max(1, noteFrequency(options.slideTo));
      osc.frequency.exponentialRampToValueAtTime(target, end);
    }

    const attackEnd = time + Math.min(0.012, duration * 0.25);
    const holdAt = Math.max(attackEnd, end - Math.min(0.028, duration * 0.5));
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, attackEnd);
    amp.gain.setValueAtTime(gain * 0.75, holdAt);
    amp.gain.linearRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(options.destination || audio.sfxGain);
    osc.start(time);
    osc.stop(end + 0.03);
  }

  function playNoise(time, duration, gain, cutoff, destination) {
    if (!audio.ctx || !audio.noiseBuffer) return;
    const end = time + duration;
    const source = audio.ctx.createBufferSource();
    const filter = audio.ctx.createBiquadFilter();
    const amp = audio.ctx.createGain();
    source.buffer = audio.noiseBuffer;
    source.loop = true;
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + Math.min(0.006, duration * 0.35));
    amp.gain.linearRampToValueAtTime(0.0001, end);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination || audio.sfxGain);
    source.start(time);
    source.stop(end + 0.01);
  }

  function playKick(time, destination, gain) {
    playTone(98, time, 0.09, gain, {
      type: "triangle",
      slideTo: 43,
      destination
    });
  }

  function playSfx(name) {
    runWhenAudioReady(() => scheduleSfx(name));
  }

  function scheduleSfx(name) {
    const t = audio.ctx.currentTime + 0.008;
    const dest = audio.sfxGain;

    if (name === "toggle") {
      playTone("C6", t, 0.04, 0.055, { wave: audio.narrowPulseWave, destination: dest });
      return;
    }
    if (name === "start") {
      playTone("C4", t, 0.06, 0.055, { type: "triangle", destination: dest });
      playTone("E4", t + 0.055, 0.06, 0.055, { type: "triangle", destination: dest });
      playTone("G4", t + 0.11, 0.09, 0.06, { type: "triangle", destination: dest });
      return;
    }
    if (name === "jump") {
      playTone("E5", t, 0.09, 0.05, { wave: audio.narrowPulseWave, slideTo: "A5", destination: dest });
      return;
    }
    if (name === "coin") {
      playTone("B5", t, 0.045, 0.052, { wave: audio.narrowPulseWave, destination: dest });
      playTone("E6", t + 0.045, 0.055, 0.05, { wave: audio.narrowPulseWave, destination: dest });
      return;
    }
    if (name === "page") {
      ["C5", "E5", "G5", "C6"].forEach((note, index) => {
        playTone(note, t + index * 0.045, 0.08, 0.052, { wave: audio.pulseWave, destination: dest });
      });
      return;
    }
    if (name === "block") {
      playTone("C4", t, 0.055, 0.05, { wave: audio.pulseWave, slideTo: "C3", destination: dest });
      return;
    }
    if (name === "stomp") {
      playKick(t, dest, 0.07);
      playNoise(t + 0.018, 0.055, 0.045, 1800, dest);
      return;
    }
    if (name === "hurt") {
      playTone("C5", t, 0.08, 0.065, { wave: audio.pulseWave, slideTo: "G3", destination: dest });
      playNoise(t, 0.12, 0.038, 900, dest);
      return;
    }
    if (name === "crowd") {
      // Rising whoop for a crowd-surge launch — reads as lift, not a jump.
      playTone("C5", t, 0.06, 0.055, { wave: audio.narrowPulseWave, slideTo: "G5", destination: dest });
      playTone("E6", t + 0.055, 0.06, 0.045, { wave: audio.narrowPulseWave, destination: dest });
      return;
    }
    if (name === "shitshot") {
      // Low, wet plop — junk leaving the hopper.
      playTone("G3", t, 0.07, 0.05, { wave: audio.pulseWave, slideTo: "C3", destination: dest });
      return;
    }
    if (name === "satshot") {
      // Quick bright zap for the sat cannon.
      playTone("A5", t, 0.05, 0.05, { wave: audio.narrowPulseWave, slideTo: "E6", destination: dest });
      return;
    }
    if (name === "blockhit") {
      // Dull crack — a barricade taking damage but holding.
      playTone("D4", t, 0.05, 0.05, { wave: audio.pulseWave, slideTo: "A3", destination: dest });
      playNoise(t, 0.04, 0.03, 2400, dest);
      return;
    }
    if (name === "checkpoint") {
      ["G4", "C5", "E5"].forEach((note, index) => {
        playTone(note, t + index * 0.055, 0.075, 0.05, { wave: audio.narrowPulseWave, destination: dest });
      });
      return;
    }
    if (name === "finish") {
      ["C5", "E5", "G5", "C6", "G5", "C6"].forEach((note, index) => {
        playTone(note, t + index * 0.07, index === 5 ? 0.22 : 0.08, 0.06, {
          wave: audio.pulseWave,
          destination: dest
        });
      });
      return;
    }
    if (name === "gameover") {
      ["C5", "G4", "E4", "C4"].forEach((note, index) => {
        playTone(note, t + index * 0.09, 0.1, 0.06, { wave: audio.pulseWave, destination: dest });
      });
    }
  }

  function resetRun(full = true) {
    input.left = false;
    input.right = false;
    input.up = false;
    input.down = false;
    input.jump = false;
    input.jumpPressed = false;
    input.jumpReleased = false;
    input.fire = false;
    input.firePressed = false;
    input.special = false;
    input.throw = false;
    input.throwPressed = false;
    input.specialPressed = false;

    if (full) {
      state.coins = 0;
      state.pages = 0;
      state.lives = 3;
      state.score = 0;
      state.checkpointX = 30;
      state.currentZone = 0;
      state.time = 0;
      state.completionTime = 0;
      state.deaths = 0;
      state.crowdSurfed = false;
      state.splits.length = 0;
      state.bestSplits = loadBestSplitMap(getCurrentLevel().id);
      initLevel();
    }

    // On an overworld level a full reset already placed the walker and camera
    // (initLevel → initOverworld); a checkpoint respawn only happens inside a
    // venue, where the side-view fields below are the ones that matter.
    player.x = state.checkpointX;
    player.y = 150;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.invincible = 1.1;
    player.deadTimer = 0;
    if (state.subMode !== "overworld") state.cameraX = Math.max(0, player.x - 80);
    if (full) state.toastQueue = [];
    state.toast = full
      ? (isOverworldLevel()
        ? "Walk the city. Enter every venue. Ignore the shills."
        : `Run, jump, collect ${levelLabel("coin", "BTC")}.`)
      : "Back to checkpoint.";
    state.toastTime = 2.2;
    state.shake = full ? 0 : 0.22;
    syncHud(true);
  }

  function startGame() {
    titleScreen.classList.add("hidden");
    messageScreen.classList.add("hidden");
    state.phase = "playing";
    state.paused = false;
    resetRun(true);
    startMusic(true);
    playSfx("start");
  }

  function showMessage(title, copy, restartLabel = "RESTART", canContinue = false, canMenu = false) {
    messageTitle.textContent = title;
    messageCopy.textContent = copy;
    messageCopy.classList.remove("hidden");
    messageResults.classList.add("hidden");
    restartButton.textContent = restartLabel;
    continueButton.classList.toggle("hidden", !canContinue);
    menuButton.classList.toggle("hidden", !canMenu);
    // The leaderboard action belongs to the completion screen only, never to the
    // pause or game-over message that reuses this overlay.
    if (resultsLeaderboardButton) resultsLeaderboardButton.classList.add("hidden");
    messageScreen.classList.remove("hidden");
  }

  function pauseGame() {
    if (state.phase !== "playing") return;
    state.paused = true;
    for (const key of Object.keys(input)) input[key] = false;
    document.querySelectorAll(".touch-button.active").forEach((button) => button.classList.remove("active"));
    stopMusic();
    showMessage("PAUSED", "Game paused.", "RESTART", true, true);
  }

  function resumeGame() {
    state.paused = false;
    messageScreen.classList.add("hidden");
    startMusic(false);
  }

  function completeGame() {
    if (state.phase === "complete") return;
    state.phase = "complete";
    stopMusic();
    playSfx("finish");
    state.completionTime = state.time;
    // Capture the prior best before overwriting so results can compare against
    // it, then persist this run's time and splits when it is a new best.
    const levelId = getCurrentLevel().id;
    const previousBest = getLevelBest(levelId);
    const isNewBest = previousBest === null || state.completionTime < previousBest.time;
    if (isNewBest) saveLevelBest(levelId, state.completionTime, state.splits);
    // Capture the rules-stamped submission payload for this run so local bests
    // and any future leaderboard submission share one consistent shape.
    state.lastRun = buildSubmission(isNewBest);
    showResults(isNewBest, previousBest);
  }

  // Build the completion overlay: prominent final time, in-order checkpoint
  // splits, run stats, and a personal-best marker. Reuses the shared message
  // screen so PLAY AGAIN (restartButton) keeps its existing wiring.
  function showResults(isNewBest, previousBest) {
    messageTitle.textContent = state.subMode === "brawler" ? "THE PEOPLE WIN" : "BITCOIN LIVES";
    messageCopy.classList.add("hidden");

    messageResults.replaceChildren(
      buildFinalTime(state.completionTime, isNewBest),
      buildComparison(state.completionTime, previousBest, isNewBest),
      buildSplitList(state.splits),
      buildStats(),
      buildSubmitSection(state.lastRun)
    );
    messageResults.classList.remove("hidden");

    restartButton.textContent = "PLAY AGAIN";
    continueButton.classList.add("hidden");
    menuButton.classList.remove("hidden");
    // Offer the leaderboard only when its client script is present; otherwise the
    // button would lead nowhere. Replay/LEVELS never depend on it.
    if (resultsLeaderboardButton) resultsLeaderboardButton.classList.toggle("hidden", !leaderboardClient);
    messageScreen.classList.remove("hidden");
  }

  function buildFinalTime(time, isNewBest) {
    const wrap = document.createElement("p");
    wrap.className = "results-final";
    wrap.append(
      makeSpan("results-final-label", "FINAL TIME"),
      makeSpan("results-final-value", formatTime(time))
    );
    if (isNewBest) wrap.append(makeSpan("results-best-badge", "NEW BEST"));
    return wrap;
  }

  // Compare this run's final time against the saved personal best. First clears
  // (no prior best) say so; otherwise show the saved best and the signed delta
  // (negative when this run is faster).
  function buildComparison(time, previousBest, isNewBest) {
    const wrap = document.createElement("p");
    wrap.className = "results-compare";
    if (previousBest === null) {
      wrap.append(makeSpan("results-compare-label", "FIRST CLEAR — TIME TO BEAT IT"));
      return wrap;
    }
    const delta = time - previousBest.time;
    const sign = delta < 0 ? "-" : "+";
    wrap.append(
      makeSpan("results-compare-label", "BEST"),
      makeSpan("results-compare-best", formatTime(previousBest.time)),
      makeSpan(
        isNewBest ? "results-compare-delta faster" : "results-compare-delta slower",
        `${sign}${formatTime(Math.abs(delta))}`
      )
    );
    return wrap;
  }

  function buildSplitList(splits) {
    const list = document.createElement("ul");
    list.className = "results-splits";
    if (!splits.length) {
      const empty = document.createElement("li");
      empty.className = "results-split results-split-empty";
      empty.textContent = "No checkpoint splits recorded.";
      list.append(empty);
      return list;
    }
    for (const entry of splits) {
      const row = document.createElement("li");
      row.className = "results-split";
      row.append(
        makeSpan("split-name", `${entry.index}. ${entry.name}`),
        makeSpan("split-time", `+${formatTime(entry.split)}`),
        makeSpan("split-total", formatTime(entry.total))
      );
      list.append(row);
    }
    return list;
  }

  function buildStats() {
    const level = getCurrentLevel();
    const stats = [
      ["LEVEL", level.title],
      [levelLabel("coin", "BTC"), pad2(state.coins)],
      [levelLabel("pageStat", "PAGES"), `${state.pages}/${levelPageTotal(level)}`],
      ["DEATHS", String(state.deaths)],
      ["LIVES", String(state.lives)]
    ];
    if (brawler && state.subMode === "brawler") {
      stats.push(["FIGHTER", window.SatoshiBrawler.CHARACTERS[brawler.state.characterId].name],
        ["THROWS", String(brawler.state.throws)], ["PICKUPS", String(brawler.state.pickups)]);
    }
    const dl = document.createElement("dl");
    dl.className = "results-stats";
    for (const [label, value] of stats) {
      const pair = document.createElement("div");
      pair.className = "results-stat";
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      pair.append(dt, dd);
      dl.append(pair);
    }
    return dl;
  }

  function makeSpan(className, value) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = value;
    return span;
  }

  // Build the optional leaderboard-submission form shown beneath the run stats.
  // `run` is the payload captured at completion (state.lastRun); the player only
  // adds a display name, and the local store owns validation/duplicate handling
  // (js/leaderboard-client.js + the shared rules in js/leaderboard-rules.js).
  //
  // Hard rule: this is purely additive. It only appears after a real completion
  // (showResults), never blocks PLAY AGAIN / LEVELS, and never throws into the
  // game — a missing rules/client module or unavailable storage just degrades
  // to "no form" or an "offline" message, leaving local play untouched.
  function buildSubmitSection(run) {
    const leaderboard = window.eightBitSatoshiLeaderboard;
    const ruleset = window.LeaderboardRules;
    const form = document.createElement("form");
    form.className = "results-submit";
    form.noValidate = true;

    // No client module loaded (or no captured run) → offer nothing rather than a
    // form that cannot work. Local play is unaffected.
    if (!leaderboard || !run) return form;

    const note = document.createElement("p");
    note.className = "results-submit-note";
    note.textContent = "Saved on this device only: display name, level, time and run stats. No account, no server.";

    const row = document.createElement("div");
    row.className = "results-submit-row";

    const input = document.createElement("input");
    input.className = "results-submit-name";
    input.type = "text";
    input.maxLength = ruleset ? ruleset.NAME_MAX : 12;
    input.placeholder = "YOUR NAME";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Display name for the leaderboard");

    const button = document.createElement("button");
    button.type = "submit";
    button.className = "primary-button results-submit-button";
    button.textContent = "SUBMIT TIME";

    row.append(input, button);

    const status = document.createElement("p");
    status.className = "results-submit-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    form.append(note, row, status);

    function setStatus(kind, text) {
      status.className = "results-submit-status" + (kind ? " is-" + kind : "");
      status.textContent = text;
    }

    // After a stored or duplicate run, lock the form so the same completion screen
    // cannot resubmit (prevents accidental double-submits). PLAY AGAIN starts a
    // fresh run with a fresh form.
    let submitted = false;
    function lockForm() {
      submitted = true;
      input.disabled = true;
      button.disabled = true;
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (submitted || button.disabled) return;

      // Instant name feedback before the store call. submitScore re-validates via
      // the same rules; this just surfaces the most common mistake (empty/too-long/
      // bad-character names) right away.
      const nameCheck = ruleset
        ? ruleset.validateName(input.value)
        : { ok: input.value.trim().length > 0, value: input.value.trim() };
      if (!nameCheck.ok) {
        setStatus("invalid", nameCheck.error || "Enter a valid name.");
        input.focus();
        return;
      }

      const submission = Object.assign({}, run, {
        playerName: nameCheck.value,
        clientTimestamp: new Date().toISOString()
      });

      const idleLabel = button.textContent;
      button.disabled = true;
      button.textContent = "SUBMITTING…";
      setStatus("pending", "Submitting your run…");

      let result;
      try {
        // submitScore is documented never to reject, but stay defensive so a thrown
        // error can never crash the results screen or block replay.
        result = await leaderboard.submitScore(submission);
      } catch (err) {
        result = { status: "error", message: String(err && err.message ? err.message : err) };
      }

      if (result.status === "ok") {
        // Remember the stored row (it carries its id) so the leaderboard view can
        // highlight this player's run when they open it.
        state.lastSubmittedEntry = result.entry || null;
        setStatus("ok", "You're on the leaderboard!");
        lockForm();
      } else if (result.status === "duplicate") {
        state.lastSubmittedEntry = result.entry || null;
        setStatus("ok", "This run is already on the leaderboard.");
        lockForm();
      } else if (result.status === "invalid") {
        const detail = result.errors && result.errors.length ? result.errors[0] : "Submission was rejected.";
        setStatus("invalid", detail);
        button.disabled = false;
        button.textContent = idleLabel;
        input.focus();
      } else if (result.status === "offline") {
        setStatus("offline", "Leaderboard offline — run not submitted. Keep playing and try again later.");
        button.disabled = false;
        button.textContent = idleLabel;
      } else {
        setStatus("error", "Couldn't submit — " + (result.message || "try again."));
        button.disabled = false;
        button.textContent = idleLabel;
      }
    }

    form.addEventListener("submit", handleSubmit);
    return form;
  }

  function gameOver() {
    state.phase = "gameover";
    stopMusic();
    playSfx("gameover");
    showMessage("REKT", "Fiat got you. Restart the run.", "TRY AGAIN", false, true);
  }

  // ----- Leaderboard view -------------------------------------------------------
  // An in-game overlay listing top times per level. Reachable from the title and
  // results screens. Like the rest of the leaderboard feature it is purely additive:
  // it owns no gameplay state, never throws into the loop, and degrades to clean
  // offline/error states when local storage is unavailable.

  // The playable levels the rules accept a submission for. Falls back to all
  // levels if the rules module is missing so the picker is never empty.
  const boardLevels = LEVELS.filter(function (level) {
    if (!leaderboardRules) return true;
    return Object.prototype.hasOwnProperty.call(leaderboardRules.SUBMITTABLE_LEVELS, level.id);
  });

  const COMBINED_BOARD_ID = (leaderboardRules && leaderboardRules.COMBINED_LEVEL_ID) || "combined";

  // The tabs the view offers: one per submittable level, plus the virtual combined
  // total when at least two levels can contribute to it. A board
  // descriptor is { id, kind: "level" | "combined", level, label, title }; `level`
  // is null for the combined board.
  const boards = boardLevels.map(function (level) {
    return {
      id: level.id,
      kind: "level",
      level: level,
      label: "LEVEL " + (LEVELS.indexOf(level) + 1),
      title: level.title
    };
  });
  if (boardLevels.length >= 2) {
    boards.push({
      id: COMBINED_BOARD_ID,
      kind: "combined",
      level: null,
      label: "COMBINED",
      title: "COMBINED TOTAL"
    });
  }

  // Monotonic token so a slow fetch from a previously-selected tab can never
  // overwrite the rows of the tab the player switched to in the meantime.
  let leaderboardRequestId = 0;

  function getCurrentBoard() {
    return boards.find(function (board) { return board.id === state.leaderboardLevelId; })
      || boards[0]
      || null;
  }

  // Short level tag ("L1"/"L2") used in the combined breakdown so a row stays
  // legible in the narrow frame.
  function levelShortLabel(levelId) {
    const index = LEVELS.findIndex(function (level) { return level.id === levelId; });
    return index >= 0 ? "L" + (index + 1) : levelId;
  }

  // Open the leaderboard, showing `boardId`'s board (defaults to the first board)
  // and remembering where to return: "results" reshows the completion screen, any
  // other origin returns to the title.
  function openLeaderboard(boardId, origin) {
    if (!leaderboardClient || boards.length === 0) return;
    stopMusic();
    const target = boards.find(function (board) { return board.id === boardId; }) || boards[0];
    state.leaderboardLevelId = target.id;
    state.leaderboardOrigin = origin || "title";
    state.phase = "leaderboard";
    titleScreen.classList.add("hidden");
    messageScreen.classList.add("hidden");
    leaderboardScreen.classList.remove("hidden");
    renderLeaderboardTabs();
    loadLeaderboard();
    if (leaderboardBack) leaderboardBack.focus();
  }

  function closeLeaderboard() {
    leaderboardScreen.classList.add("hidden");
    // Stop honoring in-flight responses so a late fetch can't render into a now-hidden board.
    leaderboardRequestId += 1;
    // Return focus to the button that opened the view so keyboard/screen-reader
    // users keep their place. Captured before restoring the screen so the target
    // is visible when focused.
    const opener = state.leaderboardOrigin === "results" ? resultsLeaderboardButton : leaderboardButton;
    if (state.leaderboardOrigin === "results") {
      state.phase = "complete";
      messageScreen.classList.remove("hidden");
    } else {
      showTitle();
    }
    state.leaderboardOrigin = null;
    if (opener && typeof opener.focus === "function") opener.focus();
  }

  function renderLeaderboardTabs() {
    if (!leaderboardTabs) return;
    const tabs = boards.map(function (board) {
      const active = board.id === state.leaderboardLevelId;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "leaderboard-tab";
      tab.classList.toggle("active", active);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.setAttribute("aria-controls", "leaderboard-body");
      tab.dataset.levelId = board.id;
      tab.textContent = board.label;
      tab.setAttribute(
        "aria-label",
        board.kind === "combined"
          ? "Combined total leaderboard across all levels"
          : "Level " + (LEVELS.indexOf(board.level) + 1) + " leaderboard, " + board.title
      );
      tab.addEventListener("click", function () {
        if (state.leaderboardLevelId === board.id) return;
        state.leaderboardLevelId = board.id;
        renderLeaderboardTabs();
        loadLeaderboard();
      });
      return tab;
    });
    leaderboardTabs.replaceChildren(...tabs);
  }

  // A centered single-line state (loading / empty / offline / error), optionally
  // with a RETRY button that re-runs the current board's fetch.
  function leaderboardMessage(kind, text, withRetry) {
    const wrap = document.createElement("div");
    wrap.className = "leaderboard-message" + (kind ? " is-" + kind : "");
    const message = document.createElement("p");
    message.className = "leaderboard-message-text";
    message.textContent = text;
    wrap.append(message);
    if (withRetry) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "primary-button secondary-button";
      retry.textContent = "RETRY";
      retry.addEventListener("click", function () { loadLeaderboard(); });
      wrap.append(retry);
    }
    return wrap;
  }

  function setLeaderboardBody(node) {
    if (leaderboardBody) leaderboardBody.replaceChildren(node);
  }

  function lbCell(area, text) {
    const span = document.createElement("span");
    span.className = "lb-" + area;
    span.textContent = text;
    return span;
  }

  // Short, locale-independent date for a row. The serverTimestamp is ISO 8601, so
  // its first 10 chars are the UTC calendar date (YYYY-MM-DD); empty if absent.
  function formatRunDate(iso) {
    return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
  }

  function buildLeaderboardTable(level, entries) {
    // Stats read in the board level's own terms (BTC vs SATS, PAGES vs PATCHES).
    const coinLabel = (level.labels && level.labels.coin) || "BTC";
    const pageLabel = (level.labels && level.labels.pageStat) || "PAGES";
    const youId = state.lastSubmittedEntry ? state.lastSubmittedEntry.id : null;

    const table = document.createElement("div");
    table.className = "leaderboard-table";

    for (const entry of entries) {
      const isYou = !!youId && entry.id === youId;
      const date = formatRunDate(entry.serverTimestamp);
      // Context stats only — ANY% ranks on time alone.
      const metaParts = [
        entry.deaths + (entry.deaths === 1 ? " death" : " deaths"),
        entry.coins + " " + coinLabel,
        entry.pages + "/" + entry.pagesTotal + " " + pageLabel
      ];
      if (date) metaParts.push(date);

      const row = document.createElement("div");
      row.className = "leaderboard-row";
      if (isYou) row.classList.add("is-you");
      row.append(
        lbCell("rank", String(entry.rank)),
        lbCell("name", entry.playerName),
        lbCell("time", formatTime(entry.time)),
        lbCell("meta", metaParts.join(" · "))
      );
      row.setAttribute(
        "aria-label",
        "Rank " + entry.rank + ", " + entry.playerName + (isYou ? " (your run)" : "")
          + ", time " + formatTime(entry.time) + ", " + metaParts.join(", ")
      );
      table.append(row);
    }
    return table;
  }

  // A short instructional line shown above the combined board explaining what the
  // player still needs (acceptance: "understand what they still need to qualify").
  function leaderboardHint(text) {
    const hint = document.createElement("p");
    hint.className = "leaderboard-hint";
    hint.textContent = text;
    return hint;
  }

  // Personalised combined-progress line from the `you` summary. Tells a player
  // which level(s) they still need, confirms when they qualify, or — when we don't
  // know who they are this session — explains the combined board generically.
  function buildCombinedHint(you) {
    // Generic fallback shown whenever we can't say anything player-specific: no
    // `you` at all, or a `you` without actionable detail (a correct combinedProgress
    // never produces the latter, but guard against a malformed one anyway).
    const generic = "The combined board ranks your total time across all levels — post a time on each to appear here.";
    if (!you) return leaderboardHint(generic);
    if (you.qualified) {
      // time is always set when qualified; guard the display so a corrupt value
      // degrades to a neutral mark instead of "NaN:NaN.NaN".
      const total = typeof you.time === "number" ? formatTime(you.time) : "—";
      return leaderboardHint("You qualify! Your combined total is " + total + " across all levels.");
    }
    const missing = Array.isArray(you.missing) ? you.missing : [];
    if (missing.length === 0) return leaderboardHint(generic);
    const names = missing.map(function (levelId) {
      const level = LEVELS.find(function (l) { return l.id === levelId; });
      return levelShortLabel(levelId) + (level ? " (" + level.title + ")" : "");
    });
    return leaderboardHint("Finish " + names.join(" and ") + " to qualify for the combined total.");
  }

  // Build a combined-board row's level breakdown ("L1 1:02.40 · L2 1:55.10"), in
  // the canonical level order, from the entry's `levels` map.
  function combinedBreakdown(levels) {
    if (!levels || !leaderboardRules) return [];
    return Object.keys(leaderboardRules.SUBMITTABLE_LEVELS)
      .filter(function (levelId) { return levels[levelId]; })
      .map(function (levelId) { return levelShortLabel(levelId) + " " + formatTime(levels[levelId].time); });
  }

  // The combined board: total time across both levels, with each
  // contributing level time shown in the row meta. Highlights the current player by
  // name (combined rows carry a derived id, so we match on name, not lastSubmittedEntry.id).
  function buildCombinedTable(entries, you) {
    const youName = (you && you.playerName) ||
      (state.lastSubmittedEntry && state.lastSubmittedEntry.playerName) || "";
    const youKey = youName.trim().toLowerCase();

    const container = document.createElement("div");
    const hint = buildCombinedHint(you);
    if (hint) container.append(hint);

    const table = document.createElement("div");
    table.className = "leaderboard-table";
    for (const entry of entries) {
      const isYou = !!youKey && typeof entry.playerName === "string" &&
        entry.playerName.trim().toLowerCase() === youKey;
      const date = formatRunDate(entry.serverTimestamp);
      const breakdown = combinedBreakdown(entry.levels);
      const metaParts = breakdown.slice();
      if (date) metaParts.push(date);

      const row = document.createElement("div");
      row.className = "leaderboard-row";
      if (isYou) row.classList.add("is-you");
      row.append(
        lbCell("rank", String(entry.rank)),
        lbCell("name", entry.playerName),
        lbCell("time", formatTime(entry.time)),
        lbCell("meta", metaParts.join(" · "))
      );
      row.setAttribute(
        "aria-label",
        "Rank " + entry.rank + ", " + entry.playerName + (isYou ? " (your run)" : "")
          + ", total time " + formatTime(entry.time)
          + (breakdown.length ? ", " + breakdown.join(", ") : "")
      );
      table.append(row);
    }
    container.append(table);
    return container;
  }

  // Empty state for the combined board: no player has posted both level times yet.
  // Still shows the personalised hint so a half-qualified player learns what's left.
  function buildCombinedEmpty(you) {
    const wrap = document.createElement("div");
    wrap.className = "leaderboard-message is-empty";
    const message = document.createElement("p");
    message.className = "leaderboard-message-text";
    message.textContent = "No combined times yet. Post a time on every level to be the first!";
    wrap.append(message);
    const hint = buildCombinedHint(you);
    if (hint) wrap.append(hint);
    return wrap;
  }

  // Fetch and render the currently-selected board. Resolves every client status to
  // a visible state and never throws; the request token guards against tab-switch races.
  async function loadLeaderboard() {
    const board = getCurrentBoard();
    if (!leaderboardClient || !leaderboardRules || !board) {
      setLeaderboardBody(leaderboardMessage("error", "Leaderboard is unavailable.", false));
      return;
    }

    const requestId = (leaderboardRequestId += 1);
    setLeaderboardBody(leaderboardMessage("loading", "Loading times…", false));

    const params = {
      levelId: board.id,
      category: leaderboardRules.CATEGORIES[0],
      gameVersion: GAME_VERSION,
      rulesVersion: TIMING_RULES.version,
      limit: 50
    };
    // For the combined board, tell the store who "you" are (if we know from a
    // submission this session) so it can report what's left to qualify.
    if (board.kind === "combined" && state.lastSubmittedEntry) {
      params.playerName = state.lastSubmittedEntry.playerName;
    }

    let result;
    try {
      result = await leaderboardClient.fetchLeaderboard(params);
    } catch (err) {
      result = { status: "error", message: String(err && err.message ? err.message : err) };
    }

    // A newer request (tab switch or close) superseded this one — drop the result.
    if (requestId !== leaderboardRequestId) return;

    if (result.status === "offline") {
      setLeaderboardBody(leaderboardMessage(
        "offline",
        "Local scores unavailable — your browser is blocking storage.",
        true
      ));
      return;
    }
    if (result.status !== "ok") {
      setLeaderboardBody(leaderboardMessage(
        "error",
        "Couldn't load the leaderboard. " + (result.message || "Try again."),
        true
      ));
      return;
    }
    if (!Array.isArray(result.entries) || result.entries.length === 0) {
      if (board.kind === "combined") {
        setLeaderboardBody(buildCombinedEmpty(result.you));
      } else {
        setLeaderboardBody(leaderboardMessage(
          "empty",
          "No times yet. Finish " + board.title + " to claim the top spot!",
          false
        ));
      }
      return;
    }
    if (board.kind === "combined") {
      setLeaderboardBody(buildCombinedTable(result.entries, result.you));
    } else {
      setLeaderboardBody(buildLeaderboardTable(board.level, result.entries));
    }
  }

  function update(dt) {
    if (state.phase !== "playing" || state.paused) return;

    state.time += dt;
    if (state.subMode === "brawler") {
      brawler.update(dt, input);
      input.throwPressed = false;
      input.specialPressed = false;
      input.jumpPressed = false;
      input.jumpReleased = false;
      input.firePressed = false;
      return;
    }
    state.toastTime = Math.max(0, state.toastTime - dt);
    // Queued ambient lines (NPC exchanges) play out one at a time as the
    // current toast expires, so a two-line exchange reads naturally without
    // ever blocking input or the timer.
    if (state.toastTime <= 0 && state.toastQueue.length > 0) {
      state.toast = state.toastQueue.shift();
      state.toastTime = 2.4;
    }
    state.shake = Math.max(0, state.shake - dt);
    player.invincible = Math.max(0, player.invincible - dt);

    if (state.subMode === "overworld") {
      updateOverworld(dt);
      updateParticles(dt);
      input.jumpPressed = false;
      input.jumpReleased = false;
      input.firePressed = false;
      return;
    }

    updateZone();
    updatePlayer(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateCollectibles();
    updateCheckpoints();
    updateAllies();
    updateParticles(dt);

    if (overlap(player, goal)) {
      // A venue's exit door returns to the city; only a level's own goal
      // finishes the run. Return right away after an exit so the side-view
      // camera clamp below can't clobber the overworld camera for a frame.
      if (state.subMode === "venue") {
        const venue = getCurrentLevel().venues[state.venueKey];
        const floor = venue && venue.floors ? venue.floors[state.floorIndex] : null;
        // Stairwell goal: load the connected floor instead of leaving.
        if (floor && floor.goalTo != null) {
          loadVenueLayout(venue, floor.goalTo);
          input.jumpPressed = false;
          input.jumpReleased = false;
          input.firePressed = false;
          return;
        }
        exitVenue();
        input.jumpPressed = false;
        input.jumpReleased = false;
        input.firePressed = false;
        return;
      }
      completeGame();
    }

    state.cameraX = clamp(player.x - 94, 0, WORLD_W - VIEW_W);
    input.jumpPressed = false;
    input.jumpReleased = false;
    input.firePressed = false;
  }

  // ----- Overworld update -----------------------------------------------------

  // Axis-separated tile collision for the top-down walker: move on one axis,
  // then push out of any solid tile the box now overlaps.
  function owMoveAxis(dx, dy) {
    owPlayer.x += dx;
    owPlayer.y += dy;
    const minTx = Math.floor(owPlayer.x / TILE);
    const maxTx = Math.floor((owPlayer.x + owPlayer.w - 1) / TILE);
    const minTy = Math.floor(owPlayer.y / TILE);
    const maxTy = Math.floor((owPlayer.y + owPlayer.h - 1) / TILE);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        if (!owSolidAt(tx, ty)) continue;
        if (dx > 0) owPlayer.x = tx * TILE - owPlayer.w;
        else if (dx < 0) owPlayer.x = (tx + 1) * TILE;
        else if (dy > 0) owPlayer.y = ty * TILE - owPlayer.h;
        else if (dy < 0) owPlayer.y = (ty + 1) * TILE;
      }
    }
  }

  function updateOverworld(dt) {
    const level = getCurrentLevel();
    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    // Normalize diagonals so walking diagonally is never faster.
    const len = Math.hypot(mx, my) || 1;
    if (mx !== 0) owMoveAxis((mx / len) * OW_SPEED * dt, 0);
    if (my !== 0) owMoveAxis(0, (my / len) * OW_SPEED * dt);
    owPlayer.moving = mx !== 0 || my !== 0;
    if (mx < 0) owPlayer.facing = "left";
    else if (mx > 0) owPlayer.facing = "right";
    else if (my < 0) owPlayer.facing = "up";
    else if (my > 0) owPlayer.facing = "down";

    const cx = owPlayer.x + owPlayer.w / 2;
    const cy = owPlayer.y + owPlayer.h / 2;
    const ptx = Math.floor(cx / TILE);
    const pty = Math.floor(cy / TILE);

    // Traffic grace window ticks down even while standing still.
    owPlayer.invincible = Math.max(0, owPlayer.invincible - dt);

    // Taxis cruise fixed routes on a deterministic ping-pong clock — same
    // pattern every attempt, ANY% safe. Touching one sends you back to the
    // spawn curb at the cost of a life.
    for (const taxi of ow.taxis) {
      const span = Math.max(1, (taxi.to - taxi.from) * TILE);
      const m = mod(state.time * (taxi.speed || 60) + (taxi.phase || 0), span * 2);
      const p = m < span ? m : span * 2 - m;
      taxi.dir = m < span ? 1 : -1;
      if (taxi.axis === "h") {
        taxi.box = { x: taxi.from * TILE + p - 7, y: taxi.row * TILE + 4, w: 14, h: 8 };
      } else {
        taxi.box = { x: taxi.lane * TILE + 3, y: taxi.from * TILE + p - 7, w: 10, h: 14 };
      }
      if (owPlayer.invincible <= 0 && overlap(owPlayer, taxi.box)) {
        owHurt();
        return;
      }
    }

    // Sat pickups.
    for (const coin of ow.coins) {
      if (coin.taken || coin.tx !== ptx || coin.ty !== pty) continue;
      coin.taken = true;
      state.coins += 1;
      state.score += 50;
      burst(cx, cy, palette.orange, 5);
      playSfx("coin");
      syncHud();
    }

    // NPC ambient exchanges: fire once per run when the walker gets close.
    for (const npc of ow.npcs) {
      if (npc.greeted) continue;
      const nx = npc.tx * TILE + TILE / 2;
      const ny = npc.ty * TILE + TILE / 2;
      if (Math.abs(nx - cx) < 22 && Math.abs(ny - cy) < 22) {
        npc.greeted = true;
        const [first, ...rest] = npc.lines;
        state.toast = first;
        state.toastTime = 2.4;
        state.toastQueue.push(...rest);
      }
    }

    // Venue doors: stepping onto the door tile walks you inside.
    for (const door of ow.doors) {
      if (door.tx === ptx && door.ty === pty) {
        enterVenue(door.key);
        return;
      }
    }

    // The Bull: locked until every venue is cleared, then it ends the run.
    if (ow.exit && ow.exit.tx === ptx && ow.exit.ty === pty) {
      const total = Object.keys(level.venues).length;
      if (state.venuesCleared.length >= total) {
        completeGame();
      } else if (state.toastTime <= 0) {
        const left = total - state.venuesCleared.length;
        state.toast = `Still locked — clear ${left} more venue${left === 1 ? "" : "s"}.`;
        state.toastTime = 2;
      }
    }

    // Camera follows the walker on both axes, clamped to the map.
    const mapW = ow.cols * TILE;
    const mapH = ow.rows * TILE;
    state.cameraX = clamp(cx - VIEW_W / 2, 0, Math.max(0, mapW - VIEW_W));
    state.cameraY = clamp(cy - VIEW_H / 2, 0, Math.max(0, mapH - VIEW_H));
  }

  // Traffic hit in the overworld: costs a life and puts the walker back on
  // the spawn curb. Mirrors hurtPlayer but only touches overworld state — the
  // side-view fields (checkpointX, camera) belong to venue interiors.
  function owHurt() {
    if (owPlayer.invincible > 0) return;
    const level = getCurrentLevel();
    state.lives -= 1;
    state.deaths += 1;
    syncHud(true);
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    burst(owPlayer.x + owPlayer.w / 2, owPlayer.y + owPlayer.h / 2, palette.yellow, 12);
    playSfx("hurt");
    owPlayer.x = level.spawn.tx * TILE + (TILE - OW_PW) / 2;
    owPlayer.y = level.spawn.ty * TILE + (TILE - OW_PH) / 2;
    owPlayer.facing = "down";
    owPlayer.invincible = 1.6;
    state.toast = "Traffic! Back on the curb.";
    state.toastTime = 1.6;
  }

  function updateZone() {
    // Venue interiors have a single fixed zone (venueZone); the zones array
    // belongs to the enclosing level, so scanning it here would be meaningless.
    if (state.subMode === "venue") return;
    let zoneIndex = 0;
    for (let i = zones.length - 1; i >= 0; i -= 1) {
      if (player.x >= zones[i].x) {
        zoneIndex = i;
        break;
      }
    }

    if (zoneIndex !== state.currentZone) {
      state.currentZone = zoneIndex;
      state.toast = zones[zoneIndex].text;
      state.toastTime = 3.2;
      syncHud(true);
    }
  }

  function updatePlayer(dt) {
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = player.onGround ? RUN_ACCEL : AIR_ACCEL;

    if (move !== 0) {
      player.vx += move * accel * dt;
      player.facing = move;
    } else if (player.onGround) {
      const drop = FRICTION * dt;
      if (Math.abs(player.vx) <= drop) player.vx = 0;
      else player.vx -= Math.sign(player.vx) * drop;
    }

    player.vx = clamp(player.vx, -MAX_RUN, MAX_RUN);

    if (input.jumpPressed) player.jumpBuffer = JUMP_BUFFER;
    else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

    player.coyote = player.onGround ? COYOTE : Math.max(0, player.coyote - dt);

    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = getJumpImpulse();
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      burst(player.x + player.w * 0.5, player.y + player.h, palette.paper2, 4);
      playSfx("jump");
    }

    if (input.jumpReleased && player.vy < -120) {
      player.vy *= 0.58;
    }

    // Sat cannon (venues that grant it only): fire on press, with a short
    // refire cooldown. firePressed is consumed here; held fire does nothing.
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (input.firePressed && hasSatCannon() && player.fireCooldown <= 0) {
      player.fireCooldown = FIRE_COOLDOWN;
      spawnSatShot();
    }

    player.vy = Math.min(player.vy + GRAVITY * dt, 560);
    moveAxis(player, player.vx * dt, 0);
    player.onGround = false;
    moveAxis(player, 0, player.vy * dt);

    // Kick up small dust puffs while sprinting on the ground.
    player.dustT = Math.max(0, player.dustT - dt);
    if (player.onGround && Math.abs(player.vx) > 100 && player.dustT === 0) {
      player.dustT = 0.14;
      burst(player.x + player.w / 2 - player.facing * 5, player.y + player.h - 1, "#9a938a", 2);
    }

    if (player.y > VIEW_H + 40) hurtPlayer(true);

    for (const hazard of hazards) {
      if (overlap(player, hazard)) {
        hurtPlayer(false);
        break;
      }
    }
  }

  // Whether a Confirmation Block is currently solid. The cadence is driven by
  // the run clock (state.time, in seconds), which advances on the fixed timestep
  // and pauses with the game — so the pattern is identical on every attempt and
  // uses no randomness, keeping timed runs fair. Static solids (no cycle) and
  // malformed cycles are always solid so a bad definition fails safe (passable
  // would mean an impassable level).
  function isConfirmed(solid) {
    const cycle = solid.cycle;
    // Fail safe to solid if any required field is missing/non-positive — a bad
    // cycle should never make a platform permanently non-solid (which could make
    // a level uncompletable) without a loud failure elsewhere.
    if (!cycle || !(cycle.periodMs > 0) || !(cycle.onMs > 0)) return true;
    const clockMs = state.time * 1000;
    return ((clockMs + (cycle.phaseMs || 0)) % cycle.periodMs) < cycle.onMs;
  }

  function moveAxis(body, dx, dy) {
    if (dx !== 0) body.x += dx;
    if (dy !== 0) body.y += dy;

    for (const solid of solids) {
      if (!overlap(body, solid)) continue;
      // Unconfirmed Confirmation Blocks are non-solid: skip collision so the
      // body passes through (or falls) until the block confirms again.
      // isConfirmed() returns true for static (non-cycle) solids, so this shares
      // the exact predicate the renderer uses.
      if (!isConfirmed(solid)) continue;

      if (dx > 0) {
        body.x = solid.x - body.w;
        body.vx = 0;
      } else if (dx < 0) {
        body.x = solid.x + solid.w;
        body.vx = 0;
      } else if (dy > 0) {
        body.y = solid.y - body.h;
        if (solid.kind === "crowd") {
          // CROWD SURGE pad: landing launches you instead of settling. onGround
          // stays false so this is a bounce, not a platform — you ride the
          // crowd, you don't stand on it. Only the player ever runs moveAxis.
          body.vy = CROWD_BOUNCE;
          burst(body.x + body.w * 0.5, solid.y, palette.orange, 8);
          playSfx("crowd");
          if (!state.crowdSurfed) {
            state.crowdSurfed = true;
            state.toast = "Crowd surge! The people carry you.";
            state.toastTime = 1.8;
          }
        } else {
          body.vy = 0;
          body.onGround = true;
        }
      } else if (dy < 0) {
        body.y = solid.y + solid.h;
        body.vy = 20;
        bumpBlock(solid);
      }
    }

    body.x = clamp(body.x, 0, WORLD_W - body.w);
  }

  function bumpBlock(solid) {
    if (solid.kind !== "question" || solid.hit) return;
    solid.hit = true;
    state.coins += 3;
    state.score += 300;
    state.toast = `+3 ${levelLabel("coin", "BTC")}`;
    state.toastTime = 1.2;
    burst(solid.x + solid.w * 0.5, solid.y, palette.orange, 10);
    playSfx("block");
    syncHud();
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) {
        enemy.squashed -= dt;
        continue;
      }

      // Shitgun turrets are stationary: instead of patrolling they lob a
      // shitcoin at the player on a fixed cadence whenever they are in range.
      if (enemy.type === "shitgun") {
        enemy.fireTimer -= dt;
        const dx = (player.x + player.w / 2) - (enemy.x + enemy.w / 2);
        if (enemy.fireTimer <= 0 && Math.abs(dx) < SHITGUN_RANGE && Math.abs(dx) > 18) {
          enemy.fireTimer = SHITGUN_PERIOD;
          spawnShot(enemy.x + (dx > 0 ? enemy.w : -6), enemy.y + 5, Math.sign(dx) * SHITCOIN_SPEED);
        }
      } else if (enemy.type === "agent") {
        // Wall Street agents hold their ground, telegraph with a raised arm,
        // then hurl an arcing shitcoin at the intruder. Fully deterministic.
        if (enemy.windup > 0) {
          enemy.windup -= dt;
          if (enemy.windup <= 0) {
            const dx = (player.x + player.w / 2) - (enemy.x + enemy.w / 2);
            spawnShot(enemy.x + enemy.w / 2 - 3, enemy.y - 2, (dx >= 0 ? 1 : -1) * 92, -238);
          }
        } else {
          enemy.x += enemy.vx * dt;
          if (enemy.x <= enemy.minX || enemy.x + enemy.w >= enemy.maxX) {
            enemy.vx *= -1;
            enemy.x = clamp(enemy.x, enemy.minX, enemy.maxX - enemy.w);
          }
          enemy.throwTimer -= dt;
          const dx = Math.abs((player.x + player.w / 2) - (enemy.x + enemy.w / 2));
          if (enemy.throwTimer <= 0 && dx < AGENT_THROW_RANGE) {
            enemy.throwTimer = AGENT_THROW_PERIOD;
            enemy.windup = AGENT_WINDUP;
          }
        }
      } else {
        enemy.x += enemy.vx * dt;
        if (enemy.x <= enemy.minX || enemy.x + enemy.w >= enemy.maxX) {
          enemy.vx *= -1;
          enemy.x = clamp(enemy.x, enemy.minX, enemy.maxX - enemy.w);
        }
      }
      if (!overlap(player, enemy)) continue;

      const playerBottom = player.y + player.h;
      const stomped = player.vy > 90 && playerBottom - enemy.y < 12;
      if (stomped) {
        const cfg = enemyConfig(enemy.type);
        enemy.alive = false;
        enemy.squashed = 0.3;
        player.vy = STOMP;
        state.score += cfg.score;
        if (state.subMode === "venue") state.visitKills += 1;
        state.toast = cfg.stompToast;
        state.toastTime = 1.1;
        burst(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, cfg.spark, 8);
        playSfx("stomp");
      } else {
        hurtPlayer(false);
      }
    }
  }

  // ----- Projectiles ----------------------------------------------------------

  function spawnShot(x, y, vx, lobVy) {
    for (const s of shots) {
      if (s.alive) continue;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.vx = vx;
      s.vy = lobVy || 0;
      s.lob = !!lobVy;
      playSfx("shitshot");
      return;
    }
  }

  function spawnSatShot() {
    for (const s of satShots) {
      if (s.alive) continue;
      s.alive = true;
      s.x = player.facing > 0 ? player.x + player.w : player.x - 6;
      s.y = player.y + 9;
      s.vx = player.facing * SAT_SHOT_SPEED;
      playSfx("satshot");
      return;
    }
  }

  // Does the active venue arm the sat cannon?
  function hasSatCannon() {
    if (state.subMode !== "venue") return false;
    const venue = getCurrentLevel().venues[state.venueKey];
    return !!venue && venue.weapon === "satcannon";
  }

  // A moving shot box against the solids. Both projectile kinds die on walls
  // (except sat shots, which damage barricades first — handled by the caller).
  function shotHitsSolid(box) {
    for (const solid of solids) {
      if (!isConfirmed(solid)) continue;
      if (overlap(box, solid)) return solid;
    }
    return null;
  }

  function updateShots(dt) {
    // Enemy shitcoins: hurt on touch, die on any solid or off-world. Lobbed
    // coins additionally fall under SHOT_GRAVITY until they hit something.
    for (const s of shots) {
      if (!s.alive) continue;
      if (s.lob) s.vy += SHOT_GRAVITY * dt;
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      const box = { x: s.x, y: s.y, w: 8, h: 8 };
      if (s.x < -12 || s.x > WORLD_W + 12 || s.y > VIEW_H + 12 || shotHitsSolid(box)) {
        s.alive = false;
        continue;
      }
      if (overlap(box, player)) {
        s.alive = false;
        hurtPlayer(false);
      }
    }

    // Player sat shots: break barricades (3 hits), kill any enemy — including
    // turrets — and die on other solids.
    for (const s of satShots) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      const box = { x: s.x, y: s.y, w: 6, h: 4 };
      if (s.x < -12 || s.x > WORLD_W + 12) {
        s.alive = false;
        continue;
      }
      const solid = shotHitsSolid(box);
      if (solid) {
        s.alive = false;
        if (solid.kind === "barricade") damageBarricade(solid);
        continue;
      }
      for (const enemy of enemies) {
        if (!enemy.alive || !overlap(box, enemy)) continue;
        const cfg = enemyConfig(enemy.type);
        s.alive = false;
        enemy.alive = false;
        enemy.squashed = 0.3;
        state.score += cfg.score;
        if (state.subMode === "venue") state.visitKills += 1;
        state.toast = cfg.stompToast;
        state.toastTime = 1.1;
        burst(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, cfg.spark, 8);
        playSfx("stomp");
        break;
      }
    }
  }

  function damageBarricade(solid) {
    const barricade = barricades.find((b) => b.solid === solid);
    if (!barricade) return;
    barricade.hp -= 1;
    burst(solid.x + solid.w / 2, solid.y + solid.h / 2, palette.brown, 6);
    if (barricade.hp <= 0) {
      const index = solids.indexOf(solid);
      if (index >= 0) solids.splice(index, 1);
      barricades.splice(barricades.indexOf(barricade), 1);
      state.score += 150;
      state.toast = "Token wall down!";
      state.toastTime = 1.2;
      burst(solid.x + solid.w / 2, solid.y + solid.h / 2, palette.violet, 12);
      playSfx("block");
    } else {
      playSfx("blockhit");
    }
  }

  function updateCollectibles() {
    for (const coin of coins) {
      if (!coin.taken && overlap(player, coin)) {
        coin.taken = true;
        state.coins += 1;
        state.score += 50;
        burst(coin.x + 4, coin.y + 4, palette.orange, 5);
        playSfx("coin");
        syncHud();
      }
    }

    for (const page of pages) {
      if (!page.taken && overlap(player, page)) {
        page.taken = true;
        // Venue stashes are one-shot for the whole run: remember the venue so
        // re-entering it never rebuilds (and double-counts) its stash.
        if (state.subMode === "venue" && !state.stashesTaken.includes(state.venueKey)) {
          state.stashesTaken.push(state.venueKey);
        }
        state.pages += 1;
        state.score += 250;
        state.toast = `${levelLabel("pageNote", "Whitepaper page")} ${state.pages}/${levelPageTotal(getCurrentLevel())}`;
        state.toastTime = 1.7;
        burst(page.x + 5, page.y + 7, palette.paper, 10);
        playSfx("page");
        syncHud();
      }
    }
  }

  function updateCheckpoints() {
    for (const checkpoint of checkpoints) {
      if (!checkpoint.taken && player.x > checkpoint.x) {
        checkpoint.taken = true;
        state.checkpointX = checkpoint.x;
        recordSplit(checkpoint);
        burst(checkpoint.x, checkpoint.y, palette.blue, 8);
      }
    }
  }

  // Record the elapsed total and section split when a checkpoint is first
  // reached. The checkpoint's `taken` flag (set before this runs) guarantees a
  // single split per checkpoint per run; the index check is a defensive backstop.
  function recordSplit(checkpoint) {
    if (state.splits.some((entry) => entry.index === checkpoint.index)) return;
    const previousTotal = state.splits.length ? state.splits[state.splits.length - 1].total : 0;
    const total = state.time;
    const split = Math.max(0, total - previousTotal);
    state.splits.push({ index: checkpoint.index, name: checkpoint.name, total, split });
    // Flag the section as faster than the saved personal-best split, showing how
    // much time was gained so players feel the improvement mid-run.
    const bestSplit = state.bestSplits[checkpoint.index];
    const faster = typeof bestSplit === "number" && split < bestSplit;
    const marker = faster ? ` -${formatTime(bestSplit - split)}` : "";
    state.toast = `${checkpoint.name} ${formatTime(split)}${marker}`;
    state.toastTime = 1.6;
    playSfx("checkpoint");
  }

  // Fire an ally's ambient line the first time the player crosses its trigger.
  // This only writes to the existing non-blocking toast (no input lock, no timer
  // pause), and runs after updateCheckpoints so a checkpoint split — the more
  // important readout — wins if the two ever coincided. Triggers are placed away
  // from zone/checkpoint boundaries in the level data so that does not happen.
  function updateAllies() {
    for (const ally of allies) {
      if (ally.greeted || !ally.line) continue;
      if (player.x > ally.triggerX) {
        ally.greeted = true;
        state.toast = ally.line;
        state.toastTime = 2.4;
      }
    }
  }

  function hurtPlayer(fell) {
    if (player.invincible > 0 && !fell) return;

    state.lives -= 1;
    // Deaths accumulate across checkpoint respawns within a run; they reset only
    // on a full restart (resetRun(true)), matching how the run timer behaves.
    state.deaths += 1;
    syncHud(true);

    if (state.lives <= 0) {
      gameOver();
      return;
    }

    burst(player.x + player.w * 0.5, player.y + player.h * 0.5, palette.red, 14);
    playSfx("hurt");
    resetRun(false);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += 460 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function burst(x, y, color, count) {
    let spawned = 0;
    for (const p of particles) {
      if (p.alive) continue;
      const angle = (spawned / Math.max(1, count)) * Math.PI * 2 + state.time;
      const speed = 38 + spawned * 6;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 80;
      p.life = 0.38 + spawned * 0.012;
      p.color = color;
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  function render() {
    if (state.subMode === "brawler") {
      brawlerArt.draw(brawler.state);
      syncBrawlerHud();
      return;
    }
    if (state.subMode === "overworld") {
      renderOverworld();
      syncTimer();
      return;
    }
    const shakeX = state.shake > 0 ? Math.round(Math.sin(state.time * 92) * 2) : 0;
    const cam = Math.round(state.cameraX - shakeX);
    const zone = activeZone();

    drawBackground(cam, zone);
    // Lobby sparrows flit along the upper wall, behind the furniture.
    if (getTheme() === "wallstreet") drawLobbyBirds(cam);
    drawSolids(cam, zone);
    drawHazards(cam);
    drawCoins(cam);
    drawPages(cam);
    drawAllies(cam);
    drawCheckpoints(cam);
    drawGoal(cam);
    drawEnemies(cam);
    drawShots(cam);
    drawParticles(cam);
    drawPlayer(cam);
    drawToast();
    drawVignette();

    syncTimer();
  }

  // ----- Overworld rendering --------------------------------------------------
  // The top-down city: cobblestone streets, building blocks with lit windows
  // and awnings, water, venue doors, the vault, NPCs, sats, and the walker.
  // Camera scrolls on both axes; everything is culled to the visible tiles.
  function renderOverworld() {
    const camX = Math.round(state.cameraX);
    const camY = Math.round(state.cameraY);
    const minTx = Math.max(0, Math.floor(camX / TILE));
    const maxTx = Math.min(ow.cols - 1, Math.floor((camX + VIEW_W) / TILE));
    const minTy = Math.max(0, Math.floor(camY / TILE));
    const maxTy = Math.min(ow.rows - 1, Math.floor((camY + VIEW_H) / TILE));

    ctx.fillStyle = "#565d63";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        drawOwTile(ow.grid[ty][tx], tx, ty, tx * TILE - camX, ty * TILE - camY);
      }
    }

    // Sats on the streets.
    const pulse = Math.floor(state.time * 8) % 2;
    for (const coin of ow.coins) {
      if (coin.taken) continue;
      const x = coin.tx * TILE - camX + 4;
      const y = coin.ty * TILE - camY + 4;
      if (x < -12 || x > VIEW_W + 12 || y < -12 || y > VIEW_H + 12) continue;
      ctx.fillStyle = palette.orange2;
      rect(x + 1 + pulse, y, 6 - pulse * 2, 8);
      ctx.fillStyle = palette.orange;
      rect(x + 2 + pulse, y + 1, 4 - pulse * 2, 6);
      ctx.fillStyle = palette.yellow;
      rect(x + 3, y + 2, 2, 2);
    }

    for (const npc of ow.npcs) {
      const x = npc.tx * TILE - camX;
      const y = npc.ty * TILE - camY;
      if (x < -20 || x > VIEW_W + 20 || y < -24 || y > VIEW_H + 24) continue;
      drawOwNpc(npc, x, y);
    }

    // Taxis above street furniture, below the walker.
    for (const taxi of ow.taxis) {
      if (!taxi.box) continue;
      const x = Math.round(taxi.box.x - camX);
      const y = Math.round(taxi.box.y - camY);
      if (x < -20 || x > VIEW_W + 20 || y < -20 || y > VIEW_H + 20) continue;
      drawOwTaxi(x, y, taxi.axis, taxi.dir);
    }

    // A flock crossing the district overhead.
    drawOverworldBirds(camX, camY);

    // Particles live in world space; the overworld camera scrolls both axes.
    for (const p of particles) {
      if (!p.alive) continue;
      ctx.fillStyle = p.color;
      rect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2);
    }
    drawOwWalker(Math.round(owPlayer.x - camX), Math.round(owPlayer.y - camY));
    drawToast();
    drawVignette();
  }

  // One city tile. Dispatches to themed helpers: '#' renders as a per-block
  // styled building (brick / slate / sandstone / glass tower / concrete) with
  // street-level facades and rooftop props; '~' is animated water; 'g'/'t' are
  // park grass and trees; streets get cobble specks plus crosswalk stripes,
  // steaming manholes, venue doors, and the level exit.
  function drawOwTile(t, tx, ty, x, y) {
    if (t === "#") {
      drawOwBuilding(tx, ty, x, y);
      return;
    }
    if (t === "~") {
      // Harbor/river water: deep patches, two drifting wave-crest rows and a
      // sparkle, plus foam lines wherever land touches this tile.
      ctx.fillStyle = "#2459a8";
      rect(x, y, TILE, TILE);
      if (mod(tx * 19 + ty * 7, 6) < 2) {
        ctx.fillStyle = "#1e4f92";
        rect(x + 2, y + 3, 7, 4);
        rect(x + 9, y + 10, 5, 3);
      }
      const ph = Math.floor(state.time * 3);
      ctx.fillStyle = "#4aa8f0";
      rect(x + mod(ph * 2 + tx * 5, 12) + 1, y + 4, 4, 1);
      rect(x + mod(ph * 2 + ty * 7, 12) + 2, y + 10, 4, 1);
      if (mod(tx * 3 + ty * 5 + ph, 9) === 0) {
        ctx.fillStyle = "#bcd8f4";
        rect(x + 5, y + 6, 3, 1);
      }
      ctx.fillStyle = "rgba(244, 234, 210, 0.75)";
      if (!owSolidAt(tx, ty - 1)) rect(x, y, TILE, 1);
      if (!owSolidAt(tx, ty + 1)) rect(x, y + TILE - 1, TILE, 1);
      if (!owSolidAt(tx - 1, ty)) rect(x, y, 1, TILE);
      if (!owSolidAt(tx + 1, ty)) rect(x + TILE - 1, y, 1, TILE);
      return;
    }
    if (t === "g") {
      drawOwGrassBase(tx, ty, x, y);
      return;
    }
    if (t === "t") {
      drawOwGrassBase(tx, ty, x, y);
      drawOwTree(tx, ty, x, y);
      return;
    }
    // Street base (also under doors, manholes, sats, crosswalks, the exit),
    // with two-tone cobble specks keyed off tile coords so the pattern is
    // stable, then cast shadows: anything tall (building or tree) drops shade
    // onto the tiles south and east of it — sun from the top-left.
    ctx.fillStyle = "#6b7178";
    rect(x, y, TILE, TILE);
    if (mod(tx * 11 + ty * 17, 5) === 0) {
      ctx.fillStyle = "#767d84";
      rect(x + mod(tx * 3, 8) + 3, y + mod(ty * 5, 8) + 3, 3, 2);
    }
    if (mod(tx * 7 + ty * 23, 7) === 0) {
      ctx.fillStyle = "#565c63";
      rect(x + mod(ty * 3, 9) + 2, y + mod(tx * 5, 9) + 6, 3, 2);
    }
    if (owSolidAt(tx, ty - 1)) {
      ctx.fillStyle = "rgba(16, 16, 24, 0.30)";
      rect(x, y, TILE, 5);
    }
    if (owSolidAt(tx - 1, ty)) {
      ctx.fillStyle = "rgba(16, 16, 24, 0.16)";
      rect(x, y, 4, TILE);
    }

    if (t === "z") {
      // Crosswalk: pale pedestrian stripes across the road.
      ctx.fillStyle = "rgba(244, 234, 210, 0.85)";
      rect(x + 2, y + 2, 3, 12);
      rect(x + 7, y + 2, 3, 12);
      rect(x + 12, y + 2, 3, 12);
      return;
    }
    if (t === "o") {
      ctx.fillStyle = palette.ink2;
      rect(x + 3, y + 3, 10, 10);
      ctx.fillStyle = palette.gray2;
      rect(x + 4, y + 4, 8, 8);
      ctx.fillStyle = palette.ink2;
      rect(x + 6, y + 6, 4, 1);
      rect(x + 6, y + 9, 4, 1);
      // Steam curling off the grate — very downtown.
      const puff = Math.floor(state.time * 3 + tx * 2) % 4;
      if (puff < 3) {
        ctx.fillStyle = "rgba(232, 232, 228, 0.5)";
        rect(x + 5 + puff, y - 2 - puff * 2, 3, 2);
        ctx.fillStyle = "rgba(232, 232, 228, 0.28)";
        rect(x + 8 - puff, y - 4 - puff * 2, 2, 2);
      }
      return;
    }
    if (t >= "1" && t <= "9") {
      // Venue entrance: stone steps up to glass double doors under a glowing
      // neon sign. Cleared venues flip the sign green so remaining work reads
      // at a glance; open venues pulse their color.
      const cleared = state.venuesCleared.includes(t);
      const flash = !cleared && Math.floor(state.time * 3) % 2 === 0;
      const neon = cleared ? palette.green : flash ? palette.violet : "#5a3fb0";
      // Steps + recessed frame.
      ctx.fillStyle = "#4a4550";
      rect(x, y + 13, TILE, 3);
      ctx.fillStyle = "#5d5864";
      rect(x, y + 13, TILE, 1);
      ctx.fillStyle = "#2a2630";
      rect(x + 1, y + 1, 14, 13);
      ctx.fillStyle = "#171420";
      rect(x + 3, y + 4, 10, 10);
      // Glass doors with a center seam and handle glints.
      ctx.fillStyle = flash ? "#3a5a78" : "#2a3444";
      rect(x + 4, y + 5, 4, 9);
      rect(x + 9, y + 5, 4, 9);
      ctx.fillStyle = "rgba(207, 216, 232, 0.8)";
      rect(x + 5, y + 7, 1, 3);
      rect(x + 11, y + 7, 1, 3);
      // Neon sign: soft glow halo behind a bright board.
      ctx.fillStyle = "rgba(141, 109, 232, 0.22)";
      if (cleared) ctx.fillStyle = "rgba(54, 189, 99, 0.25)";
      if (flash) ctx.fillStyle = "rgba(141, 109, 232, 0.4)";
      rect(x, y - 2, 16, 8);
      ctx.fillStyle = neon;
      rect(x + 2, y - 1, 12, 6);
      ctx.fillStyle = palette.ink;
      text(t, x + 6, y + 4, 7);
      return;
    }
    if (t === "X") {
      if (getTheme() === "wallstreet") {
        // THE CHARGING BULL: beveled pedestal, plaque, and a gold bull with
        // a sunlit back; glows once every venue is cleared and ends the run.
        const total = Object.keys(getCurrentLevel().venues).length;
        const open = state.venuesCleared.length >= total;
        const glow = open && Math.floor(state.time * 4) % 2 === 0;
        // Cast shadow off the pedestal.
        ctx.fillStyle = "rgba(16, 16, 24, 0.25)";
        rect(x + 8, y + 14, 9, 2);
        // Pedestal with bevel + plaque.
        ctx.fillStyle = "#565145";
        rect(x + 1, y + 10, 14, 6);
        ctx.fillStyle = "#8d8878";
        rect(x + 1, y + 10, 14, 2);
        rect(x + 1, y + 10, 1, 6);
        ctx.fillStyle = "#3a362e";
        rect(x + 1, y + 15, 14, 1);
        ctx.fillStyle = open ? palette.orange : "#b03a30";
        rect(x + 5, y + 12, 6, 3);
        // Bull: body, head, horn, tail, legs.
        ctx.fillStyle = glow ? palette.yellow : "#c99a3a";
        rect(x + 3, y + 5, 9, 5);
        rect(x + 11, y + 4, 3, 4);
        rect(x + 2, y + 6, 2, 2);
        ctx.fillStyle = palette.orange;
        rect(x + 3, y + 5, 9, 1);
        ctx.fillStyle = glow ? palette.white : palette.paper;
        rect(x + 12, y + 2, 3, 1);
        rect(x + 13, y + 3, 1, 1);
        ctx.fillStyle = glow ? palette.orange : "#a87c2c";
        rect(x + 4, y + 10, 2, 2);
        rect(x + 9, y + 10, 2, 2);
        return;
      }
      // The COLD STORAGE vault: beveled steel door with an orange ₿ dial;
      // pulses gold once every venue is cleared and it unlocks.
      const total = Object.keys(getCurrentLevel().venues).length;
      const open = state.venuesCleared.length >= total;
      const glow = open && Math.floor(state.time * 4) % 2 === 0;
      ctx.fillStyle = "rgba(16, 16, 24, 0.25)";
      rect(x + 3, y + 15, 13, 2);
      ctx.fillStyle = palette.ink;
      rect(x, y, 16, 16);
      ctx.fillStyle = palette.gray2;
      rect(x + 1, y + 1, 14, 14);
      ctx.fillStyle = palette.gray;
      rect(x + 1, y + 1, 14, 1);
      rect(x + 1, y + 1, 1, 14);
      ctx.fillStyle = glow ? palette.yellow : "#565c63";
      rect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = open ? palette.orange : palette.ink2;
      rect(x + 5, y + 5, 6, 6);
      ctx.fillStyle = open ? palette.yellow : palette.gray;
      rect(x + 5, y + 5, 6, 1);
      ctx.fillStyle = open ? palette.ink : palette.gray;
      text("B", x + 6, y + 11, 6);
    }
  }

  // One building tile in one of five facade schemes picked by a stable hash of
  // its coordinates. Street-level rows render storefronts and windows with a
  // lit left edge; upper rows render beveled rooftops (light top/left, dark
  // bottom/right — the block reads solid) with water towers, AC units, and
  // access bulkheads.
  function drawOwBuilding(tx, ty, x, y) {
    const scheme = [
      { roof: "#6b3a2a", face: "#7d452e", trim: "#8a5236", hi: "#9a6242", win: "#c9b458", dark: "#3a2018" },
      { roof: "#4a5568", face: "#5a6a80", trim: "#6b7d95", hi: "#8496ae", win: "#cfd8e8", dark: "#2a3442" },
      { roof: "#8a7a56", face: "#a0906a", trim: "#b3a276", hi: "#c4b48a", win: "#e8d9a0", dark: "#4a3f2a" },
      { roof: "#20343e", face: "#2a4654", trim: "#3a5a6a", hi: "#4f7a8a", win: "#7fd8e8", dark: "#122430" },
      { roof: "#55584f", face: "#666a5f", trim: "#777b6e", hi: "#8a8e80", win: "#d8d2b4", dark: "#33352e" }
    ][mod(tx * 13 + ty * 7, 5)];
    const wallFace = !owSolidAt(tx, ty + 1);
    if (wallFace) {
      ctx.fillStyle = scheme.dark;
      rect(x, y, TILE, TILE);
      ctx.fillStyle = scheme.face;
      rect(x, y + 1, TILE, TILE - 1);
      // Sunlit left edge grounds the facade.
      ctx.fillStyle = scheme.hi;
      rect(x, y + 1, 1, TILE - 1);
      const kind = mod(tx * 5 + ty * 3, 4);
      if (kind === 0) {
        // Shopfront: striped awning over a display window and a door.
        const awning = mod(tx * 3, 2) ? ["#b03a30", "#d86a50"] : ["#2e6e46", "#54a06a"];
        for (let i = 0; i < 3; i += 1) {
          ctx.fillStyle = awning[i % 2];
          rect(x + 1 + i * 5, y + 4, 4, 3);
        }
        ctx.fillStyle = scheme.win;
        rect(x + 2, y + 8, 12, 5);
        ctx.fillStyle = "rgba(244, 234, 210, 0.35)";
        rect(x + 3, y + 9, 3, 1);
        ctx.fillStyle = scheme.dark;
        rect(x + 2, y + 13, 5, 3);
        ctx.fillStyle = scheme.hi;
        rect(x + 2, y + 13, 5, 1);
      } else if (kind === 1) {
        // Paired windows with sills; most lit, some dark.
        ctx.fillStyle = scheme.dark;
        rect(x + 2, y + 5, 5, 7);
        rect(x + 9, y + 5, 5, 7);
        ctx.fillStyle = scheme.win;
        rect(x + 3, y + 6, 3, 4);
        if (mod(tx * 7 + ty * 13, 3) !== 0) rect(x + 10, y + 6, 3, 4);
        ctx.fillStyle = scheme.trim;
        rect(x + 2, y + 12, 5, 1);
        rect(x + 9, y + 12, 5, 1);
      } else if (kind === 2) {
        // Wide office glass band with mullions and a sky reflection.
        ctx.fillStyle = scheme.dark;
        rect(x + 1, y + 6, TILE - 2, 6);
        ctx.fillStyle = scheme.win;
        rect(x + 2, y + 7, TILE - 4, 4);
        ctx.fillStyle = "rgba(244, 234, 210, 0.3)";
        rect(x + 3, y + 7, 4, 1);
        ctx.fillStyle = scheme.dark;
        rect(x + 7, y + 7, 1, 4);
        rect(x + 11, y + 7, 1, 4);
      } else {
        // Stone pillars framing an entrance with steps.
        ctx.fillStyle = scheme.trim;
        rect(x + 1, y + 4, 3, 10);
        rect(x + 12, y + 4, 3, 10);
        ctx.fillStyle = scheme.hi;
        rect(x + 1, y + 4, 1, 10);
        rect(x + 12, y + 4, 1, 10);
        ctx.fillStyle = scheme.dark;
        rect(x + 5, y + 7, 6, 7);
        ctx.fillStyle = scheme.win;
        rect(x + 6, y + 8, 4, 3);
        ctx.fillStyle = scheme.trim;
        rect(x + 4, y + 14, 8, 1);
      }
      return;
    }
    // Rooftop: beveled slab (light top/left, dark bottom/right) plus one hashed
    // prop per tile — water tank, AC unit, bulkhead, vent pipe, or gravel.
    ctx.fillStyle = scheme.dark;
    rect(x, y, TILE, TILE);
    ctx.fillStyle = scheme.roof;
    rect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = scheme.hi;
    rect(x + 1, y + 1, TILE - 2, 1);
    rect(x + 1, y + 1, 1, TILE - 2);
    const prop = mod(tx * 11 + ty * 5, 6);
    if (prop === 0) {
      // Water tank — the skyline classic.
      ctx.fillStyle = "#4a3527";
      rect(x + 4, y + 9, 2, 5);
      rect(x + 10, y + 9, 2, 5);
      ctx.fillStyle = "#6b4a30";
      rect(x + 3, y + 3, 10, 7);
      ctx.fillStyle = "#83593a";
      rect(x + 3, y + 3, 10, 2);
      ctx.fillStyle = "#4a3527";
      rect(x + 5, y + 1, 6, 2);
      ctx.fillStyle = "#9a7048";
      rect(x + 4, y + 5, 8, 1);
    } else if (prop === 1) {
      ctx.fillStyle = "#8d949c";
      rect(x + 4, y + 5, 8, 6);
      ctx.fillStyle = "#aab4bc";
      rect(x + 4, y + 5, 8, 1);
      ctx.fillStyle = "#5a616a";
      rect(x + 5, y + 7, 6, 3);
    } else if (prop === 2) {
      ctx.fillStyle = scheme.trim;
      rect(x + 3, y + 4, 10, 8);
      ctx.fillStyle = scheme.hi;
      rect(x + 3, y + 4, 10, 1);
      ctx.fillStyle = scheme.dark;
      rect(x + 6, y + 6, 4, 6);
    } else if (prop === 3) {
      // Vent pipe with a cap.
      ctx.fillStyle = scheme.dark;
      rect(x + 7, y + 5, 3, 7);
      ctx.fillStyle = scheme.hi;
      rect(x + 6, y + 4, 5, 2);
    } else {
      ctx.fillStyle = scheme.trim;
      rect(x + mod(tx * 5 + ty * 3, 10) + 2, y + mod(tx * 3 + ty * 7, 10) + 2, 2, 2);
    }
  }

  // Park ground: dithered two-tone grass (checker offset by tile parity, like
  // the classic overworlds) plus occasional flower specks.
  function drawOwGrassBase(tx, ty, x, y) {
    ctx.fillStyle = "#3f7d46";
    rect(x, y, TILE, TILE);
    ctx.fillStyle = "#37703f";
    for (let py = 0; py < TILE; py += 4) {
      for (let px = mod(tx + ty, 2) * 2; px < TILE; px += 4) {
        rect(x + px, y + py, 2, 2);
      }
    }
    const flower = mod(tx * 31 + ty * 17, 9);
    if (flower < 3) {
      ctx.fillStyle = flower === 0 ? palette.yellow : flower === 1 ? palette.paper : "#e08a9a";
      rect(x + 3 + mod(tx * 5, 8), y + 4 + mod(ty * 7, 8), 1, 1);
      rect(x + 10 - mod(ty * 3, 6), y + 11 - mod(tx * 2, 6), 1, 1);
    }
  }

  // A park tree: cast shadow, shaded trunk, and a big three-tone swaying
  // canopy with a sunlit highlight clump — the tallest thing in the park.
  function drawOwTree(tx, ty, x, y) {
    const sway = mod(Math.floor(state.time * 2) + tx, 2);
    ctx.fillStyle = "rgba(16, 16, 24, 0.22)";
    rect(x + 4, y + 13, 12, 2);
    rect(x + 2, y + 14, 5, 1);
    ctx.fillStyle = "#5a3a22";
    rect(x + 6, y + 9, 4, 5);
    ctx.fillStyle = "#3f2818";
    rect(x + 6, y + 9, 1, 5);
    ctx.fillStyle = "#1e5a30";
    rect(x + 2 + sway, y + 5, 12, 5);
    ctx.fillStyle = "#2f7a42";
    rect(x + 1 + sway, y + 2, 14, 6);
    rect(x + 3 + sway, y + 8, 10, 2);
    ctx.fillStyle = "#3f9455";
    rect(x + 3 + sway, y + 2, 5, 2);
    rect(x + 4 + sway, y + 4, 3, 1);
    ctx.fillStyle = "#163d24";
    rect(x + 11 + sway, y + 6, 3, 3);
    rect(x + 2 + sway, y + 9, 12, 1);
  }

  // A yellow cab mid-route. `axis` picks the orientation and `dir` the facing
  // so the windshield leads the travel direction.
  // Ambient birds. Overworld: a small flock crossing the district overhead,
  // each with a faint ground shadow so they read as airborne. Lobbies: three
  // sparrows looping the upper wall behind the furniture. Purely cosmetic —
  // positions derive from the run clock, so timing is untouched.
  function drawBird(x, y, flap) {
    ctx.fillStyle = "#2a2d3a";
    rect(x + 1, y, 3, 2);
    if (flap === 0) {
      rect(x - 1, y - 1, 2, 1);
      rect(x + 4, y - 1, 2, 1);
    } else {
      rect(x - 1, y + 1, 2, 1);
      rect(x + 4, y + 1, 2, 1);
    }
  }

  function drawOverworldBirds(camX, camY) {
    const span = ow.cols * TILE + 80;
    for (let i = 0; i < 5; i += 1) {
      const wx = mod(state.time * (34 + mod(i, 3) * 9) + i * 271, span) - 40;
      const wy = 34 + i * 17 + Math.sin(state.time * 1.6 + i * 2.2) * 6;
      const x = Math.round(wx - camX);
      const y = Math.round(wy - camY);
      if (x < -12 || x > VIEW_W + 12 || y < -8 || y > VIEW_H + 8) continue;
      ctx.fillStyle = "rgba(16, 16, 24, 0.18)";
      rect(x + 2, y + 7, 4, 1);
      drawBird(x, y, Math.floor(state.time * 7 + i * 1.5) % 2);
    }
  }

  function drawLobbyBirds(cam) {
    for (let i = 0; i < 3; i += 1) {
      const wx = mod(state.time * (26 + i * 8) + i * 197, WORLD_W + 60) - 30;
      const wy = 58 + i * 9 + Math.sin(state.time * 2 + i * 2.6) * 4;
      const x = Math.round(wx - cam);
      const y = Math.round(wy);
      if (x < -10 || x > VIEW_W + 10 || y < -6 || y > VIEW_H) continue;
      drawBird(x, y, Math.floor(state.time * 8 + i * 1.3) % 2);
    }
  }

  function drawOwTaxi(x, y, axis, dir) {
    if (axis === "h") {
      ctx.fillStyle = "#111318";
      rect(x + 1, y + 6, 2, 3);
      rect(x + 11, y + 6, 2, 3);
      ctx.fillStyle = palette.yellow;
      rect(x, y + 1, 14, 6);
      ctx.fillStyle = palette.orange;
      rect(x, y + 1, 14, 1);
      ctx.fillStyle = "#1c2a3a";
      rect(dir > 0 ? x + 9 : x + 1, y + 2, 4, 3);
      rect(x + 4, y + 2, 3, 3);
      ctx.fillStyle = palette.ink;
      rect(x + 5, y + 3, 4, 2);
      ctx.fillStyle = palette.white;
      rect(dir > 0 ? x + 13 : x, y + 3, 1, 2);
    } else {
      ctx.fillStyle = "#111318";
      rect(x + 1, y + 2, 3, 2);
      rect(x + 6, y + 11, 3, 2);
      ctx.fillStyle = palette.yellow;
      rect(x + 1, y, 8, 14);
      ctx.fillStyle = palette.orange;
      rect(dir > 0 ? x + 1 : x + 8, y, 1, 14);
      ctx.fillStyle = "#1c2a3a";
      rect(x + 2, dir > 0 ? y + 9 : y + 2, 6, 3);
      ctx.fillStyle = palette.ink;
      rect(x + 3, y + 6, 4, 2);
    }
  }

  // An era NPC on the street: a small figure with a kind-specific look and a
  // bobbing speech bubble until they've been passed (greeted).
  function drawOwNpc(npc, x, y) {
    const bob = Math.floor(state.time * 2) % 2;
    // Wall Street era additions: fink/saylor/banker/analyst/cabbie/vendor join
    // the L4 cast. `hair: null` reads as bald; `cap` swaps hair for a cap;
    // `glasses` draws a shades band; `apron` a white front panel. The bubble
    // letter/color come from the outfit so bitcoiners bubble "B" orange.
    const outfits = {
      dokwon: { top: palette.ink2, head: palette.paper, hair: palette.ink },
      sbf: { top: palette.gray, head: palette.paper, hair: palette.brown2 },
      vitalik: { top: palette.violet, head: palette.paper, hair: palette.brown },
      influencer: { top: palette.yellow, head: palette.paper, hair: palette.orange2 },
      maxi: { top: palette.orange, head: palette.paper, hair: palette.brown2, bubble: "B", bubbleColor: palette.orange },
      warner: { top: palette.blue2, head: palette.paper, cap: palette.blue2, bubble: "!", bubbleColor: palette.red },
      fink: { top: palette.blue2, head: palette.paper, hair: palette.gray, glasses: true },
      saylor: { top: "#3a4a6a", head: palette.paper, hair: null, bubble: "B", bubbleColor: palette.orange },
      banker: { top: palette.gray2, head: palette.paper, hair: palette.ink },
      analyst: { top: palette.violet, head: palette.paper, hair: "#d8a850" },
      cabbie: { top: palette.yellow, head: palette.paper, cap: palette.brown2 },
      vendor: { top: palette.white, head: palette.paper, hair: palette.brown, apron: true }
    };
    const look = outfits[npc.kind] || outfits.maxi;
    // Ground shadow.
    ctx.fillStyle = "rgba(16, 16, 24, 0.25)";
    rect(x + 2, y + 15, 12, 2);
    if (look.cap) {
      // Cap with a small brim toward the camera.
      ctx.fillStyle = look.cap;
      rect(x + 4, y - 2, 8, 3);
      rect(x + 3, y + 1, 10, 1);
    } else if (look.hair) {
      ctx.fillStyle = look.hair;
      rect(x + 4, y - 2, 8, 3);
    }
    ctx.fillStyle = look.head;
    rect(x + 4, y + 1, 8, 5);
    ctx.fillStyle = palette.ink;
    if (look.glasses) {
      // Shades band across the face.
      rect(x + 5, y + 3, 6, 1);
    } else {
      rect(x + 6, y + 3, 1, 1);
      rect(x + 9, y + 3, 1, 1);
    }
    ctx.fillStyle = look.top;
    rect(x + 3, y + 6, 10, 7);
    if (look.apron) {
      ctx.fillStyle = palette.paper2;
      rect(x + 5, y + 7, 6, 6);
    }
    ctx.fillStyle = palette.ink2;
    rect(x + 4, y + 13, 3, 3);
    rect(x + 9, y + 13, 3, 3);
    // Speech bubble while their line is still coming.
    const bubbleChar = look.bubble || "$";
    const bubbleColor = look.bubbleColor || palette.ink;
    if (!npc.greeted) {
      ctx.fillStyle = palette.paper;
      rect(x + 11, y - 9 - bob, 9, 7);
      rect(x + 12, y - 2 - bob, 2, 2);
      ctx.fillStyle = bubbleColor;
      text(bubbleChar, x + 14, y - 3 - bob, 6);
    }
  }

  // The everyday sat-stacker from above: hood, backpack, simple two-frame walk.
  // Same dark-hood + orange-accent identity as the side-view sprite so the two
  // views read as one person.
  function drawOwWalker(x, y) {
    const step = owPlayer.moving ? Math.floor(state.time * 8) % 2 : 0;
    const f = owPlayer.facing;
    // Ground shadow.
    ctx.fillStyle = "rgba(16, 16, 24, 0.25)";
    rect(x + 1, y + 13, 9, 2);
    // Feet.
    ctx.fillStyle = palette.brown;
    if (f === "left" || f === "right") {
      rect(x + 1, y + 10 + step, 3, 3);
      rect(x + 6, y + 13 - step * 3, 3, 3);
    } else {
      rect(x + 1 - step, y + 11, 3, 3);
      rect(x + 6 + step, y + 11, 3, 3);
    }
    // Body — hooded jacket.
    ctx.fillStyle = "#222437";
    rect(x, y + 4, 10, 8);
    ctx.fillStyle = "#35374e";
    rect(x + 1, y + 5, 8, 3);
    // Head/hood.
    ctx.fillStyle = palette.ink;
    rect(x + 1, y - 2, 8, 7);
    if (f !== "up") {
      ctx.fillStyle = palette.paper2;
      rect(x + 2, y, 6, 4);
      ctx.fillStyle = palette.ink;
      if (f === "left") { rect(x + 3, y + 1, 1, 2); }
      else if (f === "right") { rect(x + 6, y + 1, 1, 2); }
      else { rect(x + 3, y + 1, 1, 2); rect(x + 6, y + 1, 1, 2); }
    }
    // Orange visor accent.
    ctx.fillStyle = palette.orange;
    if (f === "right") rect(x + 8, y + 1, 2, 2);
    else if (f === "left") rect(x, y + 1, 2, 2);
    else if (f === "down") rect(x + 4, y + 5, 2, 2);
  }

  function drawBackground(cam, zone) {
    ctx.fillStyle = getZoneGradient(zone);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    drawSunMoon(cam, zone);

    const theme = getTheme();
    if (theme === "network") {
      drawNetworkBackdrop(cam);
      return;
    }
    if (theme === "tour") {
      drawTourBackdrop(cam);
      return;
    }
    if (theme === "mania") {
      drawManiaBackdrop(cam);
      return;
    }
    if (theme === "wallstreet") {
      drawWallStreetBackdrop(cam);
      return;
    }

    // City theme (Level 1): dystopian skyline for the early zones, brightening
    // into green hills from zone 3 on — the broken-world → hope progression.
    const far = -Math.floor(cam * 0.22) % 180;
    ctx.fillStyle = state.currentZone < 3 ? "#24282b" : "#5aa65a";
    for (let x = far - 180; x < VIEW_W + 180; x += 60) {
      if (state.currentZone < 3) {
        rect(x, 128, 30, 76);
        rect(x + 24, 104, 22, 100);
        rect(x + 50, 140, 34, 64);
        ctx.fillStyle = "#12151a";
        for (let w = 0; w < 3; w += 1) rect(x + 31, 114 + w * 18, 5, 5);
        ctx.fillStyle = "#24282b";
      } else {
        hill(x, 188, 58, 38, "#4fb75a");
        hill(x + 42, 190, 76, 46, "#3f9e56");
      }
    }

    const near = -Math.floor(cam * 0.45) % 220;
    for (let x = near - 220; x < VIEW_W + 220; x += 110) {
      if (state.currentZone < 3) {
        ctx.fillStyle = "#333737";
        rect(x, 160, 74, 44);
        rect(x + 12, 148, 38, 56);
        ctx.fillStyle = "#222626";
        rect(x + 8, 174, 10, 6);
        rect(x + 34, 164, 10, 6);
      } else {
        ctx.fillStyle = "#2f8050";
        rect(x + 20, 184, 22, 20);
        rect(x + 72, 178, 28, 26);
        ctx.fillStyle = "#54c35d";
        rect(x + 16, 180, 30, 8);
        rect(x + 68, 174, 36, 8);
      }
    }
  }

  // Level 2 "network at night" parallax backdrop (ticket 60f350ff). Two layers
  // of node infrastructure read as early Bitcoin development and network growth:
  // distant server towers whose terminal windows light up more in later zones,
  // and a nearer mempool node-map whose dots blink "online". Everything is keyed
  // off world x and the run clock's integer tick (mod()/Math.floor), so it is
  // pixel-stable, deterministic on every timed attempt, and culled per column —
  // colors stay dark/muted so the foreground keeps full readability.
  function drawNetworkBackdrop(cam) {
    // Far layer: server towers. More windows are lit the deeper you are into the
    // run (currentZone 0..5), so the skyline visibly "comes online" as you go.
    const litThreshold = 2 + state.currentZone;
    const far = mod(-Math.floor(cam * 0.22), 150);
    for (let sx = far - 150; sx < VIEW_W + 150; sx += 150) {
      ctx.fillStyle = "#161b30";
      rect(sx, 92, 30, 112);
      rect(sx + 36, 116, 24, 88);
      ctx.fillStyle = "#2a3350";
      rect(sx + 13, 84, 3, 10);
      drawTowerWindows(sx + 4, 100, 4, litThreshold, 0);
      drawTowerWindows(sx + 40, 124, 3, litThreshold, 7);
    }

    // Near layer: a mempool node-map — dots linked by a faint wire, each blinking
    // online on a slow deterministic tick (network gossip), parallaxing faster.
    const near = mod(-Math.floor(cam * 0.5), 96);
    ctx.fillStyle = "#26406a";
    for (let nx = near - 96; nx < VIEW_W + 96; nx += 96) rect(nx + 6, 178, 90, 1);
    const tick = Math.floor(state.time * 2);
    for (let nx = near - 96; nx < VIEW_W + 96; nx += 96) {
      const online = mod(tick + Math.floor(nx / 96), 4) !== 0;
      ctx.fillStyle = online ? palette.green : palette.green2;
      rect(nx, 174, 6, 6);
      ctx.fillStyle = "#0e1426";
      rect(nx + 2, 176, 2, 2);
    }
  }

  // One column of server-tower windows. A window is lit when its index falls
  // under `litThreshold` (mod 7), so denser lighting reads as more nodes online.
  // `seed` offsets the pattern between a tower's two stacks so they differ.
  function drawTowerWindows(x, y, cols, litThreshold, seed) {
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        ctx.fillStyle = (r * 3 + c + seed) % 7 < litThreshold ? "#3c6e5a" : "#10162a";
        rect(x + c * 6, y + r * 8, 3, 4);
      }
    }
  }

  // Level 3 "world tour" parallax backdrop. Far layer: world-landmark
  // silhouettes (lattice tower / domed hall / twin blocks) cycling as the tour
  // moves city to city. Near layer: the crowd itself — rows of figures whose
  // heads light up orange as you get deeper into the run (adoption spreading),
  // mirroring the network theme's "nodes come online" but as people. Everything
  // is keyed off world x and the integer run-clock tick, so it is pixel-stable
  // and deterministic on every timed attempt; colors stay dark against the
  // dusk skies so the foreground keeps full readability.
  function drawTourBackdrop(cam) {
    const far = mod(-Math.floor(cam * 0.22), 170);
    for (let sx = far - 170; sx < VIEW_W + 170; sx += 170) {
      drawLandmark(sx, mod(Math.floor((sx + Math.floor(cam * 0.22)) / 170), 3));
    }

    // Near layer: the crowd. More lit (orange-pilled) heads per group the
    // further the tour has reached (currentZone 0..6 → 1..7 of 8 lit).
    const litThreshold = 1 + state.currentZone;
    const near = mod(-Math.floor(cam * 0.5), 96);
    for (let nx = near - 96; nx < VIEW_W + 96; nx += 96) {
      for (let i = 0; i < 6; i += 1) {
        const hx = nx + 3 + i * 15;
        const lit = mod(i * 3 + Math.floor(nx / 96), 8) < litThreshold;
        ctx.fillStyle = "#2b1d3a";
        rect(hx, 190, 8, 14);
        ctx.fillStyle = lit ? palette.orange : "#4a3556";
        rect(hx + 2, 184, 5, 5);
      }
    }
  }

  // One far-layer landmark silhouette per 170px tile, cycling three shapes so
  // the skyline reads as different cities without any per-city assets.
  function drawLandmark(x, kind) {
    ctx.fillStyle = "#231a36";
    if (kind === 0) {
      // Lattice tower: tapering mast on splayed legs.
      rect(x + 26, 92, 4, 26);
      rect(x + 22, 118, 12, 10);
      rect(x + 18, 128, 20, 34);
      rect(x + 12, 162, 10, 42);
      rect(x + 34, 162, 10, 42);
      ctx.fillStyle = "#3a2b52";
      rect(x + 27, 86, 2, 6);
    } else if (kind === 1) {
      // Domed hall over a long portico.
      rect(x + 8, 142, 46, 62);
      rect(x + 20, 126, 22, 16);
      rect(x + 26, 116, 10, 10);
      rect(x + 30, 108, 3, 8);
      ctx.fillStyle = "#171028";
      for (let c = 0; c < 4; c += 1) rect(x + 13 + c * 10, 152, 4, 52);
    } else {
      // Twin towers with a few late-night windows still lit.
      rect(x + 8, 112, 20, 92);
      rect(x + 34, 130, 18, 74);
      ctx.fillStyle = "#6b4a3a";
      rect(x + 12, 124, 3, 4);
      rect(x + 20, 148, 3, 4);
      rect(x + 38, 142, 3, 4);
      rect(x + 44, 170, 3, 4);
    }
  }

  // Level 4 venue interior backdrop — the beat-em-up bar wall, TMNT-arcade
  // style: individually beveled bricks with mortar grout and hashed tone
  // variation, a mostly-red price ticker (it's 2022), flickering neon signs
  // (100x / MOON / HODL), and wall-mounted TVs streaming candle charts that
  // scroll with the run tick. Everything keyed off world x + integer ticks —
  // pixel-stable and deterministic on every attempt.
  function drawManiaBackdrop(cam) {
    const px = Math.floor(cam * 0.7);
    // Brick wall: dark grout base, then beveled bricks (lit top/left edge,
    // dark bottom) in five hashed tones so the wall has real depth.
    const off = mod(-px, 24);
    ctx.fillStyle = "#241a1a";
    ctx.fillRect(0, 60, VIEW_W, 136);
    const tones = ["#4a3636", "#442f2f", "#503a3a", "#3f2c2c", "#553d3d"];
    for (let row = 0; row < 17; row += 1) {
      const y = 60 + row * 8;
      const stagger = (row % 2) * 12;
      for (let bx = off - 24 + stagger; bx < VIEW_W + 24; bx += 24) {
        ctx.fillStyle = tones[mod(Math.floor((bx + px) / 12), tones.length)];
        rect(bx, y, 22, 7);
        ctx.fillStyle = "#5f4848";
        rect(bx, y, 22, 1);
        rect(bx, y, 1, 7);
        ctx.fillStyle = "#2c2020";
        rect(bx, y + 6, 22, 1);
      }
    }
    // Ticker tape near the ceiling: green/red candles — mostly red, it's 2022.
    const toff = mod(-Math.floor(cam * 0.85), 14);
    ctx.fillStyle = "#151019";
    ctx.fillRect(0, 64, VIEW_W, 14);
    ctx.fillStyle = "#3a2530";
    ctx.fillRect(0, 64, VIEW_W, 1);
    for (let x = toff - 14; x < VIEW_W + 14; x += 14) {
      const k = mod(Math.floor((x + Math.floor(cam * 0.85)) / 14), 5);
      const up = k === 1;
      ctx.fillStyle = up ? palette.green : palette.red;
      rect(x + 5, up ? 67 : 70, 4, up ? 8 : 5);
      rect(x + 6, 65, 1, 12);
    }
    // Neon signs hanging on chains, each flickering on its own hash clock:
    // "100x" red, "MOON" violet with a rocket, "HODL" green.
    const soff = mod(-px, 132);
    const signs = [
      { label: "100x", color: palette.red },
      { label: "MOON", color: palette.violet },
      { label: "HODL", color: palette.green }
    ];
    for (let x = soff - 132; x < VIEW_W + 132; x += 132) {
      const idx = mod(Math.round((x + px) / 132), signs.length * 7);
      const sign = signs[idx % signs.length];
      const lit = mod(Math.floor(state.time * 9) + idx, 11) > 1;
      // Chains.
      ctx.fillStyle = "#181212";
      rect(x + 12, 78, 1, 8);
      rect(x + 28, 78, 1, 8);
      // Board with bevel; dark when the flicker is off.
      ctx.fillStyle = "#181212";
      rect(x + 6, 86, 30, 16);
      ctx.fillStyle = lit ? "#241a20" : "#141014";
      rect(x + 8, 88, 26, 12);
      if (lit) {
        ctx.fillStyle = sign.color;
        text(sign.label, x + 11, 97, 8);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        rect(x + 9, 89, 24, 1);
        if (sign.label === "MOON") {
          ctx.fillStyle = palette.orange;
          rect(x + 30, 90, 3, 3);
          ctx.fillStyle = palette.yellow;
          rect(x + 31, 94, 1, 2);
        }
      }
      // Wall TV streaming a scrolling candle chart.
      const tvx = x + 72;
      ctx.fillStyle = "#18120e";
      rect(tvx, 92, 34, 24);
      ctx.fillStyle = "#101810";
      rect(tvx + 2, 94, 30, 20);
      const tick = Math.floor(state.time * 2);
      for (let c = 0; c < 5; c += 1) {
        const h = 3 + mod(c * 7 + tick, 6);
        const cxp = tvx + 4 + c * 6;
        ctx.fillStyle = mod(c + tick, 3) === 0 ? palette.red : palette.green;
        rect(cxp, 111 - h - mod(c * 3, 3), 3, h);
      }
      // Stand.
      ctx.fillStyle = "#18120e";
      rect(tvx + 13, 116, 8, 3);
    }
    // Baseboard.
    ctx.fillStyle = "#221818";
    ctx.fillRect(0, 196, VIEW_W, 8);
  }

  // Level 5 venue interior backdrop — a corporate lobby done up for the
  // adoption era: ticker tape up top, a dark cornice, hanging brass lamps
  // with light cones, marble panels veined with seams, brass-framed windows
  // on a morning skyline (every third bay is a brass elevator), potted palms,
  // wood wainscot, and a mostly-GREEN ticker (contrast with Level 4's red
  // mania tape). All parallax keyed off world x and the integer run tick —
  // pixel-stable and deterministic on every timed attempt.
  function drawWallStreetBackdrop(cam) {
    const px = cam * 0.7;
    // Ticker tape near the ceiling.
    ctx.fillStyle = "#141a20";
    ctx.fillRect(0, 34, VIEW_W, 14);
    ctx.fillStyle = "#b9a05a";
    ctx.fillRect(0, 34, VIEW_W, 1);
    ctx.fillRect(0, 47, VIEW_W, 1);
    const toff = mod(-Math.floor(cam * 0.85), 14);
    for (let x = toff - 14; x < VIEW_W + 14; x += 14) {
      const k = mod(Math.floor((x + Math.floor(cam * 0.85)) / 14), 5);
      const up = k !== 2;
      ctx.fillStyle = up ? palette.green : palette.red;
      rect(x + 5, up ? 37 : 41, 4, up ? 7 : 4);
      rect(x + 6, 35, 1, 10);
    }
    // Cornice between ticker and marble.
    ctx.fillStyle = "#241d15";
    ctx.fillRect(0, 48, VIEW_W, 8);
    ctx.fillStyle = "#b9a05a";
    ctx.fillRect(0, 55, VIEW_W, 1);
    // Marble upper wall.
    ctx.fillStyle = "#cdc2a6";
    ctx.fillRect(0, 56, VIEW_W, 80);
    const voff = mod(-Math.floor(px), 160);
    ctx.fillStyle = "#bdb192";
    for (let x = voff - 160; x < VIEW_W + 160; x += 160) {
      rect(x + 18, 74, 26, 1);
      rect(x + 30, 78, 18, 1);
      rect(x + 96, 94, 22, 1);
      rect(x + 108, 98, 12, 1);
      rect(x, 56, 1, 80);
    }
    // Bays of 128px: banner, window or elevator, pilaster, lamp, plant.
    const boff = mod(-Math.floor(px), 128);
    const bayBase = Math.floor(px / 128) * 128;
    for (let x = boff - 128; x < VIEW_W + 128; x += 128) {
      const bay = mod(Math.round((x + Math.floor(px)) / 128), 97);
      // Adoption banner on the left of the bay.
      ctx.fillStyle = palette.orange;
      rect(x + 4, 62, 18, 24);
      rect(x + 4, 86, 18, 3);
      ctx.fillStyle = palette.ink;
      text("B", x + 9, 80, 12);
      if (mod(bay, 3) === 2) {
        // Elevator bay: gold frame, steel doors, arrival lamp.
        ctx.fillStyle = "#8a6a2e";
        rect(x + 34, 64, 52, 54);
        ctx.fillStyle = "#9aa2ac";
        rect(x + 37, 67, 46, 48);
        ctx.fillStyle = "#7a828c";
        rect(x + 59, 67, 2, 48);
        ctx.fillStyle = "#c6ced8";
        rect(x + 38, 68, 20, 1);
        rect(x + 61, 68, 20, 1);
        ctx.fillStyle = Math.floor(state.time * 2) % 2 ? palette.green : palette.red;
        rect(x + 57, 60, 6, 3);
      } else {
        // Window bay: morning skyline behind brass mullions.
        ctx.fillStyle = "#8a6a2e";
        rect(x + 34, 64, 52, 54);
        ctx.fillStyle = "#9cc8ec";
        rect(x + 37, 67, 46, 48);
        ctx.fillStyle = "#6e87a8";
        rect(x + 41, 90, 10, 25);
        rect(x + 53, 82, 8, 33);
        rect(x + 63, 95, 12, 20);
        rect(x + 77, 86, 7, 29);
        ctx.fillStyle = "#57657a";
        rect(x + 43, 93, 2, 3);
        rect(x + 56, 86, 2, 3);
        rect(x + 67, 99, 2, 3);
        ctx.fillStyle = "rgba(244, 234, 210, 0.35)";
        rect(x + 39, 69, 5, 44);
      }
      // Pilaster between bays: stone column with capital and base.
      ctx.fillStyle = "#b3a78a";
      rect(x + 94, 58, 8, 76);
      ctx.fillStyle = "#c4b89a";
      rect(x + 94, 58, 2, 76);
      ctx.fillStyle = "#8f8468";
      rect(x + 92, 56, 12, 3);
      rect(x + 92, 130, 12, 4);
      // Hanging brass lamp with a soft light cone.
      ctx.fillStyle = "#241d15";
      rect(x + 62, 56, 1, 12);
      ctx.fillStyle = "#b9a05a";
      rect(x + 58, 68, 9, 4);
      ctx.fillStyle = palette.yellow;
      rect(x + 60, 71, 5, 2);
      ctx.fillStyle = "rgba(255, 209, 102, 0.08)";
      triangle(x + 58, 73, x + 67, 73, x + 72, 120);
      triangle(x + 58, 73, x + 67, 73, x + 53, 120);
      // Potted palm against the wainscot line.
      if (mod(bay, 2) === 0) {
        ctx.fillStyle = "#8a5230";
        rect(x + 112, 122, 10, 8);
        ctx.fillStyle = "#6b3e22";
        rect(x + 112, 122, 10, 2);
        ctx.fillStyle = "#2f7a42";
        rect(x + 107, 110, 20, 3);
        rect(x + 111, 104, 12, 3);
        rect(x + 109, 115, 16, 3);
        ctx.fillStyle = "#3f9455";
        rect(x + 113, 105, 4, 2);
      }
    }
    // Wood wainscot with inset panels.
    ctx.fillStyle = "#4a3527";
    ctx.fillRect(0, 136, VIEW_W, 60);
    const doff = mod(-Math.floor(px), 48);
    for (let x = doff - 48; x < VIEW_W + 48; x += 48) {
      ctx.fillStyle = "#5c4432";
      rect(x + 6, 142, 36, 44);
      ctx.fillStyle = "#6d5238";
      rect(x + 8, 144, 32, 2);
      ctx.fillStyle = "#3a291d";
      rect(x + 10, 148, 28, 34);
    }
    // Brass rail and dark baseboard.
    ctx.fillStyle = "#b9a05a";
    ctx.fillRect(0, 133, VIEW_W, 3);
    ctx.fillStyle = "#2a2018";
    ctx.fillRect(0, 194, VIEW_W, 6);
  }

  function drawSunMoon(cam, zone) {
    if (getTheme() === "mania" || getTheme() === "wallstreet") return; // interiors have no sky
    const x = 196 - Math.floor(cam * 0.03) % 80;
    if (getTheme() === "tour") {
      // The globe the tour is crossing — landmasses plus two adoption beacons
      // blinking across continents.
      ctx.fillStyle = "#1c355c";
      rect(x - 1, 29, 22, 22);
      ctx.fillStyle = palette.blue2;
      rect(x, 30, 20, 20);
      ctx.fillStyle = palette.green2;
      rect(x + 3, 33, 6, 5);
      rect(x + 11, 36, 6, 4);
      rect(x + 5, 43, 5, 4);
      ctx.fillStyle = palette.orange;
      const blink = Math.floor(state.time * 2) % 2;
      rect(x + 5 + blink * 8, 35, 2, 2);
      rect(x + 13 - blink * 6, 44, 2, 2);
      return;
    }
    if (getTheme() === "network") {
      // A pale moon over the network-at-night sky, with two craters for texture.
      ctx.fillStyle = "#2a3350";
      rect(x - 1, 29, 22, 22);
      ctx.fillStyle = "#cdd6f0";
      rect(x, 30, 20, 20);
      ctx.fillStyle = "#aab4d6";
      rect(x + 12, 33, 5, 5);
      rect(x + 5, 41, 4, 4);
      return;
    }
    const color = state.currentZone < 3 ? "#9f594a" : zone.accent;
    ctx.fillStyle = color;
    rect(x, 30, 20, 20);
    ctx.fillStyle = state.currentZone < 3 ? "#593537" : "#ffe07a";
    rect(x + 4, 34, 12, 12);
  }

  function drawSolids(cam, zone) {
    for (const solid of solids) {
      const x = Math.round(solid.x - cam);
      if (x + solid.w < -4 || x > VIEW_W + 4) continue;

      if (solid.kind === "ground") {
        ctx.fillStyle = zone.ground;
        rect(x, solid.y, solid.w, solid.h);
        // Wall Street lobbies walk on checkered marble: alternating slabs
        // across the visible span with a soft sheen line under the trim.
        if (getTheme() === "wallstreet") {
          const fromCol = Math.max(0, Math.floor(cam / TILE));
          const toCol = fromCol + VIEW_W / TILE + 1;
          for (let col = fromCol; col <= toCol; col += 1) {
            const sx = col * TILE - cam;
            if (sx < -TILE || sx > VIEW_W) continue;
            ctx.fillStyle = mod(col, 2) === 0 ? "#5a5548" : "#4e4940";
            rect(sx, solid.y + 3, TILE, solid.h - 3);
            ctx.fillStyle = "rgba(244, 234, 210, 0.06)";
            rect(sx, solid.y + 3, TILE, 1);
          }
        }
        // Mania venues roll out casino carpet: deep-red checker with brass
        // flecks every fourth column.
        if (getTheme() === "mania") {
          const fromCol = Math.max(0, Math.floor(cam / TILE));
          const toCol = fromCol + VIEW_W / TILE + 1;
          for (let col = fromCol; col <= toCol; col += 1) {
            const sx = col * TILE - cam;
            if (sx < -TILE || sx > VIEW_W) continue;
            ctx.fillStyle = mod(col, 2) === 0 ? "#57232f" : "#451d27";
            rect(sx, solid.y + 3, TILE, solid.h - 3);
            if (mod(col, 4) === 0) {
              ctx.fillStyle = "#6b2f3d";
              rect(sx + 7, solid.y + 9, 2, 2);
              rect(sx + 4, solid.y + 16, 2, 2);
              rect(sx + 10, solid.y + 22, 2, 2);
            }
          }
        }
        // Top edge + vertical seams. Each theme gets its own trim: network's
        // terminal-green circuit, tour's gold route line, mania's bar brass,
        // wallstreet's polished brass, and the city theme keeps its grey →
        // green-grass zone transition.
        const theme = getTheme();
        ctx.fillStyle = theme === "network" ? "#3ad17a" : theme === "tour" ? "#ffd166" : theme === "mania" ? "#8a6a4e" : theme === "wallstreet" ? "#b9a05a" : state.currentZone < 3 ? "#70745f" : "#54c35d";
        rect(x, solid.y, solid.w, theme === "network" ? 2 : theme === "tour" || theme === "mania" || theme === "wallstreet" ? 3 : 4);
        ctx.fillStyle = theme === "network" ? "#143a28" : theme === "tour" ? "#5a3110" : theme === "mania" || theme === "wallstreet" ? "#221818" : state.currentZone < 3 ? "#262929" : "#225f35";
        for (let tx = x - mod(x, TILE); tx < x + solid.w; tx += TILE) {
          rect(tx, solid.y + 16, 1, solid.h - 16);
        }
      } else if (solid.kind === "crowd") {
        // CROWD SURGE pad: a row of supporters with arms pumping on a two-frame
        // cycle so the pad reads as alive (and bouncy) before you commit to it.
        const lift = Math.floor(state.time * 4) % 2;
        const shirts = [palette.orange, palette.blue, palette.violet];
        for (let i = 0; i + 8 <= solid.w + 3; i += 11) {
          const px = x + i + 1;
          ctx.fillStyle = palette.paper2;
          rect(px, solid.y + 2 - lift, 2, 3);
          rect(px + 6, solid.y + 2 - lift, 2, 3);
          ctx.fillStyle = palette.paper;
          rect(px + 2, solid.y - lift, 4, 4);
          ctx.fillStyle = shirts[mod(i / 11, 3)];
          rect(px + 1, solid.y + 4, 6, solid.h - 4);
        }
      } else if (solid.kind === "question") {
        if (getTheme() === "wallstreet") {
          // Brass plaque with corner rivets and an engraved "?".
          ctx.fillStyle = solid.hit ? "#6f6a5c" : "#8a6a2e";
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = solid.hit ? "#8d8878" : "#c9a44a";
          rect(x + 1, solid.y + 1, solid.w - 2, solid.h - 2);
          ctx.fillStyle = solid.hit ? "#5a564c" : "#6f5522";
          rect(x + 2, solid.y + 2, 1, 1);
          rect(x + solid.w - 3, solid.y + 2, 1, 1);
          rect(x + 2, solid.y + solid.h - 3, 1, 1);
          rect(x + solid.w - 3, solid.y + solid.h - 3, 1, 1);
          ctx.fillStyle = solid.hit ? palette.paper2 : palette.ink;
          text("?", x + 5, solid.y + 11, 8);
        } else {
          ctx.fillStyle = solid.hit ? palette.gray : palette.yellow;
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = solid.hit ? palette.gray2 : palette.orange2;
          rect(x, solid.y, solid.w, 2);
          rect(x, solid.y + solid.h - 2, solid.w, 2);
          rect(x + 2, solid.y + 4, solid.w - 4, 1);
          if (getTheme() === "mania") {
            // Casino gold block: beveled edges and a shine speck.
            ctx.fillStyle = solid.hit ? "#7a7670" : "#ffe7a8";
            rect(x + 1, solid.y + 2, solid.w - 2, 1);
            rect(x + 1, solid.y + 2, 1, solid.h - 4);
            if (!solid.hit && mod(Math.floor(state.time * 3), 4) !== 0) {
              ctx.fillStyle = palette.white;
              rect(x + solid.w - 6, solid.y + 4, 2, 2);
            }
          }
          ctx.fillStyle = solid.hit ? palette.paper2 : palette.ink;
          text(solid.hit ? "." : "?", x + 5, solid.y + 11, 8);
        }
      } else if (solid.kind === "ledger") {
        if (getTheme() === "wallstreet") {
          // Mahogany conference desk: beveled top slab with stacked paperwork.
          ctx.fillStyle = "#4a3320";
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = "#6b4a30";
          rect(x, solid.y, solid.w, solid.h - 4);
          ctx.fillStyle = "#8a6242";
          rect(x, solid.y, solid.w, 1);
          ctx.fillStyle = "#3a291d";
          rect(x + 2, solid.y + solid.h - 3, 2, 3);
          rect(x + solid.w - 4, solid.y + solid.h - 3, 2, 3);
          ctx.fillStyle = palette.paper;
          rect(x + 6, solid.y + 6, 9, 2);
          ctx.fillStyle = palette.paper2;
          rect(x + solid.w - 16, solid.y + 8, 7, 2);
          ctx.fillStyle = palette.orange;
          rect(x + 9, solid.y + 6, 3, 1);
        } else if (getTheme() === "mania") {
          // Shitcoin-crate platform: plank frame with a diagonal brace,
          // corner nails, and a stenciled tag.
          ctx.fillStyle = "#6b4a26";
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = "#83593a";
          rect(x + 1, solid.y + 1, solid.w - 2, 2);
          ctx.fillStyle = "#4a3018";
          rect(x, solid.y + solid.h - 2, solid.w, 2);
          rect(x + solid.w - 2, solid.y, 2, solid.h);
          rect(x, solid.y, 2, solid.h);
          ctx.fillStyle = "#7a4f28";
          for (let i = 0; i < solid.w - 6; i += 3) {
            rect(x + 3 + i, solid.y + 4 + Math.floor((i / Math.max(1, solid.w - 6)) * (solid.h - 8)), 2, 3);
          }
          ctx.fillStyle = palette.paper2;
          rect(x + 3, solid.y + 3, 2, 2);
          rect(x + solid.w - 5, solid.y + 3, 2, 2);
          rect(x + 3, solid.y + solid.h - 5, 2, 2);
          rect(x + solid.w - 5, solid.y + solid.h - 5, 2, 2);
        } else {
          ctx.fillStyle = palette.blue2;
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = palette.blue;
          rect(x, solid.y, solid.w, 3);
          ctx.fillStyle = palette.paper2;
          for (let i = 6; i < solid.w - 6; i += 14) rect(x + i, solid.y + 6, 6, 2);
        }
      } else if (solid.kind === "confirm") {
        // Confirmed = solid green block with a check tick; unconfirmed = a dim
        // green ghost outline so the player can read where it will return and
        // time the jump. The render predicate is the same isConfirmed() the
        // collision uses, so what you see is exactly what you can stand on.
        if (isConfirmed(solid)) {
          ctx.fillStyle = palette.green2;
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = palette.green;
          rect(x, solid.y, solid.w, 3);
          ctx.fillStyle = palette.white;
          const cx = x + solid.w / 2;
          rect(cx - 3, solid.y + 6, 2, 2);
          rect(cx - 1, solid.y + 8, 2, 2);
          rect(cx + 1, solid.y + 4, 2, 2);
        } else {
          ctx.fillStyle = "rgba(54, 189, 99, 0.16)";
          rect(x, solid.y, solid.w, solid.h);
          ctx.fillStyle = "rgba(54, 189, 99, 0.55)";
          rect(x, solid.y, solid.w, 1);
          rect(x, solid.y + solid.h - 1, solid.w, 1);
          rect(x, solid.y, 1, solid.h);
          rect(x + solid.w - 1, solid.y, 1, solid.h);
        }
      } else if (solid.kind === "barricade") {
        // Token wall: stacked shit-tokens with a crack overlay as hp drops.
        const barricade = barricades.find((b) => b.solid === solid);
        const hp = barricade ? barricade.hp : 3;
        for (let i = 0; i < solid.h; i += TILE) {
          const even = (i / TILE) % 2 === 0;
          ctx.fillStyle = even ? palette.violet : palette.brown;
          rect(x, solid.y + i, solid.w, TILE);
          ctx.fillStyle = even ? "#5a3fb0" : palette.brown2;
          rect(x + 2, solid.y + i + 2, solid.w - 4, TILE - 4);
          ctx.fillStyle = even ? palette.yellow : palette.paper2;
          text("$", x + 5, solid.y + i + 12, 8);
        }
        if (hp < 3) {
          ctx.fillStyle = palette.ink;
          rect(x + 3, solid.y + 4, 2, solid.h - 8);
          if (hp < 2) {
            rect(x + 9, solid.y + 8, 2, solid.h - 12);
            rect(x + 5, solid.y + solid.h / 2, 7, 2);
          }
        }
      } else {
        ctx.fillStyle = palette.brown;
        rect(x, solid.y, solid.w, solid.h);
        ctx.fillStyle = palette.brown2;
        rect(x, solid.y + solid.h - 3, solid.w, 3);
      }
    }
  }

  function drawHazards(cam) {
    for (const h of hazards) {
      const x = Math.round(h.x - cam);
      if (x + h.w < 0 || x > VIEW_W) continue;
      ctx.fillStyle = palette.red2;
      rect(x, h.y + 7, h.w, h.h - 7);
      ctx.fillStyle = palette.red;
      for (let i = 0; i < h.w; i += 8) {
        triangle(x + i, h.y + 8, x + i + 4, h.y, x + i + 8, h.y + 8);
      }
    }
  }

  function drawCoins(cam) {
    const theme = getTheme();
    const network = theme === "network";
    const pulse = Math.floor(state.time * 8) % 2;
    for (const coin of coins) {
      if (coin.taken) continue;
      const x = Math.round(coin.x - cam);
      if (x < -8 || x > VIEW_W + 8) continue;
      if (theme === "tour" || theme === "mania" || theme === "wallstreet") {
        // SATS tips: an orange sat with a lightning glint — value tossed from
        // the crowd to the stage. Distinct from L1's plain gold coin and L2's
        // green-ringed token.
        ctx.fillStyle = palette.orange2;
        rect(x + 1 + pulse, coin.y, 6 - pulse * 2, 8);
        ctx.fillStyle = palette.orange;
        rect(x + 2 + pulse, coin.y + 1, 4 - pulse * 2, 6);
        ctx.fillStyle = palette.yellow;
        rect(x + 4, coin.y + 2, 1, 2);
        rect(x + 3, coin.y + 4, 1, 2);
        continue;
      }
      if (network) {
        // SATS: a tiny satoshi token — orange core inside a terminal-green ring,
        // with a bright spark pixel. Reads as a digital coin, not L1's gold coin.
        ctx.fillStyle = palette.green;
        rect(x + 1, coin.y, 6, 8);
        ctx.fillStyle = palette.orange2;
        rect(x + 2 + pulse, coin.y + 1, 4 - pulse * 2, 6);
        ctx.fillStyle = palette.yellow;
        rect(x + 3, coin.y + 2, 2, 2);
        continue;
      }
      ctx.fillStyle = palette.orange2;
      rect(x + 1 + pulse, coin.y, 6 - pulse * 2, 8);
      ctx.fillStyle = palette.orange;
      rect(x + 2 + pulse, coin.y + 1, 4 - pulse * 2, 6);
    }
  }

  function drawPages(cam) {
    const theme = getTheme();
    const network = theme === "network";
    for (const page of pages) {
      if (page.taken) continue;
      const x = Math.round(page.x - cam);
      if (x < -12 || x > VIEW_W + 12) continue;
      const bob = Math.round(Math.sin(state.time * 5 + page.x) * 2);
      if (theme === "wallstreet") {
        // VAULT KEY: a heavy gold key — bow, shaft, teeth. The L5 milestone
        // collectible (KEYS taken from the institutions' own vaults).
        const yb = page.y + bob;
        ctx.fillStyle = palette.orange2;
        rect(x + 1, yb + 2, 6, 6);
        ctx.fillStyle = palette.yellow;
        rect(x + 2, yb + 3, 4, 4);
        ctx.fillStyle = palette.orange;
        rect(x + 3, yb + 4, 2, 2);
        ctx.fillStyle = palette.orange2;
        rect(x + 7, yb + 4, 6, 2);
        ctx.fillStyle = palette.yellow;
        rect(x + 10, yb + 6, 2, 2);
        rect(x + 12, yb + 6, 1, 3);
        continue;
      }
      if (theme === "mania") {
        // WHALE STASH: a small hardware-wallet case — grey shell, orange ₿
        // clasp, a green status pip. The L4 milestone collectible.
        ctx.fillStyle = palette.gray2;
        rect(x, page.y + 2 + bob, page.w, page.h - 4);
        ctx.fillStyle = palette.gray;
        rect(x, page.y + 2 + bob, page.w, 3);
        ctx.fillStyle = palette.orange;
        rect(x + 3, page.y + 6 + bob, 5, 5);
        ctx.fillStyle = palette.ink;
        text("B", x + 4, page.y + 10 + bob, 5);
        ctx.fillStyle = palette.green;
        rect(x + page.w - 3, page.y + 3 + bob, 2, 2);
        continue;
      }
      if (theme === "tour") {
        // TALK: a stage microphone — silver grille head, dark stem, orange
        // base LED. The L3 milestone collectible (TALKS given on tour).
        ctx.fillStyle = palette.gray;
        rect(x + 2, page.y + bob, 7, 6);
        ctx.fillStyle = palette.white;
        rect(x + 3, page.y + 1 + bob, 5, 1);
        rect(x + 3, page.y + 3 + bob, 5, 1);
        ctx.fillStyle = palette.ink2;
        rect(x + 4, page.y + 6 + bob, 3, 6);
        ctx.fillStyle = palette.orange;
        rect(x + 3, page.y + 12 + bob, 5, 2);
        continue;
      }
      if (network) {
        // PATCH: a signed code-diff note — a dark terminal card with green "+"
        // added lines and a gold signature seal. The L2 milestone collectible
        // (PATCHES MERGED), distinct from L1's pale whitepaper page.
        ctx.fillStyle = palette.ink2;
        rect(x, page.y + bob, page.w, page.h);
        ctx.fillStyle = palette.gray2;
        rect(x, page.y + bob, page.w, 2);
        ctx.fillStyle = palette.green;
        rect(x + 2, page.y + 4 + bob, 1, 3);
        rect(x + 1, page.y + 5 + bob, 3, 1);
        rect(x + 6, page.y + 5 + bob, 4, 1);
        rect(x + 6, page.y + 9 + bob, 4, 1);
        ctx.fillStyle = palette.yellow;
        rect(x + page.w - 4, page.y + page.h - 4 + bob, 3, 3);
        continue;
      }
      ctx.fillStyle = palette.paper;
      rect(x, page.y + bob, page.w, page.h);
      ctx.fillStyle = palette.paper2;
      rect(x + 2, page.y + 4 + bob, 7, 1);
      rect(x + 2, page.y + 8 + bob, 6, 1);
      ctx.fillStyle = palette.orange;
      rect(x + 8, page.y + bob, 3, 3);
    }
  }

  // Ally cameos. Off-screen markers are culled like every other prop. Each kind
  // routes to a small rect-only sprite drawn in the shared 8-bit palette so the
  // cameos read as part of the world, not an overlay.
  function drawAllies(cam) {
    for (const ally of allies) {
      const x = Math.round(ally.x - cam);
      if (x + ally.w < -8 || x > VIEW_W + 8) continue;
      if (ally.kind === "nodes") drawNodeCluster(x, ally.y);
      else if (ally.kind === "mallers") drawMallers(x, ally.y);
      else if (ally.kind === "crowd") drawCrowdCameo(x, ally.y);
      else drawHal(x, ally.y);
    }
  }

  // Jack & Bill Mallers hosting the Chicago living-room meetup: a couch, Jack
  // in his trademark white cap and hoodie, Bill in a blazer with grey hair.
  // Purely decorative like every cameo. `y` is the sprite top.
  function drawMallers(x, y) {
    ctx.fillStyle = palette.brown2;
    rect(x - 4, y + 10, 34, 12);
    ctx.fillStyle = palette.brown;
    rect(x - 4, y + 8, 34, 3);
    rect(x - 4, y + 8, 3, 14);
    rect(x + 27, y + 8, 3, 14);
    // Jack — white cap + hoodie.
    ctx.fillStyle = palette.white;
    rect(x + 2, y, 7, 3);
    ctx.fillStyle = palette.paper;
    rect(x + 2, y + 3, 7, 5);
    ctx.fillStyle = palette.green2;
    rect(x + 1, y + 8, 9, 9);
    ctx.fillStyle = palette.ink;
    rect(x + 4, y + 5, 1, 2);
    rect(x + 7, y + 5, 1, 2);
    // Bill — grey hair + blazer.
    ctx.fillStyle = palette.gray;
    rect(x + 15, y + 1, 7, 3);
    ctx.fillStyle = palette.paper;
    rect(x + 15, y + 4, 7, 5);
    ctx.fillStyle = palette.blue2;
    rect(x + 14, y + 9, 9, 8);
    ctx.fillStyle = palette.ink;
    rect(x + 17, y + 6, 1, 2);
    rect(x + 20, y + 6, 1, 2);
    // Legs.
    ctx.fillStyle = palette.ink2;
    rect(x + 2, y + 17, 3, 5);
    rect(x + 6, y + 17, 3, 5);
    rect(x + 15, y + 17, 3, 5);
    rect(x + 19, y + 17, 3, 5);
  }

  // The crowd cameo: three supporters (the middle one bouncing) and a raised
  // Bitcoin placard — the network that no longer needs the messenger.
  function drawCrowdCameo(x, y) {
    const wave = Math.floor(state.time * 3) % 2;
    const shirts = [palette.orange, palette.violet, palette.blue];
    for (let i = 0; i < 3; i += 1) {
      const px = x + i * 10;
      const hop = i === 1 ? -wave : 0;
      ctx.fillStyle = palette.paper;
      rect(px + 2, y + 4 + hop, 5, 5);
      ctx.fillStyle = shirts[i];
      rect(px + 1, y + 9, 7, 8);
      ctx.fillStyle = palette.ink2;
      rect(px + 2, y + 17, 2, 5);
      rect(px + 5, y + 17, 2, 5);
    }
    ctx.fillStyle = palette.gray;
    rect(x + 26, y - 2, 2, 7);
    ctx.fillStyle = palette.paper;
    rect(x + 22, y - 8, 10, 8);
    ctx.fillStyle = palette.orange;
    text("B", x + 25, y - 1, 7);
  }

  // Hal Finney: a small node operator standing beside his terminal. Distinct from
  // the player (dark suit, orange visor) via a teal jacket and pale face. A slow
  // green blink on the terminal screen reads as "running bitcoin" (the first node)
  // without any text. `y` is the sprite top; feet rest on the ground band.
  function drawHal(x, y) {
    const screenOn = Math.floor(state.time * 1.5) % 2 === 0;
    // Terminal at his side.
    ctx.fillStyle = palette.gray2;
    rect(x - 8, y + 9, 9, 13);
    ctx.fillStyle = screenOn ? palette.green : palette.green2;
    rect(x - 6, y + 11, 5, 5);
    ctx.fillStyle = palette.gray;
    rect(x - 8, y + 21, 9, 1);
    // Legs.
    ctx.fillStyle = palette.ink2;
    rect(x + 3, y + 16, 4, 6);
    rect(x + 9, y + 16, 4, 6);
    // Torso — teal jacket.
    ctx.fillStyle = palette.blue;
    rect(x + 2, y + 8, 12, 9);
    ctx.fillStyle = palette.blue2;
    rect(x + 2, y + 8, 12, 2);
    // Head + hair.
    ctx.fillStyle = palette.paper;
    rect(x + 4, y + 1, 8, 7);
    ctx.fillStyle = palette.brown2;
    rect(x + 4, y, 8, 3);
    // Eyes + small smile.
    ctx.fillStyle = palette.ink;
    rect(x + 6, y + 4, 1, 2);
    rect(x + 9, y + 4, 1, 2);
    rect(x + 6, y + 7, 4, 1);
  }

  // Early-builder node cluster: a small server with a grid of node lights that
  // fill in over time (more nodes coming online) and a blinking uplink antenna —
  // the network growing past any single founder. `y` is the sprite top.
  function drawNodeCluster(x, y) {
    // Antenna mast + blinking tip.
    ctx.fillStyle = palette.gray;
    rect(x + 9, y, 2, 9);
    ctx.fillStyle = Math.floor(state.time * 4) % 2 ? palette.yellow : palette.orange;
    rect(x + 8, y - 2, 4, 4);
    // Server body.
    ctx.fillStyle = palette.gray2;
    rect(x, y + 8, 20, 12);
    ctx.fillStyle = palette.gray;
    rect(x, y + 8, 20, 2);
    // Node lights filling in across a cycle, so the cluster keeps "lighting up".
    const lit = Math.floor(state.time * 3) % 9;
    let i = 0;
    for (let ry = 0; ry < 2; ry += 1) {
      for (let cx = 0; cx < 4; cx += 1) {
        ctx.fillStyle = i < lit ? palette.green : palette.green2;
        rect(x + 3 + cx * 4, y + 12 + ry * 4, 2, 2);
        i += 1;
      }
    }
  }

  function drawCheckpoints(cam) {
    const theme = getTheme();
    const network = theme === "network";
    for (const checkpoint of checkpoints) {
      const x = Math.round(checkpoint.x - cam);
      if (x < -20 || x > VIEW_W + 20) continue;
      if (theme === "tour") {
        // Tour stop: a mast topped with a megaphone that blinks until the stop
        // is played, then locks solid orange — the word got out here.
        ctx.fillStyle = checkpoint.taken ? palette.orange2 : palette.gray2;
        rect(x, checkpoint.y - 26, 3, 30);
        const on = checkpoint.taken || Math.floor(state.time * 3) % 2 === 0;
        ctx.fillStyle = checkpoint.taken ? palette.orange : on ? palette.yellow : palette.gray;
        rect(x + 3, checkpoint.y - 27, 4, 5);
        rect(x + 7, checkpoint.y - 30, 6, 11);
        ctx.fillStyle = palette.ink;
        rect(x + 9, checkpoint.y - 27, 2, 5);
        continue;
      }
      if (network) {
        // Node beacon: a mast topped with a signal lamp that goes solid green
        // once synced (taken). Reads as bringing a node online vs. L1's "B" flag.
        ctx.fillStyle = checkpoint.taken ? palette.green2 : palette.gray2;
        rect(x, checkpoint.y - 26, 3, 30);
        // Beacon lamp: blinks while unsynced, locks bright green once taken.
        const on = checkpoint.taken || Math.floor(state.time * 3) % 2 === 0;
        ctx.fillStyle = checkpoint.taken ? palette.green : on ? palette.yellow : palette.gray;
        rect(x - 3, checkpoint.y - 30, 9, 7);
        ctx.fillStyle = palette.ink;
        rect(x - 1, checkpoint.y - 28, 2, 2);
        rect(x + 2, checkpoint.y - 28, 2, 2);
        continue;
      }
      ctx.fillStyle = checkpoint.taken ? palette.green : palette.gray;
      rect(x, checkpoint.y - 26, 3, 30);
      rect(x + 3, checkpoint.y - 26, 17, 10);
      ctx.fillStyle = checkpoint.taken ? palette.paper : palette.paper2;
      text("B", x + 7, checkpoint.y - 18, 6);
    }
  }

  function drawGoal(cam) {
    const x = Math.round(goal.x - cam);
    if (x < -40 || x > VIEW_W + 40) return;
    if (getTheme() === "wallstreet") {
      if (goal.kind === "up" || goal.kind === "down") {
        // Stairwell: steps running toward a landing door, with a flashing
        // sign. UP rises to the right; DN descends to the right.
        const up = goal.kind === "up";
        ctx.fillStyle = "#2a2018";
        rect(x - 2, goal.y - 2, goal.w + 8, goal.h + 4);
        for (let i = 0; i < 4; i += 1) {
          const step = up ? i : 3 - i;
          const top = goal.y + goal.h - 12 - step * 12;
          const w = goal.w - (up ? i : 3 - i) * 7;
          ctx.fillStyle = "#8d8474";
          rect(x + i * 7, top, w, 12);
          ctx.fillStyle = "#a89e8a";
          rect(x + i * 7, top, w, 2);
        }
        // Landing door at the tall end.
        const dx = up ? x + goal.w - 14 : x - 6;
        ctx.fillStyle = palette.ink2;
        rect(dx, goal.y - 8, 18, 26);
        ctx.fillStyle = up ? "#7a5a2e" : "#3a4a5e";
        rect(dx + 2, goal.y - 6, 14, 22);
        ctx.fillStyle = palette.yellow;
        rect(dx + 4, goal.y + 2, 2, 2);
        // Flashing direction sign.
        const flash = Math.floor(state.time * 3) % 2 === 0;
        ctx.fillStyle = flash ? palette.yellow : "#8a6a2e";
        rect(x + 2, goal.y - 16, 24, 10);
        ctx.fillStyle = palette.ink;
        text(up ? "UP >" : "< DN", x + 3, goal.y - 8, 7);
        return;
      }
      // Final-floor EXIT: a brass double door. Green when every agent in the
      // building has been stomped this visit, red while any remain.
      const totals = venueEnemyTotals();
      const cleared = state.venuesCleared.includes(state.venueKey) ||
        (totals.total > 0 && totals.killed >= totals.total);
      ctx.fillStyle = palette.ink;
      rect(x - 2, goal.y - 2, goal.w + 6, goal.h + 4);
      ctx.fillStyle = "#8a6a2e";
      rect(x, goal.y, goal.w + 2, goal.h);
      ctx.fillStyle = palette.ink2;
      rect(x + 2, goal.y + 2, goal.w - 2, goal.h - 4);
      ctx.fillStyle = cleared ? "#3ad17a" : palette.red;
      rect(x - 2, goal.y - 12, goal.w + 6, 8);
      ctx.fillStyle = palette.white;
      text("EXIT", x - 1, goal.y - 5, 6);
      ctx.fillStyle = palette.yellow;
      rect(x + goal.w / 2 - 1, goal.y + goal.h / 2, 2, 6);
      return;
    }
    if (getTheme() === "mania") {
      // Venue EXIT: a lit door back to the street. Green when the room is
      // cleared (this visit or a previous one — cleared venues rebuild no
      // enemies), red while shills remain. Either way it works; clearing is
      // what banks the split.
      const totals = venueEnemyTotals();
      const cleared = state.venuesCleared.includes(state.venueKey) ||
        (totals.total > 0 && totals.killed >= totals.total);
      ctx.fillStyle = palette.ink;
      rect(x - 2, goal.y - 2, goal.w + 6, goal.h + 4);
      ctx.fillStyle = palette.ink2;
      rect(x, goal.y, goal.w + 2, goal.h);
      ctx.fillStyle = cleared ? palette.green : palette.red;
      rect(x - 2, goal.y - 10, goal.w + 6, 7);
      ctx.fillStyle = palette.white;
      text("EXIT", x - 1, goal.y - 4, 6);
      ctx.fillStyle = palette.yellow;
      rect(x + goal.w - 4, goal.y + goal.h / 2, 2, 4);
      return;
    }
    if (getTheme() === "tour") {
      // INTERNET OF MONEY finish: the globe itself on a stage pedestal, every
      // continent carrying a lit adoption node — the tour worked.
      ctx.fillStyle = palette.ink2;
      rect(x + 7, goal.y + 26, 10, goal.h - 30);
      rect(x + 2, goal.y + 44, 20, 4);
      ctx.fillStyle = "#1c355c";
      rect(x - 3, goal.y - 1, 28, 28);
      ctx.fillStyle = palette.blue2;
      rect(x - 1, goal.y + 1, 24, 24);
      ctx.fillStyle = palette.green2;
      rect(x + 2, goal.y + 5, 8, 6);
      rect(x + 13, goal.y + 8, 7, 5);
      rect(x + 5, goal.y + 16, 6, 5);
      ctx.fillStyle = Math.floor(state.time * 4) % 2 ? palette.yellow : palette.orange;
      rect(x + 4, goal.y + 7, 2, 2);
      rect(x + 16, goal.y + 10, 2, 2);
      rect(x + 8, goal.y + 18, 2, 2);
      return;
    }
    if (getTheme() === "network") {
      // THE NETWORK finish: a small server rack with a grid of green node lights
      // and a blinking uplink lamp — the live network you hand the work off to.
      ctx.fillStyle = palette.ink2;
      rect(x, goal.y + 2, goal.w + 14, goal.h + 4);
      ctx.fillStyle = palette.gray2;
      rect(x + 2, goal.y + 4, goal.w + 10, 3);
      // Node-light grid (3x4), all lit — the network is fully online here.
      ctx.fillStyle = palette.green;
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 4; c += 1) rect(x + 4 + c * 6, goal.y + 12 + r * 8, 3, 3);
      }
      // Uplink lamp.
      ctx.fillStyle = Math.floor(state.time * 4) % 2 ? palette.yellow : palette.orange;
      rect(x + goal.w / 2, goal.y - 6, 4, 6);
      return;
    }
    ctx.fillStyle = palette.ink2;
    rect(x, goal.y + 8, goal.w, goal.h - 8);
    ctx.fillStyle = palette.paper;
    rect(x + 4, goal.y, goal.w + 18, 28);
    ctx.fillStyle = palette.orange;
    rect(x + 8, goal.y + 5, 14, 3);
    ctx.fillStyle = palette.ink;
    rect(x + 8, goal.y + 12, 28, 1);
    rect(x + 8, goal.y + 17, 24, 1);
    rect(x + 8, goal.y + 22, 18, 1);
  }

  function drawEnemies(cam) {
    for (const enemy of enemies) {
      if (!enemy.alive && enemy.squashed <= 0) continue;
      const x = Math.round(enemy.x - cam);
      if (x < -20 || x > VIEW_W + 20) continue;

      if (!enemy.alive) {
        // Defeated: a settling dust pile with a couple of star specks.
        ctx.fillStyle = "#9a938a";
        rect(x + 1, enemy.y + enemy.h - 4, enemy.w - 2, 4);
        ctx.fillStyle = "#c0bab0";
        rect(x + 3, enemy.y + enemy.h - 6, enemy.w - 6, 3);
        continue;
      }

      // Ground shadow under every standing threat.
      ctx.fillStyle = "rgba(16, 16, 24, 0.25)";
      rect(x + 2, enemy.y + enemy.h - 1, 12, 2);

      // Level-2 threats have bespoke sprites (ticket 60f350ff) so the legacy
      // system reads distinctly at a glance. Level 1's banker/printer/miner fall
      // through to the three shared archetype shapes (machine/critter/patroller).
      if (enemy.type === "fud") { drawFud(x, enemy.y, enemy.w, enemy.h); continue; }
      if (enemy.type === "chargeback") { drawChargeback(x, enemy.y, enemy.w, enemy.h); continue; }
      if (enemy.type === "exploit") { drawExploit(x, enemy.y, enemy.w, enemy.h); continue; }
      if (enemy.type === "suit") { drawSuit(x, enemy.y); continue; }
      if (enemy.type === "agent") { drawAgent(x, enemy.y, enemy); continue; }
      if (enemy.type === "wiretap") { drawWiretap(x, enemy.y); continue; }
      if (enemy.type === "shiller") { drawShiller(x, enemy.y); continue; }
      if (enemy.type === "rugpull") { drawRugpull(x, enemy.y); continue; }
      if (enemy.type === "degen") { drawDegen(x, enemy.y); continue; }
      if (enemy.type === "shitgun") { drawShitgun(x, enemy.y, enemy); continue; }

      const shape = enemyConfig(enemy.type).shape;
      if (shape === "machine") {
        ctx.fillStyle = palette.gray2;
        rect(x, enemy.y + 4, enemy.w, enemy.h - 4);
        ctx.fillStyle = palette.gray;
        rect(x + 2, enemy.y, enemy.w - 4, 6);
        ctx.fillStyle = palette.red;
        rect(x + 3, enemy.y + 8, 10, 2);
        ctx.fillStyle = palette.paper;
        rect(x + 4, enemy.y + 13, 8, 3);
      } else if (shape === "critter") {
        ctx.fillStyle = palette.green2;
        rect(x + 1, enemy.y + 6, enemy.w - 2, enemy.h - 6);
        ctx.fillStyle = palette.green;
        rect(x + 3, enemy.y + 1, enemy.w - 6, 8);
        ctx.fillStyle = palette.paper;
        rect(x + 5, enemy.y + 10, 3, 3);
        rect(x + 10, enemy.y + 10, 3, 3);
      } else {
        ctx.fillStyle = palette.red2;
        rect(x + 1, enemy.y + 6, enemy.w - 2, enemy.h - 6);
        ctx.fillStyle = palette.red;
        rect(x + 3, enemy.y + 1, enemy.w - 6, 8);
        ctx.fillStyle = palette.ink;
        rect(x + 4, enemy.y + 11, 3, 3);
        rect(x + 11, enemy.y + 11, 3, 3);
      }
    }
  }

  // FUD — a red tabloid headline sheet: pale paper, a red banner, a blaring "!"
  // and a couple of body-text lines. Reads as alarmist press ("Bitcoin is dead")
  // rather than the L1 banker's red goon, while keeping the same patrol footprint.
  function drawFud(x, y, w, h) {
    ctx.fillStyle = palette.paper2;
    rect(x, y + 2, w, h - 3);
    ctx.fillStyle = palette.paper;
    rect(x + 1, y + 3, w - 2, h - 5);
    ctx.fillStyle = palette.red;
    rect(x + 1, y + 3, w - 2, 4);
    ctx.fillStyle = palette.red2;
    rect(x + 3, y + 9, 2, 5);
    rect(x + 3, y + 15, 2, 1);
    ctx.fillStyle = palette.ink2;
    rect(x + 8, y + 10, 6, 1);
    rect(x + 8, y + 13, 5, 1);
  }

  // CHARGEBACK — a violet reversal terminal: a card slot over a counter-clockwise
  // "reverse" arrow. Represents the reversible-payments world Bitcoin replaced;
  // distinct from the L1 printer's grey machine. Spark color is violet to match.
  function drawChargeback(x, y, w, h) {
    ctx.fillStyle = palette.violet;
    rect(x, y + 3, w, h - 3);
    ctx.fillStyle = "#5a3fb0";
    rect(x, y + 3, w, 2);
    ctx.fillStyle = palette.ink;
    rect(x + 2, y + 7, w - 4, 2);
    // Reversal arrow drawn from rects: an arc on the left, arrowhead top-right.
    ctx.fillStyle = palette.white;
    rect(x + 4, y + 11, 8, 1);
    rect(x + 4, y + 11, 1, 4);
    rect(x + 4, y + 14, 4, 1);
    rect(x + 11, y + 9, 1, 3);
    rect(x + 10, y + 9, 3, 1);
  }

  // EXPLOIT — a live bug: green segmented body, red glitch eyes, antennae and
  // legs. The squashable threat you "patch" by landing on it; distinct from the
  // L1 miner's friendly critter (which has pale eyes and no antennae/legs).
  function drawExploit(x, y, w, h) {
    ctx.fillStyle = palette.green2;
    rect(x + 3, y, 1, 3);
    rect(x + 12, y, 1, 3);
    ctx.fillStyle = palette.green;
    rect(x + 2, y + 3, w - 4, h - 6);
    ctx.fillStyle = palette.green2;
    rect(x + 2, y + 3, w - 4, 2);
    ctx.fillStyle = "#1c7a44";
    rect(x + 2, y + 9, w - 4, 1);
    ctx.fillStyle = palette.red;
    rect(x + 5, y + 6, 2, 2);
    rect(x + 9, y + 6, 2, 2);
    ctx.fillStyle = palette.green2;
    rect(x + 1, y + h - 3, 2, 3);
    rect(x + w - 3, y + h - 3, 2, 3);
  }

  // SUIT — a bank lobbyist: pinstripe grey suit, red power tie, slicked hair,
  // and a briefcase with a gold latch. The pushback in person; distinct from
  // L1's abstract red banker goon.
  function drawSuit(x, y) {
    ctx.fillStyle = palette.ink;
    rect(x + 3, y + 14, 3, 4);
    rect(x + 8, y + 14, 3, 4);
    ctx.fillStyle = palette.gray2;
    rect(x + 1, y + 6, 12, 9);
    ctx.fillStyle = palette.gray;
    rect(x + 3, y + 6, 1, 9);
    rect(x + 6, y + 6, 1, 9);
    rect(x + 9, y + 6, 1, 9);
    ctx.fillStyle = palette.white;
    rect(x + 6, y + 7, 3, 2);
    ctx.fillStyle = palette.red;
    rect(x + 7, y + 8, 2, 4);
    ctx.fillStyle = palette.paper;
    rect(x + 4, y + 1, 7, 6);
    ctx.fillStyle = palette.ink;
    rect(x + 4, y, 7, 2);
    rect(x + 5, y + 3, 1, 2);
    rect(x + 8, y + 3, 1, 2);
    ctx.fillStyle = palette.brown2;
    rect(x + 12, y + 10, 4, 6);
    ctx.fillStyle = palette.yellow;
    rect(x + 13, y + 12, 2, 1);
  }

  // AGENT — the Matrix-grade Wall Street tail: black suit with a charcoal
  // sheen, white shirt and red tie, briefcase, and shades that catch a glint
  // every few seconds. While `windup` runs he holds a coin aloft — the tell
  // before the arcing shitcoin throw.
  function drawAgent(x, y, enemy) {
    const winding = enemy && enemy.windup > 0;
    const seed = enemy ? enemy.x : 0;
    const glint = mod(Math.floor(state.time * 3) + mod(seed, 7), 9) === 0;
    const step = Math.abs(enemy.vx) > 0 && !winding ? Math.floor(state.time * 8 + seed) % 2 : 0;
    // Shoes.
    ctx.fillStyle = palette.ink;
    if (step === 0) {
      rect(x + 3, y + 15, 4, 3);
      rect(x + 9, y + 15, 4, 3);
    } else {
      rect(x + 2, y + 15, 4, 3);
      rect(x + 10, y + 15, 4, 3);
    }
    // Suit body with sheen lapels.
    ctx.fillStyle = palette.ink;
    rect(x + 1, y + 6, 14, 9);
    ctx.fillStyle = "#35374e";
    rect(x + 6, y + 6, 4, 6);
    rect(x + 2, y + 6, 1, 9);
    // Shirt V + red tie.
    ctx.fillStyle = palette.white;
    rect(x + 7, y + 7, 2, 3);
    ctx.fillStyle = palette.red;
    rect(x + 7, y + 9, 1, 3);
    // Off arm + briefcase.
    ctx.fillStyle = palette.ink;
    rect(x - 1, y + 8, 2, 5);
    ctx.fillStyle = palette.brown2;
    rect(x - 3, y + 12, 5, 4);
    ctx.fillStyle = palette.yellow;
    rect(x - 2, y + 13, 2, 1);
    // Throwing arm: cocked back with a coin while winding, else at rest.
    ctx.fillStyle = palette.ink;
    if (winding) {
      rect(x + 14, y + 1, 2, 6);
      ctx.fillStyle = palette.orange;
      rect(x + 14, y - 2, 3, 3);
      ctx.fillStyle = palette.yellow;
      rect(x + 15, y - 1, 1, 1);
    } else {
      rect(x + 15, y + 8, 2, 5);
    }
    // Head: slick hair, pale face, shades.
    ctx.fillStyle = palette.paper;
    rect(x + 4, y + 1, 8, 5);
    ctx.fillStyle = palette.ink;
    rect(x + 4, y, 8, 2);
    rect(x + 4, y + 3, 8, 2);
    if (glint) {
      ctx.fillStyle = palette.white;
      rect(x + 6, y + 3, 2, 1);
    }
  }

  // WIRETAP — a listening bug on legs: grey shell, violet cap, dark mic grille,
  // and a record lamp blinking on its antenna. The squashable L3 threat — stomp
  // it to sweep the room.
  function drawWiretap(x, y) {
    ctx.fillStyle = palette.gray;
    rect(x + 7, y + 1, 2, 3);
    ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? palette.red : palette.red2;
    rect(x + 6, y, 4, 2);
    ctx.fillStyle = palette.gray2;
    rect(x + 2, y + 4, 12, 11);
    ctx.fillStyle = palette.violet;
    rect(x + 2, y + 4, 12, 2);
    ctx.fillStyle = palette.ink;
    rect(x + 4, y + 8, 2, 4);
    rect(x + 7, y + 8, 2, 4);
    rect(x + 10, y + 8, 2, 4);
    ctx.fillStyle = palette.gray2;
    rect(x + 1, y + 15, 3, 3);
    rect(x + 12, y + 15, 3, 3);
  }

  // SHILLER — the token pumper working the room: violet tracksuit, gold chain,
  // and a raised "TO THE MOON" sign flipping on a two-frame wave.
  function drawShiller(x, y) {
    const wave = Math.floor(state.time * 3) % 2;
    ctx.fillStyle = palette.ink2;
    rect(x + 3, y + 14, 3, 4);
    rect(x + 9, y + 14, 3, 4);
    ctx.fillStyle = palette.violet;
    rect(x + 2, y + 6, 11, 9);
    ctx.fillStyle = palette.yellow;
    rect(x + 4, y + 7, 7, 1);
    ctx.fillStyle = palette.paper;
    rect(x + 4, y + 1, 7, 6);
    ctx.fillStyle = palette.ink;
    rect(x + 5, y + 3, 1, 2);
    rect(x + 8, y + 3, 1, 2);
    // Sign arm.
    ctx.fillStyle = palette.gray;
    rect(x + 13, y + 2 - wave, 1, 6);
    ctx.fillStyle = palette.paper2;
    rect(x + 11, y - 4 - wave, 7, 6);
    ctx.fillStyle = palette.red;
    rect(x + 13, y - 3 - wave, 3, 2);
    rect(x + 14, y - 4 - wave, 1, 4);
  }

  // RUGPULL — the exit-liquidity machine: a red carpet-roller that winds the
  // rug in as it patrols; a gold coin sits on top as the bait.
  function drawRugpull(x, y) {
    const spin = Math.floor(state.time * 6) % 2;
    ctx.fillStyle = palette.red2;
    rect(x, y + 8, 16, 10);
    ctx.fillStyle = palette.red;
    rect(x + 1, y + 4, 14, 6);
    ctx.fillStyle = palette.ink;
    rect(x + 3 + spin * 4, y + 5, 2, 4);
    rect(x + 9 + spin * 2, y + 5, 2, 4);
    ctx.fillStyle = palette.yellow;
    rect(x + 6, y, 4, 4);
    ctx.fillStyle = palette.orange2;
    rect(x + 7, y + 1, 2, 2);
    ctx.fillStyle = palette.brown2;
    rect(x, y + 16, 16, 2);
  }

  // DEGEN — the 100x-leverage gambler: green visor, wild hair, phone in hand
  // with a red chart, jittering fast like the liquidation candle just printed.
  function drawDegen(x, y) {
    const jit = Math.floor(state.time * 10) % 2;
    ctx.fillStyle = palette.ink2;
    rect(x + 3, y + 14, 3, 4);
    rect(x + 9, y + 14, 3, 4);
    ctx.fillStyle = palette.green2;
    rect(x + 2, y + 7, 11, 8);
    ctx.fillStyle = palette.paper;
    rect(x + 4, y + 2, 7, 6);
    ctx.fillStyle = palette.brown2;
    rect(x + 3, y + jit, 9, 2);
    ctx.fillStyle = palette.green;
    rect(x + 4, y + 3, 7, 2);
    ctx.fillStyle = palette.ink;
    rect(x + 5, y + 6, 1, 1);
    rect(x + 8, y + 6, 1, 1);
    // Phone with a red dumping chart.
    ctx.fillStyle = palette.ink;
    rect(x + 12, y + 8 - jit, 4, 6);
    ctx.fillStyle = palette.red;
    rect(x + 13, y + 9 - jit, 1, 1);
    rect(x + 14, y + 11 - jit, 1, 2);
  }

  // SHITGUN — the shitcoin shooter: a coin-hopper turret on legs. Brown hopper
  // full of tokens, a barrel aimed at the player, and a muzzle that glows just
  // before it fires (fireTimer low) so the shot is readable and dodgeable.
  function drawShitgun(x, y, enemy) {
    const aim = player.x + player.w / 2 > enemy.x + enemy.w / 2 ? 1 : -1;
    const winding = enemy.fireTimer < 0.4;
    // Legs.
    ctx.fillStyle = palette.gray2;
    rect(x + 1, y + 14, 3, 4);
    rect(x + 12, y + 14, 3, 4);
    // Hopper body.
    ctx.fillStyle = palette.brown2;
    rect(x + 1, y + 5, 14, 10);
    ctx.fillStyle = palette.brown;
    rect(x + 2, y + 6, 12, 4);
    ctx.fillStyle = "#9a7048";
    rect(x + 2, y + 6, 12, 1);
    // Tokens piled in the hopper.
    ctx.fillStyle = palette.violet;
    rect(x + 3, y + 3, 4, 3);
    ctx.fillStyle = palette.yellow;
    rect(x + 8, y + 2, 4, 4);
    // Barrel, flipped toward the player; muzzle glows while winding up.
    ctx.fillStyle = palette.gray2;
    rect(aim > 0 ? x + 13 : x - 3, y + 8, 6, 4);
    ctx.fillStyle = winding ? palette.red : palette.ink;
    rect(aim > 0 ? x + 17 : x - 3, y + 9, 2, 2);
  }

  // Projectiles. Turret shitcoins spin (two-frame squash); lobbed coins from
  // agents tumble through the air as proper little coins; sat shots are quick
  // orange bolts.
  function drawShots(cam) {
    const spin = Math.floor(state.time * 10) % 2;
    for (const s of shots) {
      if (!s.alive) continue;
      const x = Math.round(s.x - cam);
      if (x < -10 || x > VIEW_W + 10) continue;
      const y = Math.round(s.y);
      if (s.lob) {
        ctx.fillStyle = palette.brown2;
        rect(x, y, 8, 8);
        ctx.fillStyle = palette.brown;
        rect(x + 1, y + 1, 6, 6);
        ctx.fillStyle = palette.yellow;
        rect(x + 2 + spin, y + 2, 3 - spin, 3);
        continue;
      }
      ctx.fillStyle = palette.brown;
      rect(x + spin, y, 8 - spin * 2, 8);
      ctx.fillStyle = palette.violet;
      rect(x + 2, y + 2, 4 - spin, 4);
    }
    for (const s of satShots) {
      if (!s.alive) continue;
      const x = Math.round(s.x - cam);
      if (x < -8 || x > VIEW_W + 8) continue;
      ctx.fillStyle = palette.orange;
      rect(x, Math.round(s.y), 6, 4);
      ctx.fillStyle = palette.yellow;
      rect(x + (s.vx > 0 ? 4 : 0), Math.round(s.y) + 1, 2, 2);
    }
  }

  function drawParticles(cam) {
    for (const p of particles) {
      if (!p.alive) continue;
      ctx.fillStyle = p.color;
      rect(Math.round(p.x - cam), Math.round(p.y), 2, 2);
    }
  }

  function drawPlayer(cam) {
    const x = Math.round(player.x - cam);
    const y = Math.round(player.y);
    const inv = player.invincible > 0 && Math.floor(state.time * 18) % 2 === 0;
    if (inv) return;

    const runFrame = Math.abs(player.vx) > 8 ? Math.floor(state.time * 12) % 2 : 0;
    const airborne = !player.onGround;
    const fx = player.facing < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(x + (fx < 0 ? player.w : 0), y);
    ctx.scale(fx, 1);

    ctx.fillStyle = palette.ink;
    rect(1, 3, 12, 16);
    rect(3, 0, 8, 4);
    ctx.fillStyle = "#222437";
    rect(2, 4, 10, 10);
    rect(0, 12, 14, 8);
    ctx.fillStyle = "#35374e";
    rect(3, 2, 8, 5);
    rect(3, 14, 8, 5);
    ctx.fillStyle = palette.ink;
    rect(4, 5, 8, 9);
    ctx.fillStyle = palette.paper2;
    rect(0, 17, 3, 5);
    rect(12, 17, 3, 5);

    ctx.fillStyle = palette.brown;
    if (airborne) {
      rect(3, 20, 4, 4);
      rect(9, 20, 4, 4);
    } else if (runFrame === 0) {
      rect(2, 20, 4, 4);
      rect(9, 20, 5, 4);
    } else {
      rect(3, 20, 5, 4);
      rect(8, 20, 4, 4);
    }

    ctx.fillStyle = palette.orange;
    rect(11, 8, 2, 2);

    // The SAT CANNON, carried at hip height in venues that grant it. Drawn in
    // local (already-flipped) space so it always points where you're facing.
    if (hasSatCannon()) {
      ctx.fillStyle = palette.gray2;
      rect(9, 12, 8, 3);
      ctx.fillStyle = palette.orange;
      rect(15, 12, 2, 3);
      ctx.fillStyle = palette.gray;
      rect(9, 11, 3, 2);
    }
    ctx.restore();
  }

  function drawToast() {
    if (state.toastTime <= 0) return;
    const width = Math.min(224, Math.max(92, state.toast.length * 6 + 16));
    const x = Math.floor((VIEW_W - width) / 2);
    const y = 34;
    ctx.fillStyle = "rgba(16, 16, 24, 0.78)";
    rect(x, y, width, 24);
    ctx.fillStyle = palette.paper;
    text(state.toast, x + 8, y + 16, 7);
  }

  function drawVignette() {
    ctx.fillStyle = "rgba(16, 16, 24, 0.18)";
    rect(0, 0, VIEW_W, 3);
    rect(0, VIEW_H - 3, VIEW_W, 3);
    rect(0, 0, 3, VIEW_H);
    rect(VIEW_W - 3, 0, 3, VIEW_H);
  }

  // Reflect the active movement mode onto <body> so CSS can swap the touch
  // pad between the 2-button side-view layout and the 4-button overworld pad,
  // and show the FIRE key only while the sat cannon is armed.
  function syncControlMode() {
    document.body.classList.toggle("overworld-mode", state.subMode === "overworld");
    document.body.classList.toggle("cannon-mode", hasSatCannon());
    const arcade = state.subMode === "brawler";
    const fireButton = document.querySelector('[data-action="fire"]');
    fireButton.textContent = arcade ? "ATTACK" : "●";
    fireButton.setAttribute("aria-label", arcade ? "Combo attack or jump kick" : "Fire sat cannon");
    if (arcade) document.querySelector('[data-action="special"]').setAttribute("aria-label", `${window.SatoshiBrawler.CHARACTERS[selectedFighter].special} special attack`);
    document.querySelector('[data-action="jump"]').textContent = arcade ? "JUMP" : "↑";
  }

  function syncHud(force = false) {
    syncControlMode();
    const zoneName = activeZone()?.name || "BROKEN WORLD";
    const coinLabel = levelLabel("coin", "BTC");
    const next = `${coinLabel}|${state.coins}|${state.lives}|${zoneName}|${state.pages}`;
    if (!force && next === state.hudCache) return;
    state.hudCache = next;
    hudCoins.textContent = `${coinLabel} ${pad2(state.coins)}`;
    hudLives.textContent = `LIVES ${state.lives}`;
    hudZone.textContent = zoneName;
  }

  function syncTimer() {
    const formatted = formatTime(state.time);
    if (formatted === state.timerCache) return;
    state.timerCache = formatted;
    hudTimer.textContent = formatted;
  }

  // Speedrun-friendly readout: minutes:seconds.centiseconds, e.g. "0:42.37".
  // Seconds and centiseconds are always two digits so the width stays stable.
  function formatTime(seconds) {
    const totalCentis = Math.max(0, Math.floor(seconds * 100));
    const centis = totalCentis % 100;
    const totalSeconds = Math.floor(totalCentis / 100);
    const secs = totalSeconds % 60;
    const mins = Math.floor(totalSeconds / 60);
    return `${mins}:${pad2(secs)}.${pad2(centis)}`;
  }

  function getJumpImpulse() {
    return JUMP - Math.min(state.coins * JUMP_PER_BTC, MAX_BTC_JUMP_BOOST);
  }

  function getZoneGradient(zone) {
    if (!zone.gradient) {
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      gradient.addColorStop(0, zone.sky);
      gradient.addColorStop(1, zone.sky2);
      zone.gradient = gradient;
    }
    return zone.gradient;
  }

  function loop(now) {
    if (!state.lastNow) state.lastNow = now;
    const dt = Math.min((now - state.lastNow) / 1000, MAX_FRAME);
    state.lastNow = now;
    state.accumulator += dt;

    while (state.accumulator >= STEP) {
      update(STEP);
      state.accumulator -= STEP;
    }

    render();
    updateAudio();
    requestAnimationFrame(loop);
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mod(value, size) {
    return ((value % size) + size) % size;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function rect(x, y, w, h) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function triangle(x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.lineTo(Math.round(x3), Math.round(y3));
    ctx.closePath();
    ctx.fill();
  }

  function hill(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.5, y - h, x + w, y);
    ctx.closePath();
    ctx.fill();
  }

  function text(value, x, y, size) {
    ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(value, Math.round(x), Math.round(y));
  }

  function setAction(action, active) {
    if (action === "throw") {
      if (active && !input.throw) input.throwPressed = true;
      input.throw = active;
    }
    if (action === "special") {
      if (active && !input.special) input.specialPressed = true;
      input.special = active;
    }
    if (action === "left") input.left = active;
    if (action === "right") input.right = active;
    if (action === "up") input.up = active;
    if (action === "down") input.down = active;
    if (action === "fire") {
      if (active && !input.fire) input.firePressed = true;
      input.fire = active;
    }
    if (action === "jump") {
      if (active && !input.jump) input.jumpPressed = true;
      if (!active && input.jump) input.jumpReleased = true;
      input.jump = active;
    }
  }

  // Leave native inputs alone: typing a leaderboard name and choosing a fighter
  // with radio keys must never trigger the game's movement or restart shortcuts.
  function isTextEntryTarget(event) {
    const el = event.target;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function handleKeyDown(event) {
    if (isTextEntryTarget(event)) return;

    // While the leaderboard overlay is open the game ignores gameplay keys; Escape
    // closes it, and every other key is left alone so Tab/Enter/Space drive its
    // buttons natively (the global game shortcuts must not swallow them).
    if (state.phase === "leaderboard") {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLeaderboard();
      }
      return;
    }

    // Let focused title utility buttons activate natively.
    if (state.phase === "title" && (event.target === leaderboardButton || event.target === soundButton)) return;

    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "a", "d", "w", "s", "x", "f", "c", "e", "q", "enter", "p", "r", "m", "escape"].includes(key)) {
      event.preventDefault();
    }

    if (key === "m") {
      toggleSound();
      return;
    }

    if (state.phase === "title") {
      // Left/right select a level; explicit play keys start it. Tab remains free
      // to reach the fighter picker and the native menu controls.
      if (key === "arrowleft" || key === "a") moveSelection(-1);
      else if (key === "arrowright" || key === "d") moveSelection(1);
      else if (["enter", " ", "x", "f"].includes(key)) startGame();
      return;
    }

    if (key === "p" || key === "escape") {
      if (state.phase === "playing" && state.paused) resumeGame();
      else pauseGame();
      return;
    }

    if (key === "r" && state.phase !== "title") {
      startGame();
      return;
    }

    if (state.paused || state.phase !== "playing") return;

    if (state.subMode === "brawler") {
      if (key === "e" || key === "q") setAction("throw", true);
      if (key === "a" || key === "arrowleft") setAction("left", true);
      if (key === "d" || key === "arrowright") setAction("right", true);
      if (key === "w" || key === "arrowup") setAction("up", true);
      if (key === "s" || key === "arrowdown") setAction("down", true);
      if (key === " ") setAction("jump", true);
      if (key === "x" || key === "f") setAction("fire", true);
      if (key === "c") setAction("special", true);
      return;
    }

    if (key === "a" || key === "arrowleft") setAction("left", true);
    if (key === "d" || key === "arrowright") setAction("right", true);
    // Up doubles as jump: the side-view reads jump, the overworld walk reads
    // up — the two are never active in the same subMode, so one mapping serves
    // both without a mode check here.
    if (key === "w" || key === "arrowup" || key === " ") {
      setAction("jump", true);
      setAction("up", true);
    }
    if (key === "s" || key === "arrowdown") setAction("down", true);
    if (key === "x" || key === "f") setAction("fire", true);
  }

  function handleKeyUp(event) {
    if (isTextEntryTarget(event)) return;
    const key = event.key.toLowerCase();
    if (key === "c") setAction("special", false);
    if (state.subMode === "brawler") {
      if (key === "e" || key === "q") setAction("throw", false);
      if (key === "a" || key === "arrowleft") setAction("left", false);
      if (key === "d" || key === "arrowright") setAction("right", false);
      if (key === "w" || key === "arrowup") setAction("up", false);
      if (key === "s" || key === "arrowdown") setAction("down", false);
      if (key === " ") setAction("jump", false);
      if (key === "x" || key === "f") setAction("fire", false);
      return;
    }
    if (key === "a" || key === "arrowleft") setAction("left", false);
    if (key === "d" || key === "arrowright") setAction("right", false);
    if (key === "w" || key === "arrowup" || key === " ") {
      setAction("jump", false);
      setAction("up", false);
    }
    if (key === "s" || key === "arrowdown") setAction("down", false);
    if (key === "x" || key === "f") setAction("fire", false);
  }

  function blockControlDefault(event) {
    event.preventDefault();
  }

  function initTouchControls() {
    for (const button of document.querySelectorAll("[data-action]")) {
      const action = button.dataset.action;
      const press = (event) => {
        event.preventDefault();
        if (typeof event.pointerId === "number" && typeof button.setPointerCapture === "function") {
          try {
            button.setPointerCapture(event.pointerId);
          } catch (error) {
            // The pointer may already be gone on older mobile browsers.
          }
        }
        if (state.phase === "title") {
          // On the title screen the d-pad navigates the level select and the
          // jump button starts the selected level — mirroring the keyboard map
          // and avoiding carrying a stray jump input into the run.
          if (action === "left") moveSelection(-1);
          else if (action === "right") moveSelection(1);
          // Up/down/fire do nothing on the title so a stray tap on a mode-only
          // key can't accidentally launch a level; jump starts the game.
          else if (action === "jump") startGame();
          return;
        }
        if (state.phase !== "playing" || state.paused) return;
        button.classList.add("active");
        setAction(action, true);
      };
      const release = (event) => {
        event.preventDefault();
        if (
          typeof event.pointerId === "number" &&
          typeof button.releasePointerCapture === "function" &&
          typeof button.hasPointerCapture === "function" &&
          button.hasPointerCapture(event.pointerId)
        ) {
          button.releasePointerCapture(event.pointerId);
        }
        button.classList.remove("active");
        setAction(action, false);
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("touchstart", press, { passive: false });
      button.addEventListener("touchend", release, { passive: false });
      button.addEventListener("touchcancel", release, { passive: false });
      button.addEventListener("touchmove", blockControlDefault, { passive: false });
      button.addEventListener("contextmenu", blockControlDefault);
      button.addEventListener("selectstart", blockControlDefault);
      button.addEventListener("dragstart", blockControlDefault);
    }
  }

  startButton.addEventListener("click", startGame);
  continueButton.addEventListener("click", resumeGame);
  restartButton.addEventListener("click", startGame);
  menuButton.addEventListener("click", showTitle);
  document.getElementById("arcade-pause").addEventListener("click", () => {
    if (state.paused) resumeGame();
    else pauseGame();
  });
  if (soundButton) soundButton.addEventListener("click", toggleSound);

  // Leaderboard entry points. The title button opens the first board; the results
  // button opens the board for the level just completed (and the submitted run is
  // highlighted there when present). Both are no-ops without the client module.
  if (leaderboardButton) {
    // Hide the title entry point entirely when the feature can't work at all.
    leaderboardButton.classList.toggle("hidden", !leaderboardClient || boardLevels.length === 0);
    leaderboardButton.addEventListener("click", function () { openLeaderboard(null, "title"); });
  }
  if (resultsLeaderboardButton) {
    resultsLeaderboardButton.addEventListener("click", function () {
      openLeaderboard(state.lastRun ? state.lastRun.levelId : null, "results");
    });
  }
  if (leaderboardBack) leaderboardBack.addEventListener("click", closeLeaderboard);
  // Mouse/touch level picking: a tap on an unlocked card selects that level.
  // Delegated so the listener survives renderLevelSelect rebuilding the cards.
  levelSelect.addEventListener("click", (event) => {
    const card = event.target.closest(".level-card");
    if (!card || card.disabled) return;
    const index = Number.parseInt(card.dataset.index, 10);
    if (!Number.isInteger(index)) return; // defensive: malformed card data
    selectLevel(index);
  });
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "playing") pauseGame();
  });

  // Surface the concise timing rules on the title screen, sourced from
  // TIMING_RULES so the player-facing note never drifts from the enforced rules.
  if (titleRules) titleRules.textContent = TIMING_RULES.summary;
  syncSoundButton();

  // Optional deep-link to a specific level via `?level=N` (1-based). setLevel
  // validates the value and runs initLevel() itself when it succeeds (so the
  // chosen level is active on the title screen too); otherwise fall back to
  // loading Level 1. Either branch runs initLevel exactly once.
  const requestedLevel = Number.parseInt(new URLSearchParams(location.search).get("level"), 10);
  renderFighterPicker();
  if (!setLevel(requestedLevel)) initLevel();
  renderLevelSelect();
  initTouchControls();
  syncHud(true);
  requestAnimationFrame(loop);
})();
