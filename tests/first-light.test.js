const { test } = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../js/first-light.js");
const tick = (g, input = {}, n = 1) => {
  for (let i = 0; i < n; i++) g.update(1 / 120, input);
};
function place(g, x, z, y = sim.groundY(x, z)) {
  Object.assign(g.state.player, {
    x,
    z,
    y,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    yaw: 0,
  });
}
test("route, counts, checkpoint names and detached snapshots", () => {
  assert.equal(sim.routeS(20, -280), 300);
  assert.equal(sim.entities.coins.length, 49);
  assert.equal(sim.entities.pages.length, 9);
  assert.equal(sim.entities.enemies.length, 9);
  assert.equal(sim.entities.hazards.length, 7);
  const g = sim.create();
  g.snapshot().player.x = 40;
  assert.equal(g.state.player.x, 0);
});
test("visible building and workbench block; kerb steps up", () => {
  const g = sim.create();
  place(g, 6, -5);
  tick(g, { right: true }, 120);
  assert.ok(g.state.player.x < 6.78);
  place(g, 21, -90);
  tick(g, { right: true }, 120);
  assert.ok(g.state.player.x < 21.78);
  place(g, 3.5, -10);
  tick(g, { right: true }, 40);
  assert.equal(g.state.player.y, 0.2);
});
test("river has no bridge before genesis; death respawns at checkpoint with safety", () => {
  let deaths = 0;
  const g = sim.create({
    death: () => {
      deaths++;
      return true;
    },
  });
  g.state.checkpoint = 3;
  place(g, 20, -114, 0.2);
  tick(g, {}, 160);
  assert.equal(deaths, 1);
  assert.equal(g.state.player.z, -110);
  assert.ok(g.state.safety > 0);
  assert.ok(g.state.blocks.every((b) => !b.risen));
});
test("hill boundary walls contain jumps at their uphill ends", () => {
  for (const z of [-184.9, -194.9, -204.9, -229.9, -274.9]) {
    for (const west of [true, false]) {
      const g = sim.create();
      place(g, west ? 14.4 : 26, z);
      const input = west ? { left: true } : { right: true };
      tick(g, { ...input, jumpPressed: true });
      tick(g, input, 150);
      assert.ok(
        g.state.player.x > 13.4 && g.state.player.x < 27,
        `escaped ${west ? "west" : "east"} at ${z}: ${g.state.player.x}`,
      );
    }
  }
});
test("water still costs a life after a completed respawn", () => {
  let deaths = 0;
  const g = sim.create({
    death: () => {
      deaths++;
      return true;
    },
  });
  g.state.checkpoint = 3;
  for (let fall = 1; fall <= 2; fall++) {
    place(g, 20, -114, -1);
    tick(g, {}, 160);
    assert.equal(deaths, fall);
    assert.equal(g.state.player.z, -110);
    assert.equal(g.state.player.y, 0);
  }
});
test("stomp rewards while side hit costs a life", () => {
  let deaths = 0,
    reward = 0;
  const g = sim.create({
    death: () => {
      deaths++;
      return true;
    },
    reward: (n) => (reward += n),
  });
  const e = g.state.enemies[0];
  place(g, e.x, e.z, 1.05);
  g.state.player.vy = -3;
  g.state.player.grounded = false;
  tick(g, {}, 10);
  assert.equal(e.alive, false);
  assert.equal(deaths, 0);
  assert.equal(reward, 3);
  const h = sim.create({
    death: () => {
      deaths++;
      return true;
    },
  });
  place(h, h.state.enemies[0].x, h.state.enemies[0].z);
  tick(h);
  assert.equal(deaths, 1);
});
test("pickups count once", () => {
  let pages = 0,
    coins = 0;
  const g = sim.create({ page: () => pages++, reward: (n) => (coins += n) });
  const p = sim.entities.pages[0];
  place(g, p.x, p.z);
  tick(g, {}, 10);
  assert.equal(pages, 1);
  const c = sim.entities.coins[0];
  place(g, c.x, c.z);
  tick(g, {}, 10);
  const count = coins;
  tick(g, {}, 10);
  assert.equal(coins, count);
  assert.ok(count > 0);
});
test("all bridge gaps clear at walk speed, including upward steps", () => {
  for (let i = 0; i < 9; i++) {
    const g = sim.create();
    g.state.genesisMined = true;
    tick(g, {}, 500);
    const a = sim.entities.blocks[i],
      b = sim.entities.blocks[i + 1];
    place(g, a.x, a.z - 1.35, a.y);
    g.state.player.vz = -3.4;
    g.state.player.yaw = Math.atan2(-(b.x - a.x), -(b.z - (a.z - 1.35)));
    tick(g, { up: true, jumpPressed: true });
    tick(g, { up: true }, 120);
    assert.ok(
      g.state.player.y >= b.y - 0.01,
      `gap ${i}: ${JSON.stringify(g.state.player)}`,
    );
    assert.ok(g.state.player.grounded, `land ${i}`);
  }
});
// Input-only traversal. Positions are read for steering; never written after start.
test("complete route with walking inputs and ordered, once-only checkpoints", () => {
  const splits = [];
  let deaths = 0,
    complete = 0;
  const g = sim.create({
    checkpoint: (i) => splits.push(i),
    death: () => {
      deaths++;
      return false;
    },
    complete: () => complete++,
  });
  const waypoints = [
    { x: 0, z: -45 },
    { x: 20, z: -45 },
    { x: 20, z: -90 },
    { x: 21, z: -90 },
    { x: 20, z: -110 },
    ...sim.entities.blocks.map((b) => ({ x: b.x, z: b.z })),
    { x: 20, z: -160 },
    { x: sim.entities.plinth.x, z: sim.entities.plinth.z },
  ];
  let w = 0;
  for (let i = 0; i < 30000 && !g.state.complete && !deaths; i++) {
    const p = g.state.player,
      q = waypoints[w];
    if (Math.hypot(q.x - p.x, q.z - p.z) < 0.3 && w < waypoints.length - 1) w++;
    const t = waypoints[w],
      dx = t.x - p.x,
      dz = t.z - p.z,
      d = Math.hypot(dx, dz);
    p.yaw =
      w === 4 && !g.state.genesisMined ? -Math.PI / 2 : Math.atan2(-dx, -dz);
    const nx = p.x + (dx / d) * 0.6,
      nz = p.z + (dz / d) * 0.6;
    const ahead = sim.layout.filter(
      (b) =>
        (b.block === undefined || g.state.blocks[b.block].risen >= 1) &&
        nx > b.min[0] - 0.23 &&
        nx < b.max[0] + 0.23 &&
        nz > b.min[2] - 0.23 &&
        nz < b.max[2] + 0.23,
    );
    const step = ahead.some(
      (b) => b.max[1] > p.y + 0.31 && b.max[1] < p.y + 1.26,
    );
    const support = Math.max(
      sim.groundY(nx, nz),
      ...ahead.filter((b) => b.max[1] <= p.y + 0.31).map((b) => b.max[1]),
    );
    const gap = support < p.y - 0.7;
    g.update(1 / 60, {
      up: !(w === 4 && !g.state.genesisMined),
      jumpPressed: p.grounded && (step || gap),
      throwPressed: w === 4 && !g.state.genesisMined,
    });
  }
  assert.equal(deaths, 0, JSON.stringify(g.snapshot()));
  assert.equal(complete, 1, JSON.stringify(g.snapshot()));
  assert.deepEqual(splits, [1, 2, 3, 4, 5, 6]);
});

test("bench boost cannot carry the player beyond the west boundary", () => {
  const g = sim.create();
  place(g, 18, -228, 8);
  tick(g, { left: true, jumpPressed: true });
  tick(g, { left: true }, 90);
  tick(g, { left: true, jumpPressed: true });
  tick(g, { left: true }, 240);
  assert.ok(g.state.player.x >= 13.23);
});
test("river fence end cannot be rounded in midair", () => {
  let deaths = 0;
  const g = sim.create({
    death: () => {
      deaths++;
      return false;
    },
  });
  place(g, 27.6, -110.7, 0);
  tick(g, { forward: true, sprint: true, jumpPressed: true });
  tick(g, { forward: true, sprint: true }, 12);
  tick(g, { right: true, sprint: true }, 36);
  tick(g, { backward: true, sprint: true }, 50);
  assert.equal(deaths, 0);
  assert.ok(g.state.player.x <= 27.92);
});
