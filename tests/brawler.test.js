const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, STAGE_WIDTH, STAGES, CHARACTERS } = require("../js/brawler.js");
const rules = require("../js/leaderboard-rules.js");

const step = (game, frames, input = {}) => {
  for (let i = 0; i < frames; i++) game.update(1 / 60, input);
};

test("punches require the correct facing and lane; holding punch chains hits", () => {
  const game = create();
  const p = game.state.player;
  const [target] = game.state.enemies;
  target.x = p.x + 48;
  target.y = p.y + 50;
  game.update(1 / 60, { fire: true });
  assert.equal(target.hp, target.maxHp);
  step(game, 30);
  target.y = p.y;
  p.facing = -1;
  game.update(1 / 60, { fire: true });
  assert.equal(target.hp, target.maxHp);
  step(game, 30);
  p.facing = 1;
  target.x = p.x + 45;
  game.update(1 / 60, { fire: true });
  assert.ok(target.hp < target.maxHp);
  assert.equal(game.state.combo, 1);
  step(game, 180, { fire: true });
  assert.ok(game.state.bestCombo > 1);
});

test("jump clears enemy hits and special requires a full charge", () => {
  const game = create();
  const p = game.state.player;
  const target = game.state.enemies[0];
  target.x = p.x + 40;
  target.y = p.y;
  target.wind = 0.2;
  target.attackFacing = -1;
  p.invincible = 0;
  game.update(1 / 60, { jumpPressed: true });
  step(game, 15);
  assert.ok(p.z > 20);
  assert.equal(p.hp, p.maxHp);
  const before = target.hp;
  game.update(1 / 60, { special: true });
  assert.equal(target.hp, before);
  game.update(1 / 60, {});
  game.state.special = 100;
  game.update(1 / 60, { special: true });
  assert.ok(target.hp < before);
  assert.equal(game.state.special, 0);
});

test("zero health costs exactly one life, respawns, and stops on the last life", () => {
  let deaths = 0;
  const game = create({ death: () => ++deaths < 2 });
  const p = game.state.player;
  const enemy = game.state.enemies[0];
  function lethalHit() {
    p.hp = 1;
    p.invincible = 0;
    enemy.x = p.x + 30;
    enemy.y = p.y;
    enemy.wind = 0.01;
    enemy.attackFacing = -1;
    step(game, 65);
  }
  lethalHit();
  assert.equal(deaths, 1);
  assert.equal(p.hp, p.maxHp);
  assert.ok(p.invincible > 0);
  lethalHit();
  assert.equal(deaths, 2);
  assert.equal(game.state.stopped, true);
  step(game, 120);
  assert.equal(deaths, 2);
});

for (const characterId of Object.keys(CHARACTERS)) test(`${characterId} can clear all eight districts using only inputs`, () => {
  const checkpoints = [];
  let completions = 0;
  let deaths = 0;
  let sats = 0;
  const game = create({
    checkpoint: (index) => checkpoints.push(index),
    complete: () => completions++,
    death: () => ++deaths < 3,
    reward: (amount) => { sats += amount; }
  }, characterId);
  // A simple input driver: line up in the enemy's lane, face them, and punch.
  // It does not change position, health, enemies, charge, or progression.
  for (let frame = 0; frame < 60 * 480 && !game.state.finished && !game.state.stopped; frame++) {
    const p = game.state.player;
    const enemy = game.state.enemies.filter((e) => e.hp > 0).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const controls = { fire: true, special: game.state.special === 100, throw: frame % 42 === 0, jumpPressed: frame % 45 === 0 };
    if (enemy) {
      const dx = enemy.x - p.x;
      controls.right = dx > 48 || (dx > 0 && p.facing < 0);
      controls.left = dx < -48 || (dx < 0 && p.facing > 0);
      controls.up = enemy.y < p.y - 6;
      controls.down = enemy.y > p.y + 6;
    } else controls.right = true;
    game.update(1 / 60, controls);
    assert.ok(game.state.camera >= game.state.stage * STAGE_WIDTH, "new districts must begin inside their own scenery");
  }
  assert.equal(game.state.finished, true, JSON.stringify({ stage: game.state.stage, hp: game.state.player.hp, deaths, remaining: game.state.enemies.filter((e) => e.hp > 0) }));
  assert.deepEqual(checkpoints, STAGES.map((_, index) => index));
  assert.equal(completions, 1);
  assert.ok(deaths < 3);
  assert.ok(sats > 0);
  assert.equal(game.state.kills, STAGES.reduce((sum, stage) => sum + stage.waves.reduce((count, wave) => count + wave.length, 0), 0));
  step(game, 60, { right: true });
  assert.equal(completions, 1);
  assert.ok(game.state.player.x < STAGE_WIDTH * STAGES.length);
});

test("Level 6 can be submitted to the existing local leaderboard", () => {
  assert.equal(rules.SUBMITTABLE_LEVELS["for-the-people"], "FOR THE PEOPLE");
});

test("grab a chair, carry it, and throw it through two NPCs without repeat hits", () => {
  const game = create();
  const p = game.state.player;
  const chair = game.state.items[0];
  chair.kind = "chair";
  chair.x = p.x + 15;
  chair.y = p.y;
  game.update(1 / 60, { throw: true });
  assert.equal(p.held.kind, "chair");
  assert.equal(chair.taken, true);
  assert.equal(game.state.pickups, 1);
  step(game, 20, { throw: true });
  assert.equal(game.state.throws, 0, "holding the key must not immediately throw the pickup");
  step(game, 1);
  const targets = game.state.enemies.slice(0, 2);
  for (const [index, enemy] of targets.entries()) {
    enemy.x = p.x + 95 + index * 65;
    enemy.y = p.y;
    enemy.speed = 0;
    enemy.cooldown = 10;
    enemy.throwCooldown = 10;
  }
  game.update(1 / 60, { throw: true });
  assert.equal(p.held, null);
  assert.equal(game.state.projectiles[0].kind, "chair");
  step(game, 60);
  assert.equal(game.state.throws, 1);
  assert.equal(game.state.projectileHits, 2);
  assert.equal(targets[0].hp, 0);
  assert.equal(targets[1].hp, targets[1].maxHp - 46);
});

test("a throw misses another lane and is cleaned up after landing", () => {
  const game = create();
  const p = game.state.player;
  const target = game.state.enemies[0];
  target.x = p.x + 150;
  target.y = p.y - 45;
  target.speed = 0;
  target.cooldown = 10;
  target.throwCooldown = 10;
  game.state.items.forEach((item) => { item.taken = true; });
  game.update(1 / 60, { throw: true });
  step(game, 180);
  assert.equal(target.hp, target.maxHp);
  assert.equal(game.state.projectiles.length, 0);
});

test("enemy throws have a tell, lock their aim, and can damage the player", () => {
  const game = create();
  const p = game.state.player;
  p.invincible = 0;
  const target = game.state.enemies[0];
  target.kind = "heavy";
  target.x = p.x + 210;
  target.y = p.y;
  target.speed = 0;
  target.throwCooldown = 0;
  game.state.items.forEach((item) => { item.taken = true; });
  game.state.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
  game.update(1 / 60, {});
  assert.ok(target.throwWind > 0);
  assert.equal(game.state.projectiles.length, 0);
  step(game, 100);
  assert.equal(game.state.enemyThrows, 1);
  assert.ok(p.hp < p.maxHp);
});

test("side-stepping an enemy chair leaves it available to pick up", () => {
  const game = create();
  const p = game.state.player;
  const target = game.state.enemies[0];
  target.kind = "heavy";
  target.x = p.x + 390;
  target.y = p.y;
  target.speed = 0;
  target.throwCooldown = 0;
  game.state.items.forEach((item) => { item.taken = true; });
  game.state.enemies.slice(1).forEach((enemy) => { enemy.hp = 0; });
  game.update(1 / 60, {});
  const targetLane = target.throwTargetY;
  step(game, 45, { up: true });
  assert.equal(target.throwTargetY, targetLane);
  step(game, 100);
  const landedChair = game.state.items.find((item) => !item.taken && item.kind === "chair");
  assert.ok(landedChair);
  assert.equal(p.hp, p.maxHp);
  p.x = landedChair.x;
  p.y = landedChair.y;
  game.update(1 / 60, { throw: true });
  assert.equal(p.held.kind, "chair");
});

test("each fighter has a different signature throw and special behavior", () => {
  for (const id of Object.keys(CHARACTERS)) {
    const game = create({}, id);
    const p = game.state.player;
    game.state.items.forEach((item) => { item.taken = true; });
    game.update(1 / 60, { throw: true });
    assert.equal(game.state.projectiles[0].kind, CHARACTERS[id].projectile);
    step(game, 1);
    game.state.projectiles = [];
    game.state.special = 100;
    p.hp = p.maxHp - 40;
    const target = game.state.enemies[0];
    target.x = p.x + 100;
    target.y = p.y;
    game.update(1 / 60, { special: true });
    if (id === "coder") {
      assert.equal(p.hp, p.maxHp - 5);
      assert.ok(target.stun > 2);
    } else if (id === "jack") assert.equal(target.hp, 0);
    else assert.equal(game.state.projectiles.length, 8);
    assert.equal(game.state.special, 0);
  }
});

test("quick throw and jump taps during hitstop are buffered exactly once", () => {
  const game = create();
  game.state.items.forEach((item) => { item.taken = true; });
  game.state.hitstop = 0.08;
  game.update(1 / 60, { throwPressed: true, throw: false, jumpPressed: true });
  assert.equal(game.state.throws, 0);
  assert.equal(game.state.player.z, 0);
  step(game, 12);
  assert.equal(game.state.throws, 1);
  assert.ok(game.state.player.z > 0);
  step(game, 90);
  assert.equal(game.state.throws, 1);
  assert.equal(game.state.player.z, 0, "a buffered tap must not auto-jump again after landing");
});

test("a lethal projectile at a cleared gate resolves the life before advancing", () => {
  for (const [stage, wave] of [[0, 0], [STAGES.length - 1, 1]]) {
    let deaths = 0;
    let completions = 0;
    const game = create({ death: () => { deaths++; return false; }, complete: () => completions++ });
    const s = game.state, p = s.player;
    s.stage = stage;
    s.wave = wave;
    s.waveClear = true;
    s.stageClear = wave === 1;
    s.enemies.forEach((enemy) => { enemy.hp = 0; });
    const gate = stage * STAGE_WIDTH + (wave + 1) * STAGE_WIDTH / 2;
    p.x = gate - 45;
    p.hp = 1;
    p.invincible = 0;
    s.projectiles.push({ id: 999, kind: "paper", owner: "enemy", x: p.x - 20, y: p.y,
      z: 43, vx: 220, vy: 0, vz: 0, gravity: 70, age: 0, alive: true,
      hit: [], remaining: 1, damage: 10 });
    game.update(1 / 60, {});
    assert.ok(p.x >= gate - 40, "the lethal knockback crossed the exit threshold");
    assert.ok(s.deathTime > 0);
    assert.equal(s.stage, stage);
    assert.equal(s.wave, wave);
    assert.equal(s.finished, false);
    step(game, 65);
    assert.equal(deaths, 1);
    assert.equal(completions, 0);
    assert.equal(s.stopped, true);
  }
});
