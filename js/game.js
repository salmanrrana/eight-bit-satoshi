(() => {
  "use strict";

  const VIEW_W = 256;
  const VIEW_H = 240;
  const WORLD_W = 5200;
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
  const LEVEL_NAME = "THE WHITEPAPER RUN";

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

  const zones = [
    { x: 0, name: "BROKEN WORLD", sky: "#52675b", sky2: "#2c3432", ground: "#4a4d47", accent: "#7d3a2c", text: "2008: money printers and broken banks." },
    { x: 720, name: "CYPHERPUNKS", sky: "#435070", sky2: "#24283e", ground: "#3b4055", accent: "#8d6de8", text: "Cryptography gives the individual a shield." },
    { x: 1450, name: "GENESIS", sky: "#6b778a", sky2: "#30394b", ground: "#565d63", accent: "#f7931a", text: "Mine the genesis block and keep moving." },
    { x: 2300, name: "BLOCKCHAIN", sky: "#66a2d8", sky2: "#345a88", ground: "#2f8d50", accent: "#ffd166", text: "Blocks link together. Enemies cannot rewrite them." },
    { x: 3150, name: "NETWORK", sky: "#5eb7c7", sky2: "#2a6770", ground: "#298766", accent: "#36bd63", text: "Nodes, miners, and users harden the network." },
    { x: 4000, name: "HANDOFF", sky: "#526b9f", sky2: "#222c55", ground: "#3e5f48", accent: "#f4ead2", text: "Satoshi fades. The system keeps running." },
    { x: 4700, name: "WHITEPAPER", sky: "#6aa9f2", sky2: "#385a93", ground: "#2f8d50", accent: "#f7931a", text: "Reach the whitepaper. The code lives on." }
  ];

  const state = {
    phase: "title",
    paused: false,
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
      level: LEVEL_NAME,
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
  window.eightBitSatoshi = Object.assign({}, window.eightBitSatoshi, {
    resetBests,
    getTimingRules,
    getLastRun
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
  const goal = { x: 5102, y: 128, w: 22, h: 48 };

  function initLevel() {
    solids.length = 0;
    coins.length = 0;
    pages.length = 0;
    enemies.length = 0;
    hazards.length = 0;
    checkpoints.length = 0;

    addGround(0, 620);
    addGround(700, 450);
    addGround(1220, 360);
    addGround(1640, 520);
    addGround(2260, 460);
    addGround(2820, 520);
    addGround(3420, 460);
    addGround(3920, 360);
    addGround(4380, 330);
    addGround(4800, 400);

    addPlatform(236, 154, 72, 14, "ledger");
    addPlatform(350, 128, 56, 14, "question");
    addPlatform(762, 154, 70, 14, "ledger");
    addPlatform(936, 132, 54, 14, "question");
    addPlatform(1288, 142, 78, 14, "ledger");
    addPlatform(1518, 150, 64, 14, "question");
    addPlatform(1788, 132, 58, 14, "ledger");
    addPlatform(1998, 154, 76, 14, "ledger");
    addPlatform(2328, 144, 76, 14, "question");
    addPlatform(2548, 120, 62, 14, "ledger");
    addPlatform(2860, 152, 72, 14, "ledger");
    addPlatform(3066, 132, 64, 14, "question");
    addPlatform(3460, 146, 78, 14, "ledger");
    addPlatform(3668, 120, 64, 14, "ledger");
    addPlatform(3970, 150, 74, 14, "question");
    addPlatform(4230, 134, 72, 14, "ledger");
    addPlatform(4480, 152, 62, 14, "ledger");
    addPlatform(4842, 150, 78, 14, "question");

    addBlockStack(540, 2);
    addBlockStack(1120, 3);
    addBlockStack(2190, 2);
    addBlockStack(3340, 3);
    addBlockStack(4720, 2);

    addCoinArc(156, 132, 5);
    addCoinArc(770, 126, 5);
    addCoinArc(1268, 112, 6);
    addCoinArc(1770, 104, 5);
    addCoinArc(2380, 112, 6);
    addCoinArc(2896, 120, 5);
    addCoinArc(3494, 112, 6);
    addCoinArc(4216, 106, 5);
    addCoinArc(4848, 116, 6);

    addPage(610, 150);
    addPage(1194, 138);
    addPage(1626, 124);
    addPage(2206, 136);
    addPage(2786, 138);
    addPage(3366, 122);
    addPage(3890, 136);
    addPage(4550, 138);
    addPage(5024, 116);

    addEnemy(420, 178, 450, 575, "banker");
    addEnemy(880, 178, 822, 1060, "printer");
    addEnemy(1346, 178, 1280, 1470, "banker");
    addEnemy(1900, 178, 1850, 2100, "printer");
    addEnemy(2448, 178, 2398, 2700, "miner");
    addEnemy(3230, 178, 3020, 3320, "banker");
    addEnemy(3550, 178, 3480, 3770, "printer");
    addEnemy(4100, 178, 4016, 4300, "miner");
    addEnemy(4890, 178, 4820, 5040, "banker");

    addHazard(655, 190, 40, 15);
    addHazard(1162, 190, 42, 15);
    addHazard(1570, 190, 42, 15);
    addHazard(2762, 190, 42, 15);
    addHazard(3378, 190, 42, 15);
    addHazard(3870, 190, 42, 15);
    addHazard(4338, 190, 42, 15);

    // Checkpoints carry a stable 1-based index and display name (the section
    // they open) so splits stay identifiable across results and personal bests.
    checkpoints.push(
      { x: 760, y: 172, index: 1, name: "CYPHERPUNKS", taken: false },
      { x: 1510, y: 172, index: 2, name: "GENESIS", taken: false },
      { x: 2350, y: 172, index: 3, name: "BLOCKCHAIN", taken: false },
      { x: 3180, y: 172, index: 4, name: "NETWORK", taken: false },
      { x: 4020, y: 172, index: 5, name: "HANDOFF", taken: false },
      { x: 4750, y: 172, index: 6, name: "WHITEPAPER", taken: false }
    );
  }

  function addGround(x, w) {
    solids.push({ x, y: 204, w, h: 36, kind: "ground", hit: false });
  }

  function addPlatform(x, y, w, h, kind) {
    solids.push({ x, y, w, h, kind, hit: false });
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
    enemies.push({ x, y, w: 16, h: 18, vx: type === "miner" ? 36 : 28, minX, maxX, type, alive: true, squashed: 0 });
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
      state.bestSplits = loadBestSplitMap(LEVEL_NAME);
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
    const previousBest = getLevelBest(LEVEL_NAME);
    const isNewBest = previousBest === null || state.completionTime < previousBest.time;
    if (isNewBest) saveLevelBest(LEVEL_NAME, state.completionTime, state.splits);
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
    const stats = [
      ["LEVEL", LEVEL_NAME],
      ["BTC", pad2(state.coins)],
      ["PAGES", `${state.pages}/9`],
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

  function moveAxis(body, dx, dy) {
    if (dx !== 0) body.x += dx;
    if (dy !== 0) body.y += dy;

    for (const solid of solids) {
      if (!overlap(body, solid)) continue;

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
    state.toast = "+3 BTC";
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
        enemy.alive = false;
        enemy.squashed = 0.3;
        player.vy = STOMP;
        state.score += enemy.type === "miner" ? 350 : 200;
        state.toast = enemy.type === "printer" ? "Printer jammed." : "Threat cleared.";
        state.toastTime = 1.1;
        burst(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, enemy.type === "miner" ? palette.green : palette.red, 8);
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
        state.toast = `Whitepaper page ${state.pages}/9`;
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

      if (enemy.type === "printer") {
        ctx.fillStyle = palette.gray2;
        rect(x, enemy.y + 4, enemy.w, enemy.h - 4);
        ctx.fillStyle = palette.gray;
        rect(x + 2, enemy.y, enemy.w - 4, 6);
        ctx.fillStyle = palette.red;
        rect(x + 3, enemy.y + 8, 10, 2);
        ctx.fillStyle = palette.paper;
        rect(x + 4, enemy.y + 13, 8, 3);
      } else if (enemy.type === "miner") {
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
    const next = `${state.coins}|${state.lives}|${zoneName}|${state.pages}`;
    if (!force && next === state.hudCache) return;
    state.hudCache = next;
    hudCoins.textContent = `BTC ${pad2(state.coins)}`;
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

  initLevel();
  initTouchControls();
  syncHud(true);
  requestAnimationFrame(loop);
})();
