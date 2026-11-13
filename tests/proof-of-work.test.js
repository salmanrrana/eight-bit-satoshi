const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, targets } = require("../js/proof-of-work.js");
function face(game, t) {
  const p = game.state.player;
  Object.assign(p, { x: t.x + (t.x > 0 ? -0.8 : 0.8), z: t.z });
  p.yaw = t.x > 0 ? -Math.PI / 2 : Math.PI / 2;
}
test("walls and racks block movement while room connections stay open", () => {
  const g = create();
  for (let i = 0; i < 300; i++) g.update(1 / 60, { right: true });
  assert.ok(g.state.player.x < 1.3);
  assert.ok(g.blocked(-3, -6));
  assert.equal(g.blocked(0, 0), false);
});
test("interaction requires proximity and aim; all three banks unlock the door", () => {
  const g = create();
  assert.equal(g.interact(), false);
  assert.equal(g.blocked(0, -16), true);
  face(g, targets[0]);
  g.state.player.pitch = 1.3;
  assert.equal(g.target(), null);
  g.state.player.pitch = 0;
  for (const t of targets.slice(0, 3)) {
    face(g, t);
    g.interact();
  }
  assert.equal(g.state.stage, 3);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert.equal(g.blocked(0, -16), false);
  face(g, targets[0]);
  assert.equal(g.interact(), false);
});
test("lever, mining delay and coin complete once, with three splits", () => {
  let complete = 0,
    reward = 0;
  const splits = [];
  const g = create({
    checkpoint: (i) => splits.push(i),
    complete: () => complete++,
    reward: (n) => (reward += n),
  });
  face(g, targets[3]);
  assert.equal(g.interact(), false);
  for (const t of targets.slice(0, 3)) {
    face(g, t);
    g.interact();
  }
  face(g, targets[3]);
  assert.equal(g.interact(), true);
  face(g, targets[4]);
  assert.equal(g.interact(), false);
  for (let i = 0; i < 425; i++) g.update(1 / 60);
  assert.equal(g.interact(), true);
  for (let i = 0; i < 240; i++) g.update(1 / 60);
  assert.equal(complete, 1);
  const snapshot = g.snapshot();
  assert.equal(snapshot.leverPulled, true);
  assert.equal(snapshot.coinCollected, true);
  assert.equal(snapshot.coinTrayOpen, 1);
  assert.equal(snapshot.interactable, null);
  snapshot.player.x = 99;
  assert.notEqual(g.state.player.x, 99);
  assert.equal(reward, 1);
  assert.deepEqual(splits, [0, 1, 2]);
});
test("only the door aperture opens; glass, chair and desk stay solid", () => {
  const g = create();
  g.state.doorOpen = 1;
  assert.equal(g.blocked(0, -16), false);
  for (const x of [-1.4, 1.4]) assert.equal(g.blocked(x, -16), true);
  assert.equal(g.blocked(0.15, -18.65), true);
  assert.equal(g.blocked(-1, -19.1), true);
  assert.equal(g.blocked(-1, -19.05), false);
  assert.equal(g.blocked(-1.1, 4), true);
  assert.equal(g.blocked(1.2, 0.1), true);
  assert.equal(g.blocked(1.1, 5.7), true);
  Object.assign(g.state.player, { x: 1.4, z: -14.6 });
  for (let i = 0; i < 180; i++) g.update(1 / 60, { up: true });
  assert.ok(g.state.player.z > -15.75);
});
test("used switches never mask the coin and aim ranks active targets", () => {
  const g = create();
  g.state.stage = 3;
  g.state.leverPulled = true;
  g.state.mining = 6;
  g.state.coinTrayOpen = 1;
  Object.assign(g.state.player, { x: 0.4, z: -18.4, yaw: 0 });
  assert.equal(g.target()?.id, "coin");
  assert.equal(g.interact(), true);
  assert.equal(g.target(), null);
  g.state.breakers[0] = true;
  face(g, targets[0]);
  assert.equal(g.target(), null);
});
