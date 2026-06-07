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
  const hudCoins = document.getElementById("hud-coins");
  const hudLives = document.getElementById("hud-lives");
  const hudZone = document.getElementById("hud-zone");
  const hudTimer = document.getElementById("hud-timer");
  const titleRules = document.getElementById("title-rules");

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
  // Distinct Level-2 enemy *art* is a separate ticket (60f350ff), so the new
  // types reuse the closest existing shape here purely for readability.
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
          [3650, 178, 3540, 3880, "exploit"], [4200, 178, 4090, 4420, "chargeback"],
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
    return (labels && labels[key]) || fallback;
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
      // Storage unavailable or over quota: bests stay in-memory for the session.
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
  // Build a structured, rules-stamped summary of a finished run. This is the
  // single shape future leaderboard submission will send, so the same fields and
  // ruleset that drive the HUD, results, and local bests also drive submissions.
  function buildSubmission(isNewBest) {
    return {
      level: getCurrentLevel().title,
      rulesVersion: TIMING_RULES.version,
      category: TIMING_RULES.category,
      time: state.completionTime,
      deaths: state.deaths,
      coins: state.coins,
      pages: state.pages,
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
    const index = Math.floor(levelNumber) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) return false;
    if (state.phase === "playing") return false;
    state.levelIndex = index;
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
    levelCount: LEVELS.length
  });

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
    state.toast = full ? "Run, jump, collect BTC." : "Back to checkpoint.";
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

  function showMessage(title, copy, restartLabel = "RESTART", canContinue = false) {
    messageTitle.textContent = title;
    messageCopy.textContent = copy;
    messageCopy.classList.remove("hidden");
    messageResults.classList.add("hidden");
    restartButton.textContent = restartLabel;
    continueButton.classList.toggle("hidden", !canContinue);
    messageScreen.classList.remove("hidden");
  }

  function pauseGame() {
    if (state.phase !== "playing") return;
    state.paused = true;
    showMessage("PAUSED", "Game paused.", "RESTART", true);
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
      buildStats()
    );
    messageResults.classList.remove("hidden");

    restartButton.textContent = "PLAY AGAIN";
    continueButton.classList.add("hidden");
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

  function gameOver() {
    state.phase = "gameover";
    showMessage("REKT", "Fiat got you. Restart the run.", "TRY AGAIN");
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
    if (!cycle || !(cycle.periodMs > 0)) return true;
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
      if (solid.cycle && !isConfirmed(solid)) continue;

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

  function drawSunMoon(cam, zone) {
    const x = 196 - Math.floor(cam * 0.03) % 80;
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
        ctx.fillStyle = state.currentZone < 3 ? "#70745f" : "#54c35d";
        rect(x, solid.y, solid.w, 4);
        ctx.fillStyle = state.currentZone < 3 ? "#262929" : "#225f35";
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
    const pulse = Math.floor(state.time * 8) % 2;
    for (const coin of coins) {
      if (coin.taken) continue;
      const x = Math.round(coin.x - cam);
      if (x < -8 || x > VIEW_W + 8) continue;
      ctx.fillStyle = palette.orange2;
      rect(x + 1 + pulse, coin.y, 6 - pulse * 2, 8);
      ctx.fillStyle = palette.orange;
      rect(x + 2 + pulse, coin.y + 1, 4 - pulse * 2, 6);
    }
  }

  function drawPages(cam) {
    for (const page of pages) {
      if (page.taken) continue;
      const x = Math.round(page.x - cam);
      if (x < -12 || x > VIEW_W + 12) continue;
      const bob = Math.round(Math.sin(state.time * 5 + page.x) * 2);
      ctx.fillStyle = palette.paper;
      rect(x, page.y + bob, page.w, page.h);
      ctx.fillStyle = palette.paper2;
      rect(x + 2, page.y + 4 + bob, 7, 1);
      rect(x + 2, page.y + 8 + bob, 6, 1);
      ctx.fillStyle = palette.orange;
      rect(x + 8, page.y + bob, 3, 3);
    }
  }

  function drawCheckpoints(cam) {
    for (const checkpoint of checkpoints) {
      const x = Math.round(checkpoint.x - cam);
      if (x < -20 || x > VIEW_W + 20) continue;
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

      // Reuse one of three existing shapes per the enemy archetype (machine /
      // critter / patroller). Level-2 types map onto these for readability;
      // bespoke Level-2 art is ticket 60f350ff.
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

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "enter", "p", "r"].includes(key)) {
      event.preventDefault();
    }

    if (state.phase === "title") {
      if (key !== "p" && key !== "r") startGame();
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
        if (state.phase === "title") startGame();
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
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "playing") pauseGame();
  });

  // Surface the concise timing rules on the title screen, sourced from
  // TIMING_RULES so the player-facing note never drifts from the enforced rules.
  if (titleRules) titleRules.textContent = TIMING_RULES.summary;

  // Optional deep-link to a specific level via `?level=N` (1-based). Out-of-range
  // or missing values fall through to Level 1. Reading the param here (before the
  // first initLevel) means the chosen level is active on the title screen too.
  const requestedLevel = Number.parseInt(new URLSearchParams(location.search).get("level"), 10);
  if (Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= LEVELS.length) {
    state.levelIndex = requestedLevel - 1;
  }

  initLevel();
  initTouchControls();
  syncHud(true);
  requestAnimationFrame(loop);
})();
