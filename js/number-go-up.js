// Level 7 simulation: NUMBER GO UP, a Super Mario Bros. 3 / Super Mario World
// style side-scroller through Washington D.C., New York and Dubai. Rendering
// lives in number-go-up-art.js; hooks connect the run to game.js's timer,
// lives, splits and scoreboard. Runs in Node too, so tests drive it directly.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NumberGoUp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TILE = 16;
  const VIEW_W = 384;
  const VIEW_H = 216;
  const ROWS = 26;
  const GROUND = 23; // top row of the regular street
  const SECTION_COLS = 112;
  const COLS = SECTION_COLS * 3;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const P_FULL = 7; // six arrows plus the P, like the SMB3 meter

  // Each city floats one crypto bill. It always fails; Bitcoin climbs anyway.
  const SECTIONS = [
    {
      name: "WASHINGTON D.C.",
      city: "dc",
      from: 0,
      bill: "THE CBDC FREEDOM ACT",
      intro: "CONGRESS PUSHES THE CBDC FREEDOM ACT",
    },
    {
      name: "NEW YORK",
      city: "ny",
      from: SECTION_COLS,
      bill: "BITLICENSE 2.0",
      intro: "WALL ST LOBBIES FOR BITLICENSE 2.0",
    },
    {
      name: "DUBAI",
      city: "dubai",
      from: SECTION_COLS * 2,
      bill: "THE GLOBAL SHITCOIN TREATY",
      intro: "SUMMIT SIGNS THE GLOBAL SHITCOIN TREATY",
    },
  ];

  const SOLID = new Set(["G", "B", "?", "M", "S", "U", "H", "P", "K"]);
  const ENEMY = {
    politician: { w: 14, h: 14, speed: 26, score: 100, word: "VETOED!" },
    banker: { w: 14, h: 22, speed: 26, score: 200, word: "NO BAILOUT" },
    briefcase: { w: 14, h: 13, speed: 230, score: 100, word: "KICK!" },
    shitcoin: { w: 12, h: 12, speed: 92, score: 200, word: "RUGGED" },
    plant: { w: 14, h: 22, speed: 0, score: 200, word: "SHREDDED" },
  };
  const COMBO = [100, 200, 400, 800, 1000, 2000, 4000, 8000];

  // Tunings in pixels and seconds, modelled on SMB3's feel at 60 fps.
  const PHYS = {
    walk: 90,
    run: 150,
    pSpeed: 184,
    accel: 330,
    airAccel: 270,
    skid: 900,
    friction: 360,
    jump: 268,
    jumpPerSpeed: 0.2,
    gravityHeld: 560,
    gravity: 1500,
    maxFall: 300,
    stomp: 230,
    stompHeld: 350,
    flap: 165,
    flightTime: 4.2,
    floatFall: 55,
  };

  // Builds the tile map, semisolid platforms and spawns for all three cities.
  // Columns are absolute; each section adds its own offset `o`.
  function buildLevel() {
    const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill("."));
    const platforms = [];
    const spawns = [];
    const decor = [];
    const pipes = [];
    const set = (c, r, ch) => {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) tiles[r][c] = ch;
    };
    const ground = (c0, c1, top = GROUND) => {
      for (let c = c0; c <= c1; c++)
        for (let r = top; r < ROWS; r++) set(c, r, "G");
    };
    const row = (c, r, str) =>
      [...str].forEach((ch, i) => {
        if (ch !== " ") set(c + i, r, ch);
      });
    const coins = (c, r, n) => {
      for (let i = 0; i < n; i++) set(c + i, r, "o");
    };
    const arc = (c, r, n) => {
      for (let i = 0; i < n; i++)
        set(c + i, r - Math.round(Math.sin((i / (n - 1)) * Math.PI) * 2), "o");
    };
    const pipe = (c, h, plant = false, top = GROUND) => {
      for (let r = top - h; r < top; r++) {
        set(c, r, "P");
        set(c + 1, r, "P");
      }
      pipes.push({ c, r: top - h });
      if (plant)
        spawns.push({ type: "plant", x: c * TILE + 9, y: (top - h) * TILE });
    };
    const stairs = (c, n, dir = 1, top = GROUND) => {
      for (let i = 0; i < n; i++) {
        const h = dir > 0 ? i + 1 : n - i;
        for (let r = top - h; r < top; r++) set(c + i, r, "H");
      }
    };
    const plat = (c, r, w, h, color) =>
      platforms.push({
        x: c * TILE,
        y: r * TILE,
        w: w * TILE,
        h: h * TILE,
        color,
      });
    const cloud = (c, r, w) => {
      for (let i = 0; i < w; i++) set(c + i, r, "=");
    };
    const cannon = (c, h = 2, top = GROUND) => {
      for (let r = top - h; r < top; r++) set(c, r, "K");
    };
    const enemy = (type, c, opts = {}) =>
      spawns.push({
        type,
        x: c * TILE + 1,
        y:
          (opts.row ?? GROUND) * TILE -
          ENEMY[type === "winged" ? "banker" : type].h,
        ...opts,
      });
    const deco = (kind, c, r = GROUND) =>
      decor.push({ kind, x: c * TILE, y: r * TILE });

    // --- WASHINGTON D.C. — the National Mall -------------------------------
    let o = 0;
    ground(o, o + 44);
    deco("lamp", o + 2);
    deco("bush", o + 6);
    deco("flag", o + 9);
    row(o + 10, 19, "?");
    row(o + 14, 19, "B?BMB");
    row(o + 16, 15, "?");
    enemy("politician", o + 19);
    pipe(o + 24, 2);
    deco("bush", o + 27);
    plat(o + 28, 20, 6, 3, "mint");
    plat(o + 31, 17, 6, 6, "peach");
    coins(o + 32, 16, 4);
    enemy("politician", o + 30);
    enemy("politician", o + 35);
    pipe(o + 40, 3, true);
    // pit 45–47
    ground(o + 48, o + 111);
    deco("tree", o + 49);
    enemy("banker", o + 53);
    row(o + 54, 19, "B?B?B");
    arc(o + 54, 15, 5);
    stairs(o + 60, 4, 1);
    // pit 64–65
    for (let c = o + 64; c <= o + 65; c++)
      for (let r = GROUND; r < ROWS; r++) set(c, r, ".");
    stairs(o + 66, 4, -1);
    deco("lamp", o + 71);
    // A long runway to fill the P-meter, then fly for the sky sats.
    row(o + 74, 19, "?M?");
    enemy("politician", o + 80);
    enemy("politician", o + 82);
    cloud(o + 82, 10, 6);
    coins(o + 82, 9, 6);
    arc(o + 89, 7, 6);
    cloud(o + 95, 9, 4);
    coins(o + 95, 8, 4);
    enemy("winged", o + 88, { mode: "hop" });
    enemy("politician", o + 91);
    deco("bush", o + 93);
    cannon(o + 100);
    deco("lamp", o + 104);
    enemy("politician", o + 105);
    deco("gate", o + 108);

    // --- NEW YORK — Wall St to Times Square -------------------------------
    o = SECTION_COLS;
    ground(o, o + 41);
    deco("hydrant", o + 3);
    row(o + 6, 19, "?B?BM");
    row(o + 8, 15, "B?B");
    pipe(o + 12, 2);
    enemy("politician", o + 15);
    pipe(o + 18, 3, true);
    enemy("winged", o + 22, { mode: "hop" });
    pipe(o + 25, 4, true);
    plat(o + 30, 19, 5, 4, "orange");
    plat(o + 33, 16, 6, 7, "sky");
    coins(o + 34, 15, 4);
    enemy("banker", o + 36);
    // pit 42–45 with bricks overhead
    row(o + 42, 16, "BBBB");
    coins(o + 42, 15, 4);
    ground(o + 46, o + 81);
    row(o + 48, 19, "B?BSB");
    deco("hydrant", o + 50);
    // The star lets you plough through the lobby crowd.
    enemy("politician", o + 54);
    enemy("banker", o + 57);
    enemy("politician", o + 59);
    enemy("politician", o + 61);
    enemy("banker", o + 64);
    enemy("politician", o + 66);
    row(o + 58, 19, "BBBBBBBB");
    coins(o + 58, 15, 8);
    cannon(o + 70);
    deco("bench", o + 73);
    cannon(o + 77, 3);
    // pit 82–85 guarded by flying lobbyists
    enemy("winged", o + 83, { mode: "fly", row: 17 });
    ground(o + 86, o + 111);
    stairs(o + 88, 4, 1);
    row(o + 94, 19, "?M?");
    enemy("banker", o + 97);
    pipe(o + 101, 2);
    enemy("politician", o + 104);
    deco("gate", o + 108);

    // --- DUBAI — dunes, towers and fireworks ------------------------------
    o = SECTION_COLS * 2;
    ground(o, o + 37);
    deco("palm", o + 2);
    row(o + 6, 19, "?M?");
    enemy("politician", o + 10);
    ground(o + 12, o + 20, 21);
    deco("palm", o + 14, 21);
    enemy("banker", o + 16, { row: 21 });
    coins(o + 13, 18, 6);
    pipe(o + 24, 3, true);
    enemy("politician", o + 28);
    pipe(o + 32, 4, true);
    // pit 38–42 with a cloud bridge and flyers
    cloud(o + 39, 20, 3);
    coins(o + 39, 19, 3);
    enemy("winged", o + 40, { mode: "fly", row: 13 });
    ground(o + 43, o + 111);
    plat(o + 45, 20, 4, 3, "gold");
    plat(o + 47, 17, 5, 6, "rose");
    plat(o + 50, 14, 4, 9, "sky");
    row(o + 51, 10, "M");
    coins(o + 45, 19, 3);
    enemy("politician", o + 55);
    deco("palm", o + 57);
    // Shitcoin gauntlet: the BS hoodie shrugs these off.
    cannon(o + 60);
    enemy("politician", o + 63);
    cannon(o + 66, 3);
    enemy("banker", o + 69);
    cannon(o + 72);
    arc(o + 74, 15, 6);
    row(o + 78, 19, "B?SB");
    enemy("politician", o + 82);
    enemy("politician", o + 84);
    enemy("banker", o + 86);
    enemy("politician", o + 88);
    enemy("winged", o + 90, { mode: "hop" });
    deco("palm", o + 92);
    stairs(o + 94, 8, 1);
    deco("goal", o + 106);
    deco("palm", o + 109);

    const checkpoints = [
      { index: 0, x: (SECTION_COLS - 4) * TILE, name: SECTIONS[0].name },
      { index: 1, x: (SECTION_COLS * 2 - 4) * TILE, name: SECTIONS[1].name },
    ];
    return {
      tiles,
      platforms,
      spawns,
      decor,
      pipes,
      checkpoints,
      goalX: (SECTION_COLS * 2 + 106) * TILE,
    };
  }

  function create(hooks = {}) {
    const level = buildLevel();
    const state = {
      level,
      tiles: level.tiles,
      platforms: level.platforms,
      pipes: level.pipes,
      decor: level.decor,
      player: null,
      enemies: [],
      items: [],
      particles: [],
      words: [],
      bumps: [],
      camera: { x: 0, y: WORLD_H - VIEW_H },
      time: 0,
      section: 0,
      checkpoint: -1,
      btc: 100000,
      btcHistory: [],
      billsFailed: 0,
      banner: null,
      stamp: null,
      coinCount: 0,
      kills: 0,
      stompChain: 0,
      starChain: 0,
      freeze: 0,
      goal: null,
      finished: false,
      stopped: false,
      respawnX: 3 * TILE,
      nextId: 0,
      stats: { stomps: 0, starKills: 0, flights: 0, deflected: 0, powerups: 0 },
    };

    function tileAt(c, r) {
      if (c < 0 || c >= COLS) return "G";
      if (r < 0 || r >= ROWS) return ".";
      return state.tiles[r][c];
    }
    const isSolid = (c, r) => SOLID.has(tileAt(c, r));
    const tileAtPoint = (x, y) =>
      tileAt(Math.floor(x / TILE), Math.floor(y / TILE));

    function word(text, x, y, color = "#ffffff") {
      state.words.push({ text, x, y, life: 0.9, color });
    }
    function burst(x, y, color, count = 8, speed = 90) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        state.particles.push({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 80,
          life: 0.6,
          color,
          size: 2 + (i % 2),
        });
      }
    }
    // Every good thing in the level nudges the price; bills failing moon it.
    function pump(amount) {
      state.btc += amount;
    }
    function reward(coins, score, x, y, label) {
      if (coins) {
        state.coinCount += coins;
        pump(21 * coins);
        if (
          Math.floor((state.coinCount - coins) / 100) <
          Math.floor(state.coinCount / 100)
        ) {
          hooks.oneUp?.();
          word("1UP", x, y - 12, "#7cff7c");
        }
      }
      hooks.reward?.(coins, score);
      if (label) word(label, x, y);
    }
    function banner(text, duration = 5) {
      state.banner = { text, life: duration };
    }

    function makePlayer(x) {
      return {
        x,
        y: GROUND * TILE - 14,
        w: 12,
        h: 14,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: false,
        form: "small",
        pMeter: 0,
        pClock: 0,
        flying: 0,
        star: 0,
        invincible: 0,
        dead: 0,
        coyote: 0,
        jumpBuffer: 0,
        skid: false,
        step: 0,
        kick: 0,
        grow: 0,
        prevBottom: 0,
      };
    }

    function spawnEntities() {
      state.enemies = level.spawns.map((s) => {
        const winged = s.type === "winged";
        const type = winged ? "banker" : s.type;
        const def = ENEMY[type];
        return {
          id: state.nextId++,
          type,
          x: s.x,
          y: s.y,
          w: def.w,
          h: def.h,
          vx: -def.speed,
          vy: 0,
          wings: winged ? s.mode : null,
          baseY: s.y,
          phase: ((s.x % 97) / 97) * Math.PI * 2,
          alive: true,
          flat: 0,
          flip: false,
          onGround: false,
          active: false,
          timer: 0,
          rise: 0,
        };
      });
      state.items = [];
      state.bumps = [];
    }

    // Fresh map, enemies and a small hero at the last gate. Coins and score
    // already banked stay banked, like the classic games' checkpoint restarts.
    function respawn() {
      const fresh = buildLevel();
      state.tiles = fresh.tiles;
      state.player = makePlayer(state.respawnX);
      spawnEntities();
      state.player.invincible = 1.2;
      state.camera.x = clamp(state.player.x - 140, 0, WORLD_W - VIEW_W);
      state.camera.y = WORLD_H - VIEW_H;
      state.stompChain = 0;
      state.section = sectionAt(state.player.x);
    }

    function sectionAt(x) {
      return Math.min(
        SECTIONS.length - 1,
        Math.floor(x / (SECTION_COLS * TILE)),
      );
    }

    state.player = makePlayer(3 * TILE);
    spawnEntities();
    banner(SECTIONS[0].intro, 5);

    // --- Collision ---------------------------------------------------------
    // Moves a body along X then Y against tiles, clouds and semisolids.
    // Returns which sides it touched plus any head-bumped tile.
    function moveBody(b, dt, solidPlatforms = true) {
      const hit = { wall: 0, floor: false, ceil: null };
      b.x += b.vx * dt;
      const top = Math.floor(b.y / TILE);
      const bottom = Math.floor((b.y + b.h - 0.01) / TILE);
      if (b.vx > 0) {
        const c = Math.floor((b.x + b.w - 0.01) / TILE);
        for (let r = top; r <= bottom; r++)
          if (isSolid(c, r)) {
            b.x = c * TILE - b.w;
            hit.wall = 1;
            break;
          }
      } else if (b.vx < 0) {
        const c = Math.floor(b.x / TILE);
        for (let r = top; r <= bottom; r++)
          if (isSolid(c, r)) {
            b.x = (c + 1) * TILE;
            hit.wall = -1;
            break;
          }
      }
      const prevBottom = b.y + b.h;
      b.y += b.vy * dt;
      const left = Math.floor((b.x + 0.01) / TILE);
      const right = Math.floor((b.x + b.w - 0.01) / TILE);
      if (b.vy >= 0) {
        const r = Math.floor((b.y + b.h - 0.01) / TILE);
        for (let c = left; c <= right && !hit.floor; c++) {
          const t = tileAt(c, r);
          if (SOLID.has(t) || (t === "=" && prevBottom <= r * TILE + 0.5)) {
            b.y = r * TILE - b.h;
            hit.floor = true;
          }
        }
        if (solidPlatforms && !hit.floor) {
          for (const p of state.platforms) {
            if (
              b.x + b.w > p.x &&
              b.x < p.x + p.w &&
              prevBottom <= p.y + 0.5 &&
              b.y + b.h >= p.y
            ) {
              b.y = p.y - b.h;
              hit.floor = true;
              break;
            }
          }
        }
        if (hit.floor) b.vy = 0;
      } else {
        const r = Math.floor(b.y / TILE);
        let best = null;
        for (let c = left; c <= right; c++) {
          if (!isSolid(c, r)) continue;
          const d = Math.abs(c * TILE + TILE / 2 - (b.x + b.w / 2));
          if (!best || d < best.d) best = { c, r, d };
        }
        if (best) {
          b.y = (r + 1) * TILE;
          b.vy = 0;
          hit.ceil = best;
        }
      }
      b.onGround = hit.floor;
      return hit;
    }

    // True when something could stand at this point (used for ledge turns).
    function standable(x, y) {
      const t = tileAtPoint(x, y);
      if (SOLID.has(t) || t === "=") return true;
      return state.platforms.some(
        (p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + 4,
      );
    }

    // --- Blocks and items -----------------------------------------------------
    function bumpTile(c, r) {
      const t = tileAt(c, r);
      const p = state.player;
      if (!["?", "M", "S", "B"].includes(t)) {
        if (SOLID.has(t)) hooks.sfx?.("block");
        return;
      }
      state.bumps.push({ c, r, life: 0.18 });
      // Anything standing on a bumped block gets knocked off it.
      for (const e of state.enemies) {
        if (
          e.alive &&
          !e.flip &&
          e.x + e.w > c * TILE &&
          e.x < (c + 1) * TILE &&
          Math.abs(e.y + e.h - r * TILE) < 3
        )
          knockOut(e, p.facing, true);
      }
      if (t === "B") {
        if (p.form === "small") {
          hooks.sfx?.("block");
          return;
        }
        state.tiles[r][c] = ".";
        for (let i = 0; i < 4; i++) {
          state.particles.push({
            x: c * TILE + 4 + (i % 2) * 8,
            y: r * TILE + 4 + Math.floor(i / 2) * 8,
            vx: i % 2 ? 60 : -60,
            vy: i < 2 ? -300 : -200,
            life: 1.2,
            color: "brick",
            size: 6,
          });
        }
        reward(0, 50);
        hooks.sfx?.("blockhit");
        return;
      }
      state.tiles[r][c] = "U";
      const x = c * TILE;
      const y = r * TILE;
      if (t === "?") {
        state.items.push({
          kind: "popcoin",
          x: x + 3,
          y: y - 14,
          vy: -260,
          life: 0.5,
          w: 10,
          h: 14,
        });
        reward(1, 200, x, y - 20);
        hooks.sfx?.("coin");
        return;
      }
      const kind = t === "S" ? "star" : p.form === "small" ? "pill" : "hoodie";
      state.items.push({
        id: state.nextId++,
        kind,
        x: x + 1,
        y: y - 1,
        w: 14,
        h: 14,
        vx: 0,
        vy: 0,
        rise: 16,
        startY: y - 1,
        t: 0,
        onGround: false,
      });
      hooks.sfx?.("page");
    }

    function updateItems(dt) {
      const p = state.player;
      for (const item of state.items) {
        if (item.gone) continue;
        if (item.kind === "popcoin") {
          item.vy += 900 * dt;
          item.y += item.vy * dt;
          item.life -= dt;
          if (item.life <= 0) item.gone = true;
          continue;
        }
        item.t += dt;
        if (item.rise > 0) {
          const step = Math.min(item.rise, 24 * dt);
          item.rise -= step;
          item.y -= step;
          if (item.rise <= 0) {
            item.vx = item.kind === "hoodie" ? 0 : 60;
            item.vy =
              item.kind === "star" ? -250 : item.kind === "hoodie" ? -180 : 0;
          }
        } else if (item.kind === "hoodie") {
          // Drifts down side to side like SMB3's leaf.
          item.vy = Math.min(item.vy + 500 * dt, 40);
          item.x += Math.sin(item.t * 3.2) * 50 * dt;
          item.y += item.vy * dt;
        } else {
          item.vy = Math.min(item.vy + 900 * dt, PHYS.maxFall);
          const hit = moveBody(item, dt);
          if (hit.wall) item.vx = -item.vx || 60 * -hit.wall;
          if (hit.floor && item.kind === "star") item.vy = -260;
        }
        if (item.y > WORLD_H + 32) item.gone = true;
        if (item.rise <= 8 && overlap(item, p) && !p.dead) collect(item);
      }
      state.items = state.items.filter((item) => !item.gone);
    }

    function setForm(form) {
      const p = state.player;
      const tall = form !== "small";
      const newH = tall ? 25 : 14;
      p.y += p.h - newH;
      p.h = newH;
      p.form = form;
    }

    function collect(item) {
      const p = state.player;
      item.gone = true;
      state.stats.powerups += 1;
      if (item.kind === "star") {
        p.star = 10;
        state.starChain = 0;
        pump(2100);
        reward(0, 1000, item.x, item.y, "HODL STAR!");
        banner("STAR POWER! RUN THROUGH THE SUITS", 3);
        hooks.sfx?.("crowd");
        return;
      }
      if (item.kind === "pill") {
        if (p.form === "small") {
          setForm("big");
          p.grow = 0.6;
          state.freeze = 0.6;
        }
        reward(0, 1000, item.x, item.y, "ORANGE PILLED");
        hooks.sfx?.("page");
        return;
      }
      if (p.form !== "hoodie") {
        setForm("hoodie");
        p.grow = 0.6;
        state.freeze = 0.6;
      }
      reward(0, 1000, item.x, item.y, "NO BS HOODIE");
      banner("BS HOODIE: SHITCOINS BOUNCE OFF. RUN, THEN HOLD JUMP TO FLY", 5);
      hooks.sfx?.("page");
    }

    // --- Enemies -------------------------------------------------------------
    // Star hits, bumped blocks and kicked briefcases flip enemies upside down;
    // they fall off the bottom of the screen like the classics.
    function knockOut(e, dir, scored = true, chain = "stompChain") {
      if (!e.alive || e.flip) return;
      e.flip = true;
      e.vy = -240;
      e.vx = 70 * (dir || 1);
      state.kills += 1;
      pump(500);
      if (scored) {
        const n = state[chain]++;
        const score = COMBO[Math.min(n, COMBO.length - 1)];
        reward(
          0,
          score,
          e.x,
          e.y - 6,
          n >= COMBO.length ? "1UP" : String(score),
        );
        if (n >= COMBO.length) hooks.oneUp?.();
      }
      hooks.sfx?.("stomp");
    }

    function stomp(e) {
      const p = state.player;
      const n = state.stompChain++;
      const score = COMBO[Math.min(n, COMBO.length - 1)];
      state.stats.stomps += 1;
      p.vy = -(p.jumpHeld ? PHYS.stompHeld : PHYS.stomp);
      p.onGround = false;
      hooks.sfx?.("stomp");
      pump(210);
      if (e.wings) {
        e.wings = null;
        e.vy = 0;
        reward(0, score, e.x, e.y - 8, "GROUNDED");
        return;
      }
      if (e.type === "banker") {
        // The banker ducks into his briefcase, SMB shell style.
        const def = ENEMY.briefcase;
        e.type = "briefcase";
        e.y += e.h - def.h;
        e.w = def.w;
        e.h = def.h;
        e.vx = 0;
        e.timer = 0;
        state.kills += 1;
        reward(0, score, e.x, e.y - 8, ENEMY.banker.word);
        return;
      }
      if (e.type === "briefcase") {
        e.vx = 0;
        reward(0, score, e.x, e.y - 8);
        return;
      }
      if (e.type === "politician") {
        e.flat = 0.5;
        e.alive = false;
        state.kills += 1;
        reward(0, score, e.x, e.y - 8, ENEMY.politician.word);
        return;
      }
      // Stomped shitcoin tumbles away.
      knockOut(e, p.facing, false);
      reward(0, score, e.x, e.y - 8, ENEMY.shitcoin.word);
    }

    function kickBriefcase(e, dir) {
      e.vx = dir * ENEMY.briefcase.speed;
      e.timer = 0;
      state.player.kick = 0.2;
      state.player.invincible = Math.max(state.player.invincible, 0.15);
      reward(0, 400, e.x, e.y - 8, ENEMY.briefcase.word);
      hooks.sfx?.("blockhit");
    }

    function fireShitcoin(cannon) {
      const p = state.player;
      const dir = p.x < cannon.x ? -1 : 1;
      state.enemies.push({
        id: state.nextId++,
        type: "shitcoin",
        x: cannon.x + (dir > 0 ? TILE : -12),
        y: cannon.y + 2,
        w: 12,
        h: 12,
        vx: dir * ENEMY.shitcoin.speed,
        vy: 0,
        alive: true,
        flat: 0,
        flip: false,
        active: true,
        timer: 0,
        name: cannon.shots++ % 5,
      });
      hooks.sfx?.("shitshot");
    }

    // Cannons are map tiles; each keeps its own clock between shots.
    const cannons = new Map();
    function updateCannons(dt) {
      const p = state.player;
      const c0 = Math.floor(state.camera.x / TILE) - 1;
      const c1 = c0 + VIEW_W / TILE + 2;
      for (let c = c0; c <= c1; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (tileAt(c, r) !== "K" || tileAt(c, r - 1) === "K") continue;
          const key = `${c},${r}`;
          const cannon = cannons.get(key) || {
            x: c * TILE,
            y: r * TILE,
            clock: 1.2,
            shots: 0,
          };
          cannons.set(key, cannon);
          cannon.clock -= dt;
          const dx = Math.abs(p.x - cannon.x);
          if (cannon.clock <= 0 && dx > 40 && dx < VIEW_W * 0.6) {
            cannon.clock = 2.8;
            fireShitcoin(cannon);
          }
        }
      }
    }

    function updateEnemies(dt) {
      const p = state.player;
      const camL = state.camera.x - 48;
      const camR = state.camera.x + VIEW_W + 48;
      for (const e of state.enemies) {
        if (!e.active) {
          if (e.x < camR && e.x + e.w > camL) e.active = true;
          else continue;
        }
        if (e.flat > 0) {
          e.flat -= dt;
          continue;
        }
        if (!e.alive) continue;
        if (e.flip) {
          e.vy += PHYS.gravity * 0.6 * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.y > WORLD_H + 40) e.alive = false;
          continue;
        }
        e.timer += dt;
        if (e.type === "plant") {
          updatePlant(e, dt);
          continue;
        }
        if (e.type === "shitcoin") {
          e.x += e.vx * dt;
          if (e.x < camL - 64 || e.x > camR + 64) e.alive = false;
          continue;
        }
        if (e.wings === "fly") {
          e.y = e.baseY + Math.sin(state.time * 1.8 + e.phase) * 40;
          e.x += Math.sin(state.time * 0.9 + e.phase) * 20 * dt;
          e.vx = p.x < e.x ? -1 : 1; // only used for facing
          continue;
        }
        e.vy = Math.min(e.vy + PHYS.gravity * 0.7 * dt, PHYS.maxFall);
        const hit = moveBody(e, dt);
        if (hit.wall) {
          e.vx = -e.vx;
          if (e.type === "briefcase" && Math.abs(e.x - p.x) < VIEW_W)
            hooks.sfx?.("block");
        }
        if (e.type === "briefcase" && e.vx !== 0) {
          // A kicked briefcase bowls through everything in its path.
          for (const other of state.enemies) {
            if (
              other !== e &&
              other.alive &&
              !other.flip &&
              other.flat <= 0 &&
              overlap(e, other)
            )
              knockOut(other, Math.sign(e.vx), true, "starChain");
          }
        }
        if (e.wings === "hop" && hit.floor) e.vy = -300;
        // Bankers keep to their ledge; politicians march off it.
        if (e.type === "banker" && !e.wings && hit.floor) {
          const front = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
          if (!standable(front, e.y + e.h + 2)) e.vx = -e.vx;
        }
        if (e.y > WORLD_H + 20) e.alive = false;
      }
      state.enemies = state.enemies.filter(
        (e) => e.alive || e.flat > 0 || !e.active,
      );
    }

    // Red tape plants rise from their pipe unless the hero stands right beside it.
    function updatePlant(e, dt) {
      const p = state.player;
      const cycle = e.timer % 4.2;
      const near = Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < 28;
      let rise;
      if (cycle < 1.4) rise = 0;
      else if (cycle < 2) rise = (cycle - 1.4) / 0.6;
      else if (cycle < 3.6) rise = 1;
      else rise = 1 - (cycle - 3.6) / 0.6;
      if (near && e.rise === 0 && cycle < 1.5) e.timer -= dt; // wait while blocked
      e.rise = rise;
      e.y = e.baseY - rise * e.h;
    }

    function hurtPlayer() {
      const p = state.player;
      if (p.invincible > 0 || p.star > 0 || p.dead) return;
      if (p.form === "small") {
        die();
        return;
      }
      setForm(p.form === "hoodie" ? "big" : "small");
      p.flying = 0;
      p.invincible = 1.6;
      state.freeze = 0.4;
      hooks.sfx?.("hurt");
    }

    function die() {
      const p = state.player;
      if (p.dead) return;
      if (p.form !== "small") setForm("small");
      p.dead = 0.001;
      p.vx = 0;
      p.vy = 0;
      p.star = 0;
      p.flying = 0;
      hooks.sfx?.("hurt");
    }

    function touchEnemies() {
      const p = state.player;
      for (const e of state.enemies) {
        if (!e.alive || e.flip || e.flat > 0 || !e.active || !overlap(p, e))
          continue;
        if (e.type === "plant" && e.rise < 0.25) continue;
        if (p.star > 0) {
          knockOut(e, p.x < e.x ? 1 : -1, true, "starChain");
          state.stats.starKills += 1;
          continue;
        }
        const falling = p.vy > 0 && p.prevBottom <= e.y + 7;
        if (e.type === "briefcase" && e.vx === 0) {
          if (falling) {
            stomp(e);
            kickBriefcase(e, p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1);
            p.vy = -PHYS.stomp;
          } else if (p.kick <= 0)
            kickBriefcase(e, p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1);
          continue;
        }
        if (falling && e.type !== "plant") {
          stomp(e);
          continue;
        }
        if (e.type === "shitcoin" && p.form === "hoodie") {
          // The BS hoodie deflects bullshit coins.
          knockOut(e, p.x < e.x ? 1 : -1, false);
          state.stats.deflected += 1;
          word("BS BLOCKED", e.x, e.y - 8, "#ffb347");
          continue;
        }
        if (e.type === "briefcase" && p.kick > 0) continue;
        hurtPlayer();
      }
    }

    // --- Player ----------------------------------------------------------------
    function updatePlayer(dt, input) {
      const p = state.player;
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const run = !!input.fire;
      p.jumpHeld = !!input.jump;
      if (input.jumpPressed) p.jumpBuffer = 0.1;
      else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
      p.invincible = Math.max(0, p.invincible - dt);
      p.kick = Math.max(0, p.kick - dt);
      if (p.star > 0) p.star = Math.max(0, p.star - dt);

      // Horizontal speed: walk, run, then P-speed once the meter is full.
      const flying = p.flying > 0;
      const max = flying
        ? PHYS.run + 20
        : run
          ? p.pMeter >= P_FULL
            ? PHYS.pSpeed
            : PHYS.run
          : PHYS.walk;
      p.skid = false;
      if (dir) {
        if (p.onGround && p.vx * dir < -20) {
          p.vx += dir * PHYS.skid * dt;
          p.skid = true;
        } else if (p.vx * dir < max) {
          p.vx =
            Math.min(
              max,
              p.vx * dir + (p.onGround ? PHYS.accel : PHYS.airAccel) * dt,
            ) * dir;
        } else if (p.onGround) {
          p.vx = Math.max(max, p.vx * dir - PHYS.friction * dt) * dir;
        }
        if (p.onGround || flying) p.facing = dir;
      } else if (p.onGround) {
        p.vx =
          Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - PHYS.friction * dt);
      }

      // P-meter fills while sprinting on the ground and drains otherwise.
      p.pClock += dt;
      if (flying) {
        p.pMeter = P_FULL;
      } else if (p.onGround && run && dir && Math.abs(p.vx) >= PHYS.run - 6) {
        if (p.pClock > 0.12) {
          p.pMeter = Math.min(P_FULL, p.pMeter + 1);
          p.pClock = 0;
        }
      } else if (p.onGround && p.pClock > 0.22) {
        p.pMeter = Math.max(0, p.pMeter - 1);
        p.pClock = 0;
      }

      // Jumping, flying and the hoodie's slow fall.
      if (p.onGround) p.coyote = 0.08;
      else p.coyote = Math.max(0, p.coyote - dt);
      const hoodie = p.form === "hoodie";
      if (p.jumpBuffer > 0 && p.coyote > 0) {
        p.vy = -(PHYS.jump + Math.abs(p.vx) * PHYS.jumpPerSpeed);
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        if (hoodie && p.pMeter >= P_FULL) {
          p.flying = PHYS.flightTime;
          state.stats.flights += 1;
          hooks.sfx?.("crowd");
        } else hooks.sfx?.("jump");
      } else if (p.jumpBuffer > 0 && flying && !p.onGround) {
        p.vy = Math.min(p.vy, -PHYS.flap);
        p.jumpBuffer = 0;
        hooks.sfx?.("satshot");
      }
      if (flying) {
        p.flying = Math.max(0, p.flying - dt);
        if (p.flying === 0) p.pMeter = 0;
        if (input.jump && p.vy > -PHYS.flap)
          p.vy = Math.max(-PHYS.flap, p.vy - 1300 * dt);
      }
      const rising = p.vy < 0 && (input.jump || flying);
      p.vy = Math.min(
        PHYS.maxFall,
        p.vy + (rising ? PHYS.gravityHeld : PHYS.gravity) * dt,
      );
      if (hoodie && !flying && input.jump && p.vy > PHYS.floatFall)
        p.vy = PHYS.floatFall;

      p.prevBottom = p.y + p.h;
      const hit = moveBody(p, dt);
      if (hit.ceil) bumpTile(hit.ceil.c, hit.ceil.r);
      if (p.onGround) state.stompChain = 0;
      if (p.x < state.camera.x) p.x = state.camera.x;
      if (p.x > WORLD_W - p.w) p.x = WORLD_W - p.w;
      p.step += Math.abs(p.vx) * dt;

      // Sats sit in the map as tiles.
      const c0 = Math.floor(p.x / TILE);
      const c1 = Math.floor((p.x + p.w - 0.01) / TILE);
      const r0 = Math.floor(p.y / TILE);
      const r1 = Math.floor((p.y + p.h - 0.01) / TILE);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (tileAt(c, r) !== "o") continue;
          state.tiles[r][c] = ".";
          reward(1, 50);
          hooks.sfx?.("coin");
        }
      }
      if (p.y > WORLD_H) die();
    }

    function updateCamera(dt) {
      const p = state.player;
      const cam = state.camera;
      const targetX = clamp(
        p.x + p.w / 2 - VIEW_W * 0.4 + p.facing * 18,
        0,
        WORLD_W - VIEW_W,
      );
      cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
      const maxY = WORLD_H - VIEW_H;
      // Only scroll up for flying or high perches, like SMB3; ease back down.
      const wantY = clamp(p.y - 70, 0, maxY);
      if (wantY < cam.y && (p.flying > 0 || p.y - cam.y < 56))
        cam.y += (wantY - cam.y) * Math.min(1, dt * 5);
      else if (wantY > cam.y && (p.onGround || p.y - cam.y > VIEW_H * 0.55))
        cam.y += (wantY - cam.y) * Math.min(1, dt * 4);
    }

    function updateProgress() {
      const p = state.player;
      const section = sectionAt(p.x);
      if (section !== state.section) {
        state.section = section;
        banner(SECTIONS[section].intro, 5);
      }
      for (const cp of level.checkpoints) {
        if (cp.index > state.checkpoint && p.x + p.w >= cp.x) {
          state.checkpoint = cp.index;
          state.respawnX = cp.x + 8;
          failBill(cp.index);
          if (p.form === "small") setForm("big");
          hooks.checkpoint?.(cp.index, cp.name);
          hooks.sfx?.("checkpoint");
        }
      }
      if (!state.goal && p.x + p.w / 2 >= level.goalX) {
        const tapeY = goalTapeY();
        const topHit = p.y < tapeY + 4 && p.y + p.h > tapeY - 4;
        state.goal = { time: 0, bonus: topHit ? 5000 : 1000 };
        failBill(2);
        reward(
          0,
          state.goal.bonus,
          p.x,
          p.y - 20,
          topHit ? "5000 · GOAL TAPE!" : "GOAL",
        );
        // Everything on screen turns into sats, SMW style.
        for (const e of state.enemies) {
          if (
            e.alive &&
            e.active &&
            !e.flip &&
            e.x > state.camera.x - 16 &&
            e.x < state.camera.x + VIEW_W
          ) {
            e.alive = false;
            e.flat = 0;
            burst(e.x + 7, e.y + 7, "#ffb347", 6, 60);
            reward(1, 0);
          }
        }
        hooks.sfx?.("finish");
      }
    }

    function goalTapeY() {
      const top = (GROUND - 9) * TILE;
      const bottom = GROUND * TILE - 18;
      return top + (bottom - top) * (0.5 + 0.5 * Math.sin(state.time * 1.6));
    }

    function failBill(index) {
      if (index < state.billsFailed) return;
      state.billsFailed = index + 1;
      state.stamp = { bill: SECTIONS[index].bill, life: 2.5 };
      pump(12000);
      banner(`${SECTIONS[index].bill} FAILED. BTC HITS A NEW HIGH`, 4.5);
      hooks.bill?.(index);
    }

    function update(dt, input = {}) {
      if (state.stopped || state.finished) return;
      state.time += dt;
      const p = state.player;
      if (state.banner) {
        state.banner.life -= dt;
        if (state.banner.life <= 0) state.banner = null;
      }
      if (state.stamp) {
        state.stamp.life -= dt;
        if (state.stamp.life <= 0) state.stamp = null;
      }
      for (const w of state.words) {
        w.life -= dt;
        w.y -= 22 * dt;
      }
      state.words = state.words.filter((w) => w.life > 0);
      for (const b of state.bumps) b.life -= dt;
      state.bumps = state.bumps.filter((b) => b.life > 0);
      for (const q of state.particles) {
        q.vy += 900 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.life -= dt;
      }
      state.particles = state.particles.filter((q) => q.life > 0);
      pump(45 * dt);
      if (Math.floor(state.time * 4) !== state.btcHistory.length)
        state.btcHistory.push(state.btc);
      if (state.btcHistory.length > 400)
        state.btcHistory.splice(0, state.btcHistory.length - 400);

      if (p.dead) {
        p.dead += dt;
        if (p.dead > 0.5) {
          if (p.vy === 0 && p.dead < 0.55) p.vy = -330;
          p.vy += 900 * dt;
          p.y += p.vy * dt;
        }
        if (p.dead > 2.6) {
          if (hooks.death?.() === false) {
            state.stopped = true;
            return;
          }
          respawn();
        }
        return;
      }
      if (state.freeze > 0) {
        state.freeze = Math.max(0, state.freeze - dt);
        p.grow = Math.max(0, p.grow - dt);
        return;
      }
      if (state.goal) {
        // Walk off through the goal on autopilot.
        state.goal.time += dt;
        p.vx = PHYS.walk;
        p.facing = 1;
        p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
        p.prevBottom = p.y + p.h;
        moveBody(p, dt);
        p.step += Math.abs(p.vx) * dt;
        if (state.goal.time > 3.2) {
          state.finished = true;
          hooks.complete?.();
        }
        return;
      }
      updatePlayer(dt, input);
      updateCannons(dt);
      updateEnemies(dt);
      updateItems(dt);
      if (!p.dead) touchEnemies();
      updateCamera(dt);
      updateProgress();
    }

    // Serializable read-only snapshot for browser playtests and tests.
    function snapshot() {
      const p = state.player;
      return {
        x: Math.round(p.x),
        y: Math.round(p.y),
        form: p.form,
        pMeter: p.pMeter,
        flying: p.flying > 0,
        star: p.star > 0,
        dead: p.dead > 0,
        section: state.section,
        checkpoint: state.checkpoint,
        billsFailed: state.billsFailed,
        btc: Math.round(state.btc),
        coins: state.coinCount,
        kills: state.kills,
        finished: state.finished,
        enemiesAlive: state.enemies.filter((e) => e.alive && !e.flip).length,
      };
    }

    return { state, update, snapshot, tileAt, goalTapeY, respawn };
  }

  function overlap(a, b) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  return {
    create,
    buildLevel,
    TILE,
    VIEW_W,
    VIEW_H,
    ROWS,
    COLS,
    GROUND,
    SECTION_COLS,
    WORLD_W,
    WORLD_H,
    SECTIONS,
    ENEMY,
    PHYS,
    P_FULL,
  };
});
