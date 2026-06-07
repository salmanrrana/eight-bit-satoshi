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
  const COYOTE = 0.085;
  const JUMP_BUFFER = 0.11;
  const TILE = 16;

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
  // "version" field in package.json on any release that changes timed play. The
  // full field-by-field contract lives in docs/leaderboard-contract.md.
  const GAME_VERSION = "1.0.0";

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
  // legacy-system threats read distinctly from Level 1's enemies.
  const ENEMY_TYPES = {
    banker: { speed: 28, score: 200, shape: "patroller", spark: palette.red, stompToast: "Threat cleared." },
    printer: { speed: 28, score: 200, shape: "machine", spark: palette.red, stompToast: "Printer jammed." },
    miner: { speed: 36, score: 350, shape: "critter", spark: palette.green, stompToast: "Threat cleared." },
    fud: { speed: 30, score: 200, shape: "patroller", spark: palette.red, stompToast: "FUD debunked." },
    chargeback: { speed: 26, score: 200, shape: "machine", spark: palette.violet, stompToast: "Reversal blocked." },
    exploit: { speed: 40, score: 350, shape: "critter", spark: palette.green, stompToast: "Exploit patched." }
  };

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
    }
  ];

  // Active level's scenery bands. Mirrors getCurrentLevel().zones so the existing
  // zone-index logic keeps working unchanged; assigned in initLevel.
  let zones = [];

  const state = {
    phase: "title",
    paused: false,
    levelIndex: 0,
    cameraX: 0,
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
    completionTime: 0,
    deaths: 0,
    splits: [],
    bestSplits: {},
    lastRun: null,
    // The entry the player most recently submitted (the server row, with its id),
    // so the leaderboard view can highlight "their" run. Null until a submit succeeds.
    lastSubmittedEntry: null,
    // Which level board the leaderboard view is currently showing, and where to
    // return when it closes ("title" or "results"). Both null while it is closed.
    leaderboardLevelId: null,
    leaderboardOrigin: null,
    hudCache: "",
    timerCache: ""
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
    const rulesVersion = typeof entry.rulesVersion === "number" ? entry.rulesVersion : TIMING_RULES.version;
    if (rulesVersion !== TIMING_RULES.version) return null;
    const splits = Array.isArray(entry.splits) ? entry.splits : [];
    return { time: entry.time, splits };
  }

  function saveLevelBest(level, time, splits) {
    const bests = loadBests();
    bests[level] = {
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
  // is the canonical "run payload" half of the leaderboard data contract
  // (docs/leaderboard-contract.md): the same fields and ruleset that drive the
  // HUD, results, and local bests also drive submissions. The submission flow
  // (ticket d14a34a5) wraps this with the player-supplied { playerName } and a
  // { clientTimestamp }; the backend assigns its own authoritative timestamp.
  function buildSubmission(isNewBest) {
    const level = getCurrentLevel();
    return {
      // Stable key the backend groups a leaderboard by. The display title can be
      // reworded without splitting a board, so id — not title — is authoritative.
      levelId: level.id,
      level: level.title,
      gameVersion: GAME_VERSION,
      rulesVersion: TIMING_RULES.version,
      category: TIMING_RULES.category,
      time: state.completionTime,
      deaths: state.deaths,
      // Collectibles. pagesTotal travels with pages so a reader (or the backend)
      // can validate "All Pages" without hard-coding each level's page count.
      coins: state.coins,
      pages: state.pages,
      pagesTotal: level.layout.pages.length,
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

  // Level unlock rule: Level 1 is always available, and each later level unlocks
  // once the previous level has been completed. Completion is tracked by the
  // persisted, rules-version-independent `cleared` flag (isLevelCleared) so the
  // unlock survives reloads — and a TIMING_RULES.version bump — without extra
  // storage.
  function isLevelUnlocked(index) {
    if (index <= 0) return true;
    if (index >= LEVELS.length) return false;
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
    jump: false,
    jumpPressed: false,
    jumpReleased: false
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
    deadTimer: 0
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
  const particles = new Array(48).fill(null).map(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, color: palette.orange }));
  // Finish marker box. Position and size are loaded from the active level's
  // definition in initLevel so the goal can sit anywhere per level.
  const goal = { x: 0, y: 0, w: 0, h: 0 };

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
    enemies.push({ x, y, w: 16, h: 18, vx: enemyConfig(type).speed, minX, maxX, type, alive: true, squashed: 0 });
  }

  function addHazard(x, y, w, h) {
    hazards.push({ x, y, w, h });
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

  function resetRun(full = true) {
    input.left = false;
    input.right = false;
    input.jump = false;
    input.jumpPressed = false;
    input.jumpReleased = false;

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
      state.splits.length = 0;
      state.bestSplits = loadBestSplitMap(getCurrentLevel().id);
      initLevel();
    }

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
    state.cameraX = Math.max(0, player.x - 80);
    state.toast = full ? `Run, jump, collect ${levelLabel("coin", "BTC")}.` : "Back to checkpoint.";
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
    showMessage("PAUSED", "Game paused.", "RESTART", true, true);
  }

  function resumeGame() {
    state.paused = false;
    messageScreen.classList.add("hidden");
  }

  function completeGame() {
    if (state.phase === "complete") return;
    state.phase = "complete";
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
    messageTitle.textContent = "BITCOIN LIVES";
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
      [levelLabel("pageStat", "PAGES"), `${state.pages}/${level.layout.pages.length}`],
      ["DEATHS", String(state.deaths)],
      ["LIVES", String(state.lives)]
    ];
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
  // adds a display name, and the network call owns validation/duplicate handling
  // (js/leaderboard-client.js + the shared rules in js/leaderboard-rules.js).
  //
  // Hard rule: this is purely additive. It only appears after a real completion
  // (showResults), never blocks PLAY AGAIN / LEVELS, and never throws into the
  // game — a missing rules/client module or an unreachable backend just degrades
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
    note.textContent = "Submit posts your name, time and run stats to the public leaderboard.";

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
    // cannot resubmit (prevents accidental double-submits; full anti-cheat is
    // ticket f5c6f03e). PLAY AGAIN starts a fresh run with a fresh form.
    let submitted = false;
    function lockForm() {
      submitted = true;
      input.disabled = true;
      button.disabled = true;
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (submitted || button.disabled) return;

      // Instant client-side name feedback before any network call. The backend
      // re-validates authoritatively (contract §2.3); this just saves a round trip
      // on the most common mistake (empty/too-long/bad-character names).
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
        // Remember the stored row (it carries the server id) so the leaderboard
        // view can highlight this player's run when they open it.
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
    showMessage("REKT", "Fiat got you. Restart the run.", "TRY AGAIN", false, true);
  }

  // ----- Leaderboard view (ticket 3048aa3c) -------------------------------------
  // An in-game overlay listing top times per level. Reachable from the title and
  // results screens. Like the rest of the leaderboard feature it is purely additive:
  // it owns no gameplay state, never throws into the loop, and degrades to clean
  // offline/error states when the backend is unreachable.

  // The playable levels the contract accepts a submission for. Falls back to all
  // levels if the rules module is missing so the picker is never empty.
  const boardLevels = LEVELS.filter(function (level) {
    if (!leaderboardRules) return true;
    return Object.prototype.hasOwnProperty.call(leaderboardRules.SUBMITTABLE_LEVELS, level.id);
  });

  const COMBINED_BOARD_ID = (leaderboardRules && leaderboardRules.COMBINED_LEVEL_ID) || "combined";

  // The tabs the view offers: one per submittable level, plus the virtual combined
  // total (contract §5) when at least two levels can contribute to it. A board
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
      // Context stats only — ANY% ranks on time alone (contract §3).
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

  // Personalised combined-progress line from the server's `you` summary. Tells a
  // player which level(s) they still need, confirms when they qualify, or — when we
  // don't know who they are this session — explains the combined board generically.
  function buildCombinedHint(you) {
    if (!you) {
      return leaderboardHint("The combined board ranks your total time across both levels — post a time on each to appear here.");
    }
    if (you.qualified) {
      return leaderboardHint("You qualify! Your combined total is " + formatTime(you.time) + " across both levels.");
    }
    const missing = Array.isArray(you.missing) ? you.missing : [];
    if (missing.length === 0) return null;
    const names = missing.map(function (levelId) {
      const level = LEVELS.find(function (l) { return l.id === levelId; });
      return levelShortLabel(levelId) + (level ? " (" + level.title + ")" : "");
    });
    return leaderboardHint("Finish " + names.join(" and ") + " to qualify for the combined total.");
  }

  // Build a combined-board row's level breakdown ("L1 1:02.40 · L2 1:55.10"), in
  // the canonical level order, from the entry's `levels` map.
  function combinedBreakdown(levels) {
    if (!levels) return [];
    return Object.keys(leaderboardRules.SUBMITTABLE_LEVELS)
      .filter(function (levelId) { return levels[levelId]; })
      .map(function (levelId) { return levelShortLabel(levelId) + " " + formatTime(levels[levelId].time); });
  }

  // The combined board (contract §5): total time across both levels, with each
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
    message.textContent = "No combined times yet. Post a time on both levels to be the first!";
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
    // For the combined board, tell the server who "you" are (if we know from a
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
        "Leaderboard offline. Start the backend (npm run server) to see rankings.",
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
    state.toastTime = Math.max(0, state.toastTime - dt);
    state.shake = Math.max(0, state.shake - dt);
    player.invincible = Math.max(0, player.invincible - dt);

    updateZone();
    updatePlayer(dt);
    updateEnemies(dt);
    updateCollectibles();
    updateCheckpoints();
    updateAllies();
    updateParticles(dt);

    if (overlap(player, goal)) completeGame();

    state.cameraX = clamp(player.x - 94, 0, WORLD_W - VIEW_W);
    input.jumpPressed = false;
    input.jumpReleased = false;
  }

  function updateZone() {
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
    }

    if (input.jumpReleased && player.vy < -120) {
      player.vy *= 0.58;
    }

    player.vy = Math.min(player.vy + GRAVITY * dt, 560);
    moveAxis(player, player.vx * dt, 0);
    player.onGround = false;
    moveAxis(player, 0, player.vy * dt);

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
        body.vy = 0;
        body.onGround = true;
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
    syncHud();
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) {
        enemy.squashed -= dt;
        continue;
      }

      enemy.x += enemy.vx * dt;
      if (enemy.x <= enemy.minX || enemy.x + enemy.w >= enemy.maxX) {
        enemy.vx *= -1;
        enemy.x = clamp(enemy.x, enemy.minX, enemy.maxX - enemy.w);
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
        state.toast = cfg.stompToast;
        state.toastTime = 1.1;
        burst(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, cfg.spark, 8);
      } else {
        hurtPlayer(false);
      }
    }
  }

  function updateCollectibles() {
    for (const coin of coins) {
      if (!coin.taken && overlap(player, coin)) {
        coin.taken = true;
        state.coins += 1;
        state.score += 50;
        burst(coin.x + 4, coin.y + 4, palette.orange, 5);
        syncHud();
      }
    }

    for (const page of pages) {
      if (!page.taken && overlap(player, page)) {
        page.taken = true;
        state.pages += 1;
        state.score += 250;
        state.toast = `${levelLabel("pageNote", "Whitepaper page")} ${state.pages}/${getCurrentLevel().layout.pages.length}`;
        state.toastTime = 1.7;
        burst(page.x + 5, page.y + 7, palette.paper, 10);
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
    const shakeX = state.shake > 0 ? Math.round(Math.sin(state.time * 92) * 2) : 0;
    const cam = Math.round(state.cameraX - shakeX);
    const zone = zones[state.currentZone];

    drawBackground(cam, zone);
    drawSolids(cam, zone);
    drawHazards(cam);
    drawCoins(cam);
    drawPages(cam);
    drawAllies(cam);
    drawCheckpoints(cam);
    drawGoal(cam);
    drawEnemies(cam);
    drawParticles(cam);
    drawPlayer(cam);
    drawToast();
    drawVignette();

    syncTimer();
  }

  function drawBackground(cam, zone) {
    ctx.fillStyle = getZoneGradient(zone);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    drawSunMoon(cam, zone);

    if (getTheme() === "network") {
      drawNetworkBackdrop(cam);
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

  function drawSunMoon(cam, zone) {
    const x = 196 - Math.floor(cam * 0.03) % 80;
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
        // Top edge + vertical seams. The network theme uses a terminal-green
        // "circuit floor" trim throughout; the city theme keeps its grey →
        // green-grass transition keyed off the zone progression.
        const network = getTheme() === "network";
        ctx.fillStyle = network ? "#3ad17a" : state.currentZone < 3 ? "#70745f" : "#54c35d";
        rect(x, solid.y, solid.w, network ? 2 : 4);
        ctx.fillStyle = network ? "#143a28" : state.currentZone < 3 ? "#262929" : "#225f35";
        for (let tx = x - mod(x, TILE); tx < x + solid.w; tx += TILE) {
          rect(tx, solid.y + 16, 1, solid.h - 16);
        }
      } else if (solid.kind === "question") {
        ctx.fillStyle = solid.hit ? palette.gray : palette.yellow;
        rect(x, solid.y, solid.w, solid.h);
        ctx.fillStyle = solid.hit ? palette.gray2 : palette.orange2;
        rect(x, solid.y, solid.w, 2);
        rect(x, solid.y + solid.h - 2, solid.w, 2);
        rect(x + 2, solid.y + 4, solid.w - 4, 1);
        ctx.fillStyle = solid.hit ? palette.paper2 : palette.ink;
        text(solid.hit ? "." : "?", x + 5, solid.y + 11, 8);
      } else if (solid.kind === "ledger") {
        ctx.fillStyle = palette.blue2;
        rect(x, solid.y, solid.w, solid.h);
        ctx.fillStyle = palette.blue;
        rect(x, solid.y, solid.w, 3);
        ctx.fillStyle = palette.paper2;
        for (let i = 6; i < solid.w - 6; i += 14) rect(x + i, solid.y + 6, 6, 2);
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
    const network = getTheme() === "network";
    const pulse = Math.floor(state.time * 8) % 2;
    for (const coin of coins) {
      if (coin.taken) continue;
      const x = Math.round(coin.x - cam);
      if (x < -8 || x > VIEW_W + 8) continue;
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
    const network = getTheme() === "network";
    for (const page of pages) {
      if (page.taken) continue;
      const x = Math.round(page.x - cam);
      if (x < -12 || x > VIEW_W + 12) continue;
      const bob = Math.round(Math.sin(state.time * 5 + page.x) * 2);
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
      else drawHal(x, ally.y);
    }
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
    const network = getTheme() === "network";
    for (const checkpoint of checkpoints) {
      const x = Math.round(checkpoint.x - cam);
      if (x < -20 || x > VIEW_W + 20) continue;
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
        ctx.fillStyle = palette.red2;
        rect(x, enemy.y + enemy.h - 5, enemy.w, 5);
        continue;
      }

      // Level-2 threats have bespoke sprites (ticket 60f350ff) so the legacy
      // system reads distinctly at a glance. Level 1's banker/printer/miner fall
      // through to the three shared archetype shapes (machine/critter/patroller).
      if (enemy.type === "fud") { drawFud(x, enemy.y, enemy.w, enemy.h); continue; }
      if (enemy.type === "chargeback") { drawChargeback(x, enemy.y, enemy.w, enemy.h); continue; }
      if (enemy.type === "exploit") { drawExploit(x, enemy.y, enemy.w, enemy.h); continue; }

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

  function syncHud(force = false) {
    const zoneName = zones[state.currentZone]?.name || "BROKEN WORLD";
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
    if (action === "left") input.left = active;
    if (action === "right") input.right = active;
    if (action === "jump") {
      if (active && !input.jump) input.jumpPressed = true;
      if (!active && input.jump) input.jumpReleased = true;
      input.jump = active;
    }
  }

  // A keyboard event is "text entry" when it targets an editable field — the only
  // one in the app is the leaderboard name input on the results screen. While it is
  // focused we must not hijack keys (e.g. "r" would restart the run) or preventDefault
  // typed characters, so both handlers bail out early for it.
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

    // On the title screen "any key starts the game"; let the focused LEADERBOARD
    // button activate natively instead of being swallowed by that shortcut.
    if (state.phase === "title" && event.target === leaderboardButton) return;

    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "enter", "p", "r"].includes(key)) {
      event.preventDefault();
    }

    if (state.phase === "title") {
      // Left/right move the level-select highlight; any other key (except the
      // pause/restart keys) starts the currently selected level, preserving the
      // fast "press to play" feel while making the picker keyboard-navigable.
      if (key === "arrowleft" || key === "a") moveSelection(-1);
      else if (key === "arrowright" || key === "d") moveSelection(1);
      else if (key !== "p" && key !== "r") startGame();
      return;
    }

    if (key === "p") {
      if (state.phase === "playing" && state.paused) resumeGame();
      else pauseGame();
      return;
    }

    if (key === "r" && state.phase !== "title") {
      startGame();
      return;
    }

    if (state.paused || state.phase !== "playing") return;

    if (key === "a" || key === "arrowleft") setAction("left", true);
    if (key === "d" || key === "arrowright") setAction("right", true);
    if (key === "w" || key === "arrowup" || key === " ") setAction("jump", true);
  }

  function handleKeyUp(event) {
    if (isTextEntryTarget(event)) return;
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") setAction("left", false);
    if (key === "d" || key === "arrowright") setAction("right", false);
    if (key === "w" || key === "arrowup" || key === " ") setAction("jump", false);
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
          else startGame();
          return;
        }
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

  // Optional deep-link to a specific level via `?level=N` (1-based). setLevel
  // validates the value and runs initLevel() itself when it succeeds (so the
  // chosen level is active on the title screen too); otherwise fall back to
  // loading Level 1. Either branch runs initLevel exactly once.
  const requestedLevel = Number.parseInt(new URLSearchParams(location.search).get("level"), 10);
  if (!setLevel(requestedLevel)) initLevel();
  renderLevelSelect();
  initTouchControls();
  syncHud(true);
  requestAnimationFrame(loop);
})();
