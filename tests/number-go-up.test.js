const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  create,
  buildLevel,
  TILE,
  GROUND,
  ROWS,
  COLS,
  P_FULL,
  WORLD_H,
} = require("../js/number-go-up.js");

const step = (game, frames, input = {}) => {
  for (let i = 0; i < frames; i++) game.update(1 / 60, input);
};

// A lone enemy standing just right of the hero on open street.
function withEnemy(game, type, extra = {}) {
  const p = game.state.player;
  const h = { politician: 14, banker: 22, briefcase: 13, shitcoin: 12 }[type];
  const enemy = {
    id: 999,
    type,
    x: p.x + 40,
    y: GROUND * TILE - h,
    w: 14,
    h,
    vx: 0,
    vy: 0,
    alive: true,
    flat: 0,
    flip: false,
    active: true,
    timer: 0,
    rise: 0,
    ...extra,
  };
  game.state.enemies = [enemy];
  return enemy;
}

test("every street gap is jumpable and key spots stand on solid ground", () => {
  const { tiles, checkpoints, goalX } = buildLevel();
  let gap = 0;
  for (let c = 0; c < COLS; c++) {
    const solidBelow = tiles
      .slice(GROUND - 2, ROWS)
      .some((row) => row[c] === "G" || row[c] === "H");
    gap = solidBelow ? 0 : gap + 1;
    assert.ok(gap <= 5, `gap wider than 5 tiles ending at column ${c}`);
  }
  for (const x of [3 * TILE, ...checkpoints.map((cp) => cp.x), goalX]) {
    assert.equal(
      tiles[GROUND][Math.floor(x / TILE)],
      "G",
      `no ground at x=${x}`,
    );
  }
});

test("stomping a politician flattens it and bounces the hero", () => {
  const game = create();
  const p = game.state.player;
  const enemy = withEnemy(game, "politician");
  p.x = enemy.x;
  p.y = enemy.y - p.h - 2;
  p.vy = 200;
  p.onGround = false;
  game.update(1 / 60, {});
  assert.equal(enemy.alive, false);
  assert.ok(enemy.flat > 0);
  assert.ok(p.vy < 0);
  assert.equal(p.dead, 0);
});

test("a stomped banker becomes a briefcase that bowls over other suits", () => {
  const game = create();
  const p = game.state.player;
  const banker = withEnemy(game, "banker");
  const victim = {
    id: 1000,
    type: "politician",
    x: banker.x + 70,
    y: GROUND * TILE - 14,
    w: 14,
    h: 14,
    vx: 0,
    vy: 0,
    alive: true,
    flat: 0,
    flip: false,
    active: true,
    timer: 0,
  };
  game.state.enemies.push(victim);
  p.x = banker.x;
  p.y = banker.y - p.h - 2;
  p.vy = 200;
  game.update(1 / 60, {});
  assert.equal(banker.type, "briefcase");
  assert.equal(banker.vx, 0);
  step(game, 40);
  p.x = banker.x - p.w - 1;
  p.y = banker.y + banker.h - p.h;
  p.vy = 0;
  step(game, 2, { right: true });
  assert.ok(banker.vx > 0, "touching an idle briefcase kicks it");
  step(game, 60);
  assert.equal(victim.flip, true);
});

test("question blocks pay a sat; power blocks give the pill small and the hoodie big", () => {
  const game = create();
  const { tiles } = game.state;
  const p = game.state.player;
  const hit = (c) => {
    p.x = c * TILE + 2;
    p.y = 19 * TILE + TILE + 1;
    p.vy = -200;
    game.update(1 / 60, {});
  };
  const coins = game.state.coinCount;
  hit(10);
  assert.equal(tiles[19][10], "U");
  assert.equal(game.state.coinCount, coins + 1);
  hit(17);
  assert.equal(game.state.items.at(-1).kind, "pill");
  game.state.tiles[19][76] = "M";
  p.form = "big";
  p.h = 25;
  hit(76);
  assert.equal(game.state.items.at(-1).kind, "hoodie");
});

test("the BS hoodie blocks shitcoins and lets a full P-meter take off", () => {
  const game = create();
  const p = game.state.player;
  p.form = "hoodie";
  p.h = 25;
  p.y = GROUND * TILE - p.h;
  const coin = withEnemy(game, "shitcoin", { x: p.x + 4, y: p.y + 6, vx: -92 });
  game.update(1 / 60, {});
  assert.equal(coin.flip, true);
  assert.equal(p.form, "hoodie");
  assert.equal(game.state.stats.deflected, 1);

  game.state.enemies = [];
  p.pMeter = P_FULL;
  p.vx = 184;
  p.onGround = true;
  game.update(1 / 60, {
    right: true,
    fire: true,
    jump: true,
    jumpPressed: true,
  });
  assert.ok(p.flying > 0);
  step(game, 60, { right: true, fire: true, jump: true });
  assert.ok(p.y < 12 * TILE, "holding jump keeps climbing while flying");
});

test("without the hoodie a shitcoin costs a small hero a life", () => {
  let deaths = 0;
  const game = create({
    death: () => {
      deaths += 1;
      return true;
    },
  });
  const p = game.state.player;
  withEnemy(game, "shitcoin", { x: p.x + 4, y: p.y + 2, vx: -92 });
  game.update(1 / 60, {});
  assert.ok(p.dead > 0);
  step(game, 170);
  assert.equal(deaths, 1);
  assert.equal(game.state.player.dead, 0, "respawned");
});

test("star power knocks suits upside down and off the bottom of the screen", () => {
  const game = create();
  const p = game.state.player;
  const enemy = withEnemy(game, "banker");
  p.star = 5;
  p.x = enemy.x - 4;
  p.y = GROUND * TILE - p.h;
  game.update(1 / 60, {});
  assert.equal(enemy.flip, true);
  step(game, 120);
  assert.ok(enemy.y > WORLD_H || !enemy.alive);
  assert.equal(p.dead, 0);
});

test("each checkpoint and the goal fail a bill, pump the price, and finish the run", () => {
  const bills = [];
  const splits = [];
  let done = false;
  const game = create({
    bill: (i) => bills.push(i),
    checkpoint: (i) => splits.push(i),
    complete: () => {
      done = true;
    },
  });
  const { checkpoints, goalX } = game.state.level;
  const p = game.state.player;
  const start = game.state.btc;
  for (const cp of checkpoints) {
    game.state.enemies = [];
    p.x = cp.x;
    p.y = GROUND * TILE - p.h;
    game.update(1 / 60, {});
  }
  assert.deepEqual(splits, [0, 1]);
  assert.ok(game.state.btc > start + 20000);
  game.state.enemies = [];
  p.x = goalX;
  p.y = GROUND * TILE - p.h;
  step(game, 60 * 4);
  assert.deepEqual(bills, [0, 1, 2]);
  assert.equal(done, true);
});
