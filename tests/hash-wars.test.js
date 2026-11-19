const { test } = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../js/hash-wars.js");
const tick = (g, input = {}, n = 1) => {
  for (let i = 0; i < n; i++) g.update(1 / 120, input);
};
const place = (g, x, z, y = sim.groundY(x, z)) =>
  Object.assign(g.state.player, {
    x,
    z,
    y,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    yaw: 0,
    pitch: 0,
  });
const aim = (p, e) => ({
  yaw: Math.atan2(p.x - e.x, p.z - e.z),
  pitch: Math.atan2(e.y - p.y - 1.68, Math.hypot(e.x - p.x, e.z - p.z)),
});
// Input-only route driver, also usable by browser tooling. No state mutations.
const kioskExits = new WeakMap();
function drive(g) {
  const s = g.state,
    p = s.player;
  let q = sim.entities.beacon;
  const si = s.stations.findIndex((a) => a.state !== "keeper");
  if (si >= 0) q = sim.entities.stations[si];
  if (q.z < p.z - 8) q = { ...sim.at(Math.min(-p.z + 6, -q.z)), y: p.y };
  // A relit kiosk is U-shaped: leave through its front, then take the east
  // aisle. A diagonal toward the next station cuts through its side wall.
  if (!kioskExits.has(g)) {
    const e = sim.entities.stations.find(
      (e) =>
        s.stations[e.index].state === "keeper" &&
        Math.abs(p.x - e.x) < 1.9 &&
        p.z > e.z - 1.5 &&
        p.z < e.z + 0.8,
    );
    if (e)
      kioskExits.set(g, [
        { x: p.x, z: e.z + 1.5 },
        { x: e.x + 2.5, z: e.z + 1.5 },
        { x: e.x + 2.5, z: e.z - 2 },
      ]);
  }
  const exit = kioskExits.get(g);
  while (exit?.length && Math.hypot(p.x - exit[0].x, p.z - exit[0].z) < 0.25)
    exit.shift();
  if (exit && !exit.length) kioskExits.delete(g);
  const leaving = !!exit?.length;
  if (leaving) q = exit[0];
  let look = aim(p, { ...q, y: p.y + 1.68 }),
    fire = false;
  const enemies = s.enemies
    .filter((e) => e.hp > 0 && e.zone === s.zone)
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    );
  for (const e of enemies) {
    const a = aim(p, {
      ...e,
      y: e.y + sim.MACHINES[e.kind].centre + sim.MACHINES[e.kind].height * 0.22,
    });
    const d = [
      -Math.sin(a.yaw) * Math.cos(a.pitch),
      Math.sin(a.pitch),
      -Math.cos(a.yaw) * Math.cos(a.pitch),
    ];
    if (g.trace([p.x, p.y + 1.68, p.z], d).enemy === e) {
      look = a;
      fire = true;
      break;
    }
  }
  if (!fire && s.zone === 4 && s.boss.alive) {
    const i = s.boss.clamps.findIndex((c) => c.alive);
    const a = aim(p, sim.entities.clamps[i]);
    const d = [
      -Math.sin(a.yaw) * Math.cos(a.pitch),
      Math.sin(a.pitch),
      -Math.cos(a.yaw) * Math.cos(a.pitch),
    ];
    if (g.trace([p.x, p.y + 1.68, p.z], d).clamp === i) {
      look = a;
      fire = true;
    }
  }
  // Search for surviving guards when the pylon is still contested. Varied
  // encounters can leave a machine out of sight off the main route.
  if (
    !fire &&
    si >= 0 &&
    Math.hypot(
      p.x - sim.entities.stations[si].x,
      p.z - sim.entities.stations[si].z,
    ) < 8 &&
    enemies.length
  )
    q = enemies[0];
  // Racks and footings occupy the centre line; kiosks have a solid back wall.
  // this remains ordinary movement input, with no collision/state bypass.
  const obstacle =
    !fire &&
    !leaving &&
    sim.layout.find(
      (b) =>
        (b.owner === "story" ||
          b.kind === "station-footing" ||
          b.stationAssembly?.node === "control_kiosk") &&
        b.max[1] > p.y + 0.35 &&
        b.min[1] < p.y + 1.75 &&
        p.z > b.min[2] - 1 &&
        p.z < b.max[2] + 4 &&
        p.x > b.min[0] - 1 &&
        p.x < b.max[0] + 1,
    );
  if (obstacle && q.z < p.z) {
    q = {
      x:
        obstacle.stationAssembly?.node === "control_kiosk"
          ? obstacle.max[0] + 0.8
          : obstacle.min[0] - 0.8,
      z: obstacle.min[2] - 1.2,
    };
    look = aim(p, { ...q, y: p.y + 1.68 });
  }
  const dx = q.x - p.x,
    dz = q.z - p.z,
    d = Math.hypot(dx, dz),
    moving = d > (obstacle || leaving ? 0.2 : 2) && !fire;
  const wx = moving ? dx / d : 0,
    wz = moving ? dz / d : 0;
  return {
    ...look,
    moveX: wx * Math.cos(look.yaw) - wz * Math.sin(look.yaw),
    moveZ: wx * Math.sin(look.yaw) + wz * Math.cos(look.yaw),
    fire,
    aim: true,
    use:
      !!g.target() &&
      (g.target().type !== "weapon" ||
        (s.weapons.length < 2 && g.target().kind === "arc")),
    swap:
      s.weapon.kind !== "carbine" &&
      s.weapons.some((w) => w.kind === "carbine"),
  };
}
module.exports = { drive };
test("route height, solids, terrain and nearest actor stop movement and shots", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  place(g, -6, -26);
  tick(g, { moveZ: -1 }, 180);
  assert.ok(g.state.player.z > -29.1);
  assert.equal(
    g.trace([-6, sim.groundY(-6, -30) + 0.8, -26], [0, 0, -1]).hit,
    "rock",
  );
  assert.equal(g.trace([0, 10, 0], [0, -1, 0]).hit, "sand");
  place(g, 0, 0);
  const a = g.spawn("gnat", 0, -4),
    b = g.spawn("gnat", 0, -8);
  assert.equal(g.trace([0, 2.5, 0], [0, 0, -1]).enemy, a);
  assert.equal(b.hp, 36);
  assert.equal(sim.groundY(0, -430), 60);
});
test("carbine and scatter shots hit the sea, river and plunge pool at the surface", () => {
  for (const [x, z, weapon] of [
    [0, 20, "carbine"],
    [22, -88, "scatter"],
    [18, -212, "carbine"],
  ]) {
    const g = sim.create();
    g.state.quiet = true;
    place(g, x, z, sim.waterY(x, z) + 1.1);
    if (weapon === "scatter") {
      g.give(weapon);
      g.state.weapon.raise = 0;
    }
    tick(g, { fire: true, pitch: -1.4 });
    const shots = g.state.events.filter((e) => e.type === "shot");
    assert.equal(shots.length, sim.WEAPONS[weapon].pellets);
    for (const shot of shots) {
      const [sx, sy, sz] = shot.to;
      assert.equal(shot.hit, "water");
      assert.equal(shot.index, -1);
      assert.equal(sy, sim.waterY(sx, sz));
      assert.deepEqual(shot.normal, [0, 1, 0]);
    }
  }
});
test("a dam collider above the plunge pool takes the shot before the water", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, 8.9, -166, 2.5);
  tick(g, { fire: true, pitch: -1.4 });
  const shot = g.state.events.find((e) => e.type === "shot");
  const solid = sim.layout[shot.index];
  assert.equal(shot.hit, "concrete");
  assert.equal(solid.stationAssembly.node, "dam_sluice");
  assert.equal(shot.to[1], solid.max[1]);
  assert.equal(sim.waterY(shot.to[0], shot.to[2]), sim.waterfall.foot.y);
});
test("beach and the dry river bank report different ground surfaces", () => {
  assert.equal(sim.waterY(19.8, -88), -Infinity);
  assert.ok(Number.isFinite(sim.waterY(20.05, -88)));
  for (const [x, z, hit] of [
    [0, 0, "sand"],
    [19.8, -88, "grass"],
  ]) {
    const g = sim.create();
    g.state.quiet = true;
    place(g, x, z);
    tick(g, { fire: true, yaw: Math.PI / 2, pitch: -1.4 });
    const shot = g.state.events.find((e) => e.type === "shot");
    assert.equal(shot.hit, hit);
    assert.equal(shot.index, -1);
    const [sx, sy, sz] = shot.to;
    assert.ok(Math.abs(sy - sim.groundY(sx, sz)) < 0.001);
  }

  const g = sim.create();
  g.state.quiet = true;
  tick(g, { fire: true, pitch: 1.4 });
  const miss = g.state.events.find((e) => e.type === "shot");
  assert.equal(miss.hit, null);
  assert.equal(miss.index, -1);
});
test("enemy line of sight remains clear across the river", () => {
  const g = sim.create();
  g.setZone(1);
  g.state.enemies.forEach((e) => (e.hp = 0));
  place(g, 24, -104);
  const turret = g.spawn("turret", 16.5, -84);
  const delta = [
    24 - turret.x,
    g.state.player.y + 1.2 - (turret.y + sim.MACHINES.turret.muzzle[1]),
    -104 - turret.z,
  ];
  turret.yaw = Math.atan2(delta[0], delta[2]);
  const distance = Math.hypot(...delta);
  const origin = [turret.x, turret.y + sim.MACHINES.turret.muzzle[1], turret.z];
  const direction = delta.map((v) => v / distance);
  assert.equal(
    g.trace(origin, direction, distance, false, null, true).hit,
    "water",
  );
  tick(g);
  assert.equal(turret.visible, true);
});
test("rail penetration ends at water after hitting the first enemy", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  place(g, 0, 24, 0);
  const pitch = -0.2;
  const [first, submerged] = [29, 41].map((z) => {
    const y = 1.68 + Math.tan(pitch) * (z - 24) - sim.MACHINES.gnat.centre;
    const e = g.spawn("gnat", 0, z, y);
    e.thinkAt = Infinity;
    return e;
  });
  g.give("rail");
  Object.assign(g.state.weapon, { raise: 0, charging: 0.999 });
  tick(g, { fire: true, yaw: Math.PI, pitch });
  const shot = g.state.events.find((e) => e.type === "shot");
  assert.equal(shot.hit, "enemy");
  assert.equal(shot.enemy, first.id);
  assert.equal(shot.index, -1);
  assert.equal(first.hp, 0);
  assert.equal(submerged.hp, sim.MACHINES.gnat.hp);
});
test("station traces distinguish exposed stone, concrete and metal", () => {
  const g = sim.create();
  for (const [node, surface, offset, direction] of [
    ["terrace_wall", "stone", [0, 1.8, -4], [0, 0, 1]],
    ["causeway_pier", "concrete", [2.9, 20, 2], [0, 0, -1]],
    ["control_kiosk", "metal", [1, 1.4, 1], [0, 0, -1]],
    ["immersion_tank", "metal", [0, 1.1, 4], [0, 0, -1]],
  ]) {
    const { stationPart } = sim.layout.find(
      (b) => b.stationPart?.node === node,
    );
    const origin = [stationPart.x, stationPart.y, stationPart.z].map(
      (v, i) => v + offset[i],
    );
    const hit = g.trace(origin, direction, 9, false);
    assert.equal(hit.hit, surface, node);
    assert.equal(sim.layout[hit.index]?.stationAssembly?.node, node);
  }
});
test("shield multipliers, rail penetration, and hull weak points", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  const a = g.spawn("strider", 0, -5),
    b = g.spawn("strider", 0, -9);
  a.thinkAt = b.thinkAt = Infinity; // Stationary penetration fixture.
  const input = {
    ...aim(g.state.player, { ...a, y: a.y + 1.35 }),
    fire: true,
    aim: true,
  };
  tick(g, input);
  assert.equal(a.shield, 51);
  assert.equal(a.hp, 110);
  assert.equal(b.shield, 60);
  g.give("rail");
  Object.assign(g.state.weapon, { raise: 0, cooldown: 0, charging: 0.999 });
  tick(g, input);
  assert.ok(a.hp < 110);
  assert.ok(b.hp < 110);
});
test("arc heat forces vent, battery drains and bolts damage shields", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  const a = g.spawn("strider", 0, -6);
  g.give("arc");
  tick(g, {}, 45);
  tick(g, { fire: true, ...aim(g.state.player, { ...a, y: 1.35 }) }, 155);
  assert.ok(g.state.weapon.venting);
  assert.ok(g.state.weapons[1].battery < 90);
  assert.ok(a.shield < 60);
  tick(g, {}, 300);
  assert.equal(g.state.weapon.venting, false);
});
test("two weapons, swapping, hold pickup/drop and automatic ammo", () => {
  const pickedUp = [];
  const g = sim.create({
    sfx: (type, _, detail) => {
      if (type === "pickup-weapon") pickedUp.push(detail.weapon);
    },
  });
  g.state.quiet = true;
  g.give("rail");
  g.give("scatter");
  assert.equal(g.state.weapons.length, 2);
  tick(g, { swap: true });
  assert.equal(g.state.weapon.kind, "carbine");
  g.state.pickups.push({ id: 999, kind: "arc", x: 0, y: 0, z: -1 });
  tick(g, { use: true }, 360);
  assert.equal(g.state.weapon.kind, "arc");
  assert.deepEqual(pickedUp, ["arc"]);
  assert.equal(g.state.weapons.length, 2);
  assert.ok(g.state.pickups.some((e) => e.kind === "carbine"));
  tick(g);
  tick(g, { use: true }, 90);
  assert.equal(
    g.state.weapon.kind,
    "arc",
    "dropping a gun requires backing away first",
  );
  tick(g, { moveZ: 1 }, 63);
  tick(g, { use: true }, 90);
  assert.equal(
    g.state.weapon.kind,
    "carbine",
    "the dropped gun can be picked up again",
  );
  g.state.weapons[1].spare = 0;
  const { x, y, z } = g.state.player;
  g.state.pickups.push({ id: 998, kind: "ammo", x, y, z });
  tick(g);
  assert.ok(g.state.weapons[1].spare > 0);
});
test("charges bounce, burst once and bolts stop at cover", () => {
  const g = sim.create();
  g.state.quiet = true;
  tick(g, { charge: true });
  tick(g, {}, 220);
  assert.equal(g.state.charges, 3);
  assert.equal(g.state.bolts.length, 0);
  place(g, -6, -32);
  g.state.bolts.push({
    id: 99,
    kind: "strider",
    from: "enemy",
    x: -6,
    y: sim.groundY(-6, -30) + 0.8,
    z: -26,
    vx: 0,
    vy: 0,
    vz: -10,
    age: 0,
  });
  tick(g, {}, 100);
  assert.equal(g.state.player.shield, 100);
  assert.equal(g.state.bolts.length, 0);
});
test("bolt-hit reports the actual contact and index on short projectile steps", () => {
  const g = sim.create();
  g.state.quiet = true;
  for (const [x, y, z] of [
    [0, -0.9, 20],
    [8.9, 2.1, -166],
  ])
    g.state.bolts.push({
      kind: "arc",
      from: "player",
      age: 0,
      x,
      y,
      z,
      vx: 0,
      vy: -18,
      vz: 0,
    });
  tick(g);
  const hits = g.state.events.filter((e) => e.type === "bolt-hit");
  const water = hits.find((e) => e.hit === "water");
  const dam = hits.find((e) => e.hit === "concrete");
  assert.equal(hits.length, 2);
  assert.equal(g.state.bolts.length, 0);
  assert.deepEqual(water.at, [0, sim.SEA_Y, 20]);
  assert.deepEqual(water.normal, [0, 1, 0]);
  assert.equal(water.index, -1);
  assert.equal(sim.layout[dam.index]?.stationAssembly?.node, "dam_sluice");
  assert.deepEqual(dam.at, [8.9, sim.layout[dam.index].max[1], -166]);
  assert.deepEqual(dam.normal, [0, 1, 0]);

  // The player is in front of the dam along this enemy bolt's step.
  place(g, 8.9, -164.3, 2);
  g.state.bolts.push({
    kind: "watcher",
    from: "enemy",
    age: 0,
    x: 8.9,
    y: 2.1,
    z: -163.8,
    vx: 0,
    vy: -36,
    vz: -120,
  });
  tick(g);
  const playerHit = g.state.events.find((e) => e.type === "bolt-hit");
  assert.equal(playerHit.hit, "player");
  assert.equal(playerHit.index, -1);
  assert.equal(playerHit.at[2], g.state.player.z + 0.3);
  assert.deepEqual(playerHit.normal, [0, 0, 1]);
});
test("a charge splashes once and still settles and explodes on the river bed", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, 19.8, -88);
  const splashes = [],
    bursts = [];
  let settledBelowSurface = false;
  for (let i = 0; i < 210; i++) {
    tick(g, { yaw: -Math.PI / 2, pitch: -0.8, charge: i === 0 });
    const b = g.state.bolts.find((b) => b.kind === "charge");
    if (b?.settled && b.y < sim.waterY(b.x, b.z)) settledBelowSurface = true;
    for (const e of g.state.events) {
      if (e.kind !== "charge") continue;
      if (e.type === "splash") splashes.push([...e.at]);
      if (e.type === "explode") bursts.push([...e.at]);
    }
  }
  assert.equal(splashes.length, 1);
  const [x, y, z] = splashes[0];
  assert.equal(y, sim.waterY(x, z));
  assert.ok(settledBelowSurface);
  assert.equal(bursts.length, 1);
  const [bx, by, bz] = bursts[0];
  assert.ok(by < sim.waterY(bx, bz));
  assert.equal(g.state.bolts.length, 0);
});
test("valley charges stay above terrain through bounce, settling and fuse", () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 20]) {
    let bounces = 0,
      bursts = 0;
    const g = sim.create({
      sfx: (type) => {
        if (type === "charge-bounce") bounces++;
      },
    });
    g.setZone(1);
    place(g, 3.2, -80);
    Object.assign(g.state, { god: true, quiet: true, pose: null });
    for (let i = 0; i < Math.ceil(1.75 / dt); i++) {
      g.update(dt, { yaw: 0, pitch: -0.3, charge: i === 0 });
      for (const b of g.state.bolts)
        if (b.kind === "charge")
          assert.ok(
            b.y >= sim.groundY(b.x, b.z) - 0.001,
            `charge below terrain at ${dt}s step`,
          );
      for (const e of g.state.events) {
        if (e.type === "explode" && e.kind === "charge") {
          bursts++;
          assert.ok(e.at[1] >= sim.groundY(e.at[0], e.at[2]) - 0.001);
        }
      }
    }
    assert.equal(bounces, 1);
    assert.equal(bursts, 1);
    assert.equal(g.state.bolts.length, 0);
  }
});
test("charge contact stops at cover and reflects away from its face", () => {
  const g = sim.create();
  g.state.quiet = true;
  const wall = sim.layout.find((b) => b.kind === "cover" && b.zone === 1);
  const b = {
    kind: "charge",
    from: "player",
    age: 0,
    x: (wall.min[0] + wall.max[0]) / 2,
    y: wall.max[1] - 0.5,
    z: wall.max[2] + 0.1,
    vx: 0,
    vy: 0,
    vz: -12,
  };
  g.state.bolts.push(b);
  g.update(0.05);
  assert.equal(b.bounced, true);
  assert.ok(b.z > wall.max[2], "contact must remain outside cover");
  assert.ok(b.vz > 0, "bounce must turn away from the wall");
});
test("shield precedes health; recover after four and eight seconds", () => {
  const g = sim.create();
  g.state.quiet = true;
  g.hurt(120);
  assert.equal(g.state.player.health, 80);
  assert.equal(g.state.player.shield, 0);
  tick(g, {}, 600);
  assert.equal(g.state.player.health, 80);
  assert.ok(g.state.player.shield > 20);
  tick(g, {}, 600);
  assert.equal(g.state.player.health, 100);
  assert.equal(g.state.player.shield, 100);
});
test("death restores checkpoint weapons and machines and costs one life", () => {
  let deaths = 0;
  const g = sim.create({ death: () => ++deaths < 3 });
  g.setZone(2);
  g.give("scatter");
  g.state.player.safe = 0;
  const e = g.state.enemies.find((e) => e.zone === 2);
  e.hp = 0;
  g.hurt(300);
  tick(g, {}, 90);
  assert.equal(deaths, 1);
  assert.ok(g.state.player.safe > 1);
  assert.ok(g.state.enemies.find((a) => a.id === e.id).hp > 0);
  assert.ok(g.state.weapons.some((a) => a.kind === "rail"));
});
test("a rail rifle taken after entering the causeway returns to its case on death", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, -1, -149.9, 22);
  tick(g, { moveZ: -1 }, 22);
  assert.equal(g.state.checkpoint, 2);
  tick(g, { use: true }, 100);
  assert.equal(g.state.weapon.kind, "rail");
  const rail = sim.entities.pickups.find((e) => e.kind === "rail");
  assert.ok(!g.state.pickups.some((e) => e.id === rail.id));
  g.hurt(300);
  tick(g, {}, 90);
  assert.equal(g.state.weapon.kind, "carbine");
  assert.deepEqual(
    g.state.pickups.find((e) => e.id === rail.id),
    rail,
  );
  tick(g, { use: true }, 100);
  assert.equal(g.state.weapon.kind, "rail");
});
test("station requires clear, hold use relights and reduces hashrate", () => {
  const g = sim.create();
  g.setZone(1);
  place(g, 0, -135);
  tick(g, { use: true }, 90);
  assert.equal(g.state.stations[0].state, "cartel");
  g.state.enemies.filter((e) => e.zone === 1).forEach((e) => (e.hp = 0));
  tick(g, { use: true }, 180);
  assert.equal(g.state.stations[0].state, "clear");
  assert.ok(Math.abs(g.state.useProgress - 0.6) < 0.01);
  tick(g, { use: true }, 121);
  assert.equal(g.state.stations[0].state, "keeper");
  assert.ok(Math.abs(g.state.hashrate - 50.6) < 0.001);
});
test("pages, coins, checkpoints counted once and seeded state detached", () => {
  let pages = 0,
    coins = 0;
  const splits = [];
  const g = sim.create({
    page: () => pages++,
    reward: (n) => (coins += n),
    checkpoint: (i) => splits.push(i),
  });
  g.state.quiet = true;
  place(g, -2, -12);
  tick(g, {}, 10);
  assert.equal(pages, 1);
  place(g, -10, -37);
  tick(g, {}, 10);
  assert.equal(coins, 3);
  place(g, 0, -315);
  tick(g, {}, 10);
  assert.deepEqual(splits, [1, 2, 3, 4]);
  g.snapshot().player.health = 0;
  assert.equal(g.state.player.health, 100);
  const a = sim.create(),
    b = sim.create();
  tick(a, { fire: true, moveZ: -1 }, 1000);
  tick(b, { fire: true, moveZ: -1 }, 1000);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
test("floaty jump reaches 1.6 m and reload consumes spare ammunition", () => {
  const g = sim.create();
  g.state.quiet = true;
  let apex = 0;
  for (let i = 0; i < 150; i++) {
    tick(g, { jump: true });
    apex = Math.max(apex, g.state.player.y);
  }
  assert.ok(apex > 1.54 && apex < 1.62);
  g.state.weapons[0].ammo = 2;
  tick(g, { reload: true }, 180);
  assert.equal(g.state.weapons[0].ammo, 2);
  tick(g, {}, 30);
  assert.equal(g.state.weapons[0].ammo, 32);
  assert.equal(g.state.weapons[0].spare, 290);
});
const openingRuns = [];
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 2140])
  test(`input-only player finishes seed ${seed} with ordered splits`, () => {
    let deaths = 0,
      openingDeaths = 0,
      done = 0;
    const splits = [];
    const g = sim.create(
      {
        death: () => {
          if (g.state.zone < 2) openingDeaths++;
          return ++deaths < 3;
        },
        checkpoint: (i) => splits.push(i),
        complete: () => done++,
      },
      { seed },
    );
    for (
      let i = 0;
      i < 120 * 720 && !g.state.complete && !g.state.gameOver;
      i++
    )
      g.update(1 / 120, drive(g));
    openingRuns.push({
      seed,
      deaths: openingDeaths,
      throughPipeline: g.state.checkpoint >= 2,
    });
    assert.equal(
      g.state.complete,
      true,
      JSON.stringify({
        time: g.state.time,
        p: g.state.player,
        stations: g.state.stations,
        boss: g.state.boss,
        ammo: g.state.weapons,
        remaining: g.state.enemies.filter(
          (e) => e.hp > 0 && e.zone === g.state.zone,
        ),
        deaths,
      }),
    );
    assert.equal(done, 1);
    assert.deepEqual(splits, [1, 2, 3, 4, 5]);
    assert.equal(g.state.boss.alive, false);
    assert.ok(Math.abs(g.state.hashrate - 48.2) < 0.001);
  });

test("natural banks reject uphill walking and jumping; bridge spans the gorge", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, -23, -100);
  const start = g.state.player.x;
  tick(g, { moveX: -1 }, 300);
  assert.ok(g.state.player.x > start - 2);
  tick(g, { moveX: -1, jump: true }, 300);
  assert.ok(g.state.player.x > start - 3);
  assert.ok(sim.groundY(0, -185) < -14);
  place(g, 0, -180, 22);
  tick(g, { moveZ: -1 }, 120);
  assert.equal(g.state.player.y, 22);
  assert.ok(g.state.player.z < -183);
  for (const p of sim.river) assert.ok(sim.groundY(p.x, p.z) < p.y);
  assert.ok(sim.waterfall.top.y > sim.waterfall.foot.y + 10);
});

test("jumping under the pipeline hits its underside without rising through it", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, -12.75, -65.5);
  const start = g.state.player.y;
  const trunk = sim.layout.find((b) => b.kind === "pipeline-trunk");
  tick(g, { jump: true }, 12);
  assert.ok(g.state.player.y > start);
  assert.ok(g.state.player.y + 1.9 <= trunk.min[1] + 0.001);
  assert.ok(g.state.player.vy < 0 && !g.state.player.grounded);
  tick(g, {}, 120);
  assert.equal(g.state.player.y, start);
});

test("the wellhead is climbable from the ground via its lower slab and ledge", () => {
  const g = sim.create();
  g.state.quiet = true;
  const well = sim.layout.find(
    (b) => b.stationPart?.node === "wellhead",
  ).stationPart;
  place(g, -4.96, -122.9);
  tick(g, { jump: true, moveZ: -1 }, 38);
  tick(g, {}, 140);
  assert.equal(g.state.player.y, well.y + 0.28);
  tick(g, { jump: true, moveZ: -1 }, 35);
  tick(g, {}, 140);
  assert.ok(g.state.player.z < -124.85);
  assert.ok(g.state.player.grounded);
  assert.equal(g.state.player.y, well.y + 1.28);
  const hit = g.trace([-4.96, well.y + 2, -125.09], [0, -1, 0]);
  assert.ok(Math.abs(hit.distance - 0.72) < 0.001);
});

test("rock corners leave clearance at the cove and causeway", () => {
  const g = sim.create();
  g.state.quiet = true;
  place(g, 9.5, -44.22);
  tick(g, { moveX: -1 }, 48);
  assert.ok(g.state.player.x < 8.95, JSON.stringify(g.state.player));
  place(g, -1.46, -171.08, 24);
  g.state.player.grounded = false;
  tick(g, {}, 160);
  assert.equal(g.state.player.y, 22);
  place(g, -2.8, -170, 24);
  g.state.player.grounded = false;
  tick(g, {}, 160);
  assert.ok(g.state.player.grounded && g.state.player.y > 23);
});

test("Causeway cover supports feet and blocks shots along its visible west edge", () => {
  const g = sim.create();
  g.state.quiet = true;

  const p = g.state.player;
  for (const fps of [30, 60, 120]) {
    place(g, -4.21, -168.5, 22);
    for (let i = 0; i < fps * 2; i++) g.update(1 / fps, { moveZ: -1 });
    for (let i = 0; i < fps / 2; i++) g.update(1 / fps, {});
    assert.ok(p.z < -169.25 && p.z > -169.4, "the rock stops forward movement");
    assert.ok(
      p.grounded && p.y === 22,
      `walking cannot climb rock at ${fps} FPS`,
    );
  }

  place(g, -4.21, -168.8, 22);
  tick(g, { jump: true, moveZ: -1 }, 19);
  tick(g, {}, 140);
  assert.ok(Math.abs(p.z + 169.47) < 0.03);
  assert.ok(
    p.grounded && p.y > 22.85 && p.y < 23.1,
    "feet land on the raised edge",
  );

  place(g, -4.21, -168.6, 22);
  tick(g, { ...aim(p, { x: -4.21, y: 22.08, z: -169.47 }), fire: true });
  const throughRecess = g.state.events.find((e) => e.type === "shot");
  assert.equal(throughRecess?.hit, "concrete");
  assert.ok(throughRecess.to[2] < -169.47);

  tick(g, {}, 60);
  place(g, -4.1, -168.6, 22);
  tick(g, { ...aim(p, { x: -4.1, y: 22.6, z: -169.69 }), fire: true });
  const intoRock = g.state.events.find((e) => e.type === "shot");
  assert.equal(intoRock?.hit, "rock");
  assert.ok(intoRock.to[2] > -169.72);
});

test("deep water respawns once with bridge checkpoint support", () => {
  let deaths = 0;
  const g = sim.create({
    death: () => {
      deaths++;
      return true;
    },
  });
  g.setZone(2);
  g.state.quiet = true;
  g.state.player.safe = 0;
  place(g, 18, -175, -15);
  tick(g, {}, 100);
  assert.equal(deaths, 1);
  assert.equal(g.state.player.y, 22);
  assert.ok(g.state.player.safe > 0);
  assert.equal(sim.waterY(0, 20), sim.SEA_Y);
  assert.equal(sim.waterY(0, -300), -Infinity);
  assert.equal(sim.waterY(18, -212), sim.waterfall.foot.y);
  assert.equal(sim.waterY(18, -224), -Infinity);
  for (const b of sim.layout.filter((b) => b.kind === "cover" && b.zone === 2))
    assert.equal(b.min[1], 22);
});

test("hauler hovers while passengers lower; siege lands with one pooled blast", () => {
  const g = sim.create();
  g.setZone(3);
  g.state.quiet = true;
  tick(g, {}, Math.ceil(g.state.director.drop.delay * 120) + 430);
  const a = { ...g.state.hauler };
  tick(g, {}, 180);
  const b = g.state.hauler;
  assert.ok(a.phase > 0.24 && b.phase < 0.58);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.z, b.z);
  assert.ok(b.descent > a.descent);
  tick(g, {}, 120);
  assert.ok(
    g.state.enemies
      .filter((e) => e.id >= 21 && e.id <= 25)
      .every((e) => e.deployed),
  );
  g.state.boss.alive = false;
  let landings = 0;
  for (let i = 0; i < 600; i++) {
    tick(g);
    landings += g.state.events.filter(
      (e) => e.type === "explode" && e.kind === "siege",
    ).length;
  }
  assert.equal(landings, 1);
  assert.equal(g.state.boss.pose.roll, Math.PI / 2);
  assert.ok(Math.abs(g.state.boss.pose.x - 16 - sim.siege.landing.x) < 1e-8);
});

test("enemy projectiles leave the authored muzzle above the hit centre", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  g.state.god = true;
  const e = g.spawn("watcher", 0, -12, sim.groundY(0, -12));
  e.cooldown = 0;
  e.charge = 0.999;
  e.aim = { x: 0, y: 1, z: 0 };
  tick(g);
  const b = g.state.bolts.find((b) => b.kind === "watcher");
  assert.ok(b);
  assert.ok(b.y > e.y + sim.MACHINES.watcher.centre + 0.5);
  assert.ok(b.z > e.z + 0.6);
});

test("director replays seeds, varies formations, preserves threat and clears solids/view", () => {
  const layouts = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 2140]) {
    const a = sim.create({}, { seed }),
      b = sim.create({}, { seed });
    assert.deepEqual(a.snapshot(), b.snapshot());
    layouts.add(JSON.stringify(a.state.enemies.map((e) => [e.kind, e.x, e.z])));
    assert.deepEqual(a.state.director.threat, [3, 17, 12, 20, 24]);
    for (const e of a.state.enemies) {
      const m = sim.MACHINES[e.kind];
      for (const raw of sim.layout) {
        const box =
          raw.shape === "cyl"
            ? {
                min: [raw.x - raw.r, raw.y0, raw.z - raw.r],
                max: [raw.x + raw.r, raw.y1, raw.z + raw.r],
              }
            : raw;
        const bottom =
          e.kind === "gnat" ? e.y + m.centre - m.height / 2 : e.y + 0.08;
        assert.ok(
          !(
            e.x + m.r > box.min[0] &&
            e.x - m.r < box.max[0] &&
            e.z + m.r > box.min[2] &&
            e.z - m.r < box.max[2] &&
            bottom < box.max[1] &&
            e.y + m.centre + m.height / 2 > box.min[1]
          ),
          `solid at seed ${seed}, enemy ${e.id}`,
        );
      }
      const d = Math.hypot(e.x, e.z),
        top = e.y + m.centre + m.height / 2;
      if (-e.z / d > 0.34 - m.r / d) {
        const len = Math.hypot(e.x, top - 1.68, e.z);
        assert.ok(
          a.trace(
            [0, 1.68, 0],
            [e.x / len, (top - 1.68) / len, e.z / len],
            len,
            false,
          ).hit,
          `visible spawn ${e.id}`,
        );
      }
    }
    tick(a, { fire: true, moveZ: -1 }, 240);
    tick(b, { fire: true, moveZ: -1 }, 240);
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
  assert.equal(layouts.size, 10);
});

test("hearing investigates without wall vision, then lost sight searches the last spot", () => {
  const g = sim.create();
  g.state.enemies.forEach((e) => (e.hp = 0));
  g.state.god = true;
  // Use the high side of the beach boulder for an occluded sightline.
  const coverX = -5.4;
  place(g, coverX, -26);
  const e = g.spawn("strider", coverX, -35);
  tick(g, { fire: true, yaw: Math.PI });
  assert.equal(e.visible, false);
  assert.equal(e.awareness, "suspicious");
  assert.equal(e.memory.z, -26);
  assert.ok(e.goal.z > e.z);
  place(g, 0, -10);
  Object.assign(e, {
    x: 0,
    z: -19,
    y: sim.groundY(0, -19),
    thinkAt: 0,
    yaw: 0,
  });
  tick(g, {}, 90);
  assert.equal(e.awareness, "engage");
  assert.equal(e.visible, true);
  const last = { ...e.memory };
  place(g, coverX, -32);
  Object.assign(e, {
    x: coverX,
    z: -26,
    y: sim.groundY(coverX, -26),
    thinkAt: 0,
  });
  tick(g, {}, 190);
  assert.equal(e.visible, false);
  assert.equal(e.awareness, "search");
  assert.deepEqual(e.memory, last);
});

test("depleted striders choose occluding cover, and firing/sight work stays bounded", () => {
  const g = sim.create();
  g.setZone(1);
  g.state.enemies.forEach((e) => (e.hp = 0));
  g.state.god = true;
  place(g, 0, -94);
  const e = g.spawn("strider", -4, -104);
  e.shield = 5;
  e.role = "guard";
  let usedCover = false,
    fired = 0;
  for (let i = 0; i < 1200; i++) {
    tick(g);
    usedCover ||= !!e.cover;
    fired += g.state.bolts.filter(
      (b) => b.from === "enemy" && b.age < 0.01,
    ).length;
    assert.ok(g.state.director.traces <= 4);
  }
  assert.ok(usedCover);
  assert.ok(fired > 0);
  const h = sim.create();
  h.state.enemies.forEach((e) => (e.hp = 0));
  h.state.god = true;
  for (let i = 0; i < 8; i++) {
    const a = h.spawn("gnat", -7 + i * 2, -12);
    a.cooldown = 0;
  }
  let maximum = 0;
  for (let i = 0; i < 2400; i++) {
    tick(h);
    const slots =
      h.state.enemies.filter((e) => e.hp > 0 && e.charge > 0).length +
      h.state.bolts.filter((b) => b.from === "enemy").length;
    maximum = Math.max(maximum, slots);
    assert.ok(slots <= 3);
    assert.ok(h.state.director.traces <= 4);
  }
  assert.equal(maximum, 3);
});

test("opening budgets and watcher sites stay fair across 100 seeds", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = sim.create({}, { seed }),
      scouts = g.state.enemies.filter((e) => e.zone === 0);
    assert.equal(scouts.length, 3);
    assert.deepEqual(g.state.director.threat, [3, 17, 12, 20, 24]);
    assert.ok(scouts.every((e) => e.wakeAt >= 6 && e.wakeAt <= 10));
    for (const e of g.state.enemies.filter((e) => e.kind === "watcher")) {
      assert.equal(e.zone, 2);
      assert.ok(-e.z >= 190);
      for (const other of g.state.enemies.filter(
        (a) => a.kind === "watcher" && a.id !== e.id,
      ))
        assert.ok(Math.hypot(e.x - other.x, e.z - other.z) >= 7);
    }
  }
});
test("cliff checkpoint restores pickups and lets the player walk off the stairs", () => {
  const g = sim.create({ death: () => true });
  g.killAll();
  const pickup = { id: 999, kind: "scatter", x: 0, y: 12, z: -55.1 };
  g.state.pickups.push(pickup);
  place(g, 0, -55.1, 12.04);
  tick(g);
  tick(g, { use: true }, 90);
  assert.equal(g.state.weapon.kind, "scatter");
  g.hurt(300);
  tick(g, {}, 100);
  assert.equal(g.state.weapon.kind, "carbine");
  assert.deepEqual(
    g.state.pickups.find((e) => e.id === pickup.id),
    pickup,
  );
  tick(g, { moveZ: -1 }, 120);
  assert.ok(g.state.player.z < -58);
  assert.ok(
    g.state.enemies.filter((e) => e.zone === 0).every((e) => e.hp === 0),
  );
});

test("standing shooter survives the causeway entrance across 30 seeds", () => {
  for (let seed = 1; seed <= 30; seed++) {
    let deaths = 0;
    const g = sim.create(
      {
        death: () => {
          deaths++;
          return true;
        },
      },
      { seed },
    );
    g.setZone(2);
    for (let i = 0; i < 60 * 100 && -g.state.player.z < 175 && !deaths; i++)
      g.update(1 / 60, drive(g));
    assert.equal(deaths, 0, `seed ${seed}`);
    assert.ok(
      -g.state.player.z >= 175,
      `seed ${seed} stalled at ${g.state.player.z}`,
    );
  }
});
test("each enemy projectile follows its exposed locked aim after a full warning", () => {
  for (const kind of ["gnat", "strider", "watcher", "bulwark", "turret"]) {
    const g = sim.create();
    g.killAll();
    g.state.god = true;
    const e = g.spawn(kind, 0, -12);
    e.cooldown = 0;
    let first = null,
      aimPoint = null,
      shot = null;
    for (let i = 0; i < 600 && !shot; i++) {
      g.update(1 / 120, {});
      if (e.charge > 0 && first === null) first = g.state.time;
      if (e.charge >= 0.8) aimPoint = { ...e.aim };
      shot = g.state.bolts.find((b) => b.from === "enemy");
    }
    assert.ok(shot, kind);
    assert.ok(aimPoint, kind);
    assert.ok(g.state.time - first >= (kind === "watcher" ? 1.48 : 0.78), kind);
    assert.deepEqual(e.aim, aimPoint);
    // Horizontal trajectory also covers the mortar's ballistic vertical lift.
    const muzzle = sim.MACHINES[kind].muzzle;
    const x = e.x + muzzle[0] * Math.cos(e.yaw) + muzzle[2] * Math.sin(e.yaw),
      z = e.z - muzzle[0] * Math.sin(e.yaw) + muzzle[2] * Math.cos(e.yaw);
    assert.ok(
      Math.abs(
        Math.atan2(shot.vx, shot.vz) -
          Math.atan2(aimPoint.x - x, aimPoint.z - z),
      ) < 0.0001,
      kind,
    );
  }
});
test("arc bursts hit a close strafing gnat", () => {
  const g = sim.create();
  g.killAll();
  g.give("arc");
  g.state.god = true;
  const e = g.spawn("gnat", 0, -3);
  let hits = 0;
  for (let i = 0; i < 240 && e.hp > 0; i++) {
    const before = e.hp;
    g.update(1 / 120, {
      ...aim(g.state.player, { ...e, y: e.y + sim.MACHINES.gnat.centre }),
      fire: true,
    });
    hits += e.hp < before ? 1 : 0;
  }
  assert.ok(hits > 0);
  assert.equal(e.hp, 0);
});
test("a suspicious machine travels around cover toward the noise", () => {
  const g = sim.create();
  g.killAll();
  g.state.god = true;
  const coverX = -5.4;
  place(g, coverX, -26);
  const e = g.spawn("strider", coverX, -35),
    start = { x: e.x, z: e.z };
  tick(g, { fire: true, yaw: Math.PI });
  assert.equal(e.awareness, "suspicious");
  tick(g, {}, 600);
  assert.ok(Math.hypot(e.x - start.x, e.z - start.z) > 2);
  assert.ok(Math.hypot(e.x - coverX, e.z + 26) < 9);
});

test("at least eight of ten ordinary input players survive the first two zones", (t) => {
  t.diagnostic(JSON.stringify(openingRuns));
  assert.equal(openingRuns.length, 10);
  assert.ok(
    openingRuns.filter((r) => r.throughPipeline && r.deaths === 0).length >= 8,
  );
});

test("landed siege stays west of the route and blocks shots and feet", () => {
  const g = sim.create();
  g.setZone(4);
  g.state.quiet = true;
  assert.deepEqual([sim.siege.landing.x, sim.siege.landing.z], [-19, -378]);
  const upright = sim.layout.find((b) => b.kind === "siege-hull");
  const uprightOrigin = [
    upright.min[0] - 0.5,
    upright.min[1] + 3.3,
    (upright.min[2] + upright.max[2]) / 2,
  ];
  const uprightHit = g.trace(uprightOrigin, [1, 0, 0], 1, false);
  assert.equal(uprightHit.hit, "metal");
  assert.equal(uprightHit.distance, 0.5);
  g.state.boss.alive = false;
  assert.equal(g.trace(uprightOrigin, [1, 0, 0], 1, false).hit, null);
  tick(g, {}, 481);
  const q = g.state.boss.pose;
  const min = [q.x - 27, q.y - 7.72, q.z - 2.805],
    max = [q.x - 5, q.y - 2.12, q.z + 2.524];
  assert.ok(max[0] < -7, "wreck leaves the entry route open");
  const hit = g.trace(
    [max[0] + 1, (min[1] + max[1]) / 2, q.z],
    [-1, 0, 0],
    2,
    false,
  );
  assert.equal(hit.hit, "metal");
  assert.ok(Math.abs(hit.distance - 1) < 1e-8);
  place(g, (min[0] + max[0]) / 2, q.z, max[1] + 0.2);
  g.state.player.grounded = false;
  tick(g, {}, 60);
  assert.ok(
    Math.abs(g.state.player.y - max[1]) < 1e-8,
    "wreck supports a landing",
  );
  place(g, -19, max[2] + 0.7);
  tick(g, { moveZ: -1 }, 100);
  assert.ok(
    g.state.player.z >= max[2] + 0.28,
    "player cannot walk through the hull",
  );
});

test("siege landing gently clears either side without damage", () => {
  for (const side of [-1, 1]) {
    const g = sim.create();
    g.setZone(4);
    g.state.quiet = true;
    g.state.boss.alive = false;
    g.state.boss.dying = 0.61;
    place(g, -19, -378 + side * 0.5);
    const before = { ...g.state.player };
    tick(g);
    assert.ok(
      Math.abs(g.state.player.z - before.z) > 0 &&
        Math.abs(g.state.player.z - before.z) < 0.1,
      "first shove is gradual",
    );
    tick(g, {}, 48);
    const edge = side < 0 ? -378 - 2.805 - 0.6 : -378 + 2.524 + 0.6;
    assert.ok(side < 0 ? g.state.player.z <= edge : g.state.player.z >= edge);
    assert.equal(g.state.player.health, 100);
    assert.equal(g.state.player.shield, 100);
  }
});

test("last clamp silences guards and staggers normal deaths and rewards", () => {
  const deaths = [],
    rewards = [];
  const g = sim.create({
    sfx: (type) => {
      if (type === "kill") deaths.push(g.state.time);
    },
    reward: (coins, score) =>
      rewards.push({ coins, score, time: g.state.time }),
  });
  g.setZone(4);
  g.state.quiet = true;
  g.state.god = true;
  g.give("carbine");
  tick(g, {}, 60);
  g.state.enemies.filter((e) => e.zone !== 4).forEach((e) => (e.hp = 0));
  g.state.boss.clamps.forEach((c, i) =>
    Object.assign(c, { alive: i === 2, hp: i === 2 ? 1 : 0, shield: 0 }),
  );
  const clamp = sim.entities.clamps[2];
  place(g, clamp.x, clamp.z + 3, clamp.y - 1.68);
  tick(g, { fire: true });
  assert.equal(g.state.boss.alive, false);
  const guards = g.state.enemies.filter((e) => e.zone === 4);
  assert.ok(
    guards.every(
      (e) => e.mode === "dying" && e.charge === 0 && e.deathDelay >= 0,
    ),
  );
  g.state.quiet = false;
  for (let i = 0; i < 140; i++) {
    tick(g);
    assert.ok(
      guards
        .filter((e) => e.hp > 0)
        .every((e) => e.mode === "dying" && e.charge === 0),
    );
    assert.equal(g.state.bolts.filter((b) => b.from === "enemy").length, 0);
  }
  assert.equal(deaths.length, guards.length);
  assert.ok(
    deaths.at(-1) - deaths[0] > 0.6 && deaths.at(-1) - deaths[0] <= 1.1,
  );
  assert.ok(new Set(deaths).size > 6, "deaths are spread across frames");
  assert.equal(rewards.filter((r) => r.score === 100).length, guards.length);
  // A nearby guard's drop may already have reached the stationary player.
  assert.equal(
    g.state.drops.length +
      rewards.filter((r) => r.coins === 3 && r.score === 30).length,
    guards.length,
  );
  assert.ok(guards.every((e) => e.hp === 0 && e.mode === "dead" && e.paid));
});

test("input driver leaves Station Two through the kiosk opening after relight", () => {
  const g = sim.create();
  g.setZone(3);
  g.killAll();
  g.state.stations[1] = { state: "keeper", relight: 1 };
  place(g, -2.79, -293.59, 34.06698155194376);
  for (let i = 0; i < 1200 && g.state.player.z > -305; i++) tick(g, drive(g));
  assert.ok(g.state.player.z < -305, JSON.stringify(g.state.player));
});

test("a cleared pylon takes priority over dropped weapons without losing the pickup", () => {
  const g = sim.create();
  g.setZone(3);
  g.killAll();
  g.give("rail");
  const station = sim.entities.stations[1];
  place(g, station.x, station.z + 2.2);
  g.state.stations[1].state = "clear";
  g.state.pickups.push({
    id: 9999,
    kind: "scatter",
    x: station.x,
    y: g.state.player.y,
    z: station.z + 1.5,
  });
  assert.equal(g.target().type, "station");
  tick(g, { use: true }, 301);
  assert.equal(g.state.stations[1].state, "keeper");
  assert.ok(g.state.pickups.some((p) => p.id === 9999));
  assert.equal(g.target().type, "weapon");
  tick(g, { use: true }, 100);
  assert.ok(!g.state.weapons.some((w) => w.kind === "scatter"));
  tick(g);
  tick(g, { use: true }, 100);
  assert.ok(g.state.weapons.some((w) => w.kind === "scatter"));
});

test("beacon holds, turns toward the valley and schedules each ending cue once", () => {
  const cues = [];
  const g = sim.create({
    sfx: (type) => cues.push({ type, time: g.state.ending }),
  });
  g.setZone(5);
  g.state.quiet = true;
  g.state.god = true;
  const b = sim.entities.beacon;
  place(g, b.x, b.z + 1);
  g.state.player.yaw = 0.2;
  tick(g, { use: true }, 180);
  assert.equal(g.state.ending, 0);
  tick(g, { use: true }, 14);
  assert.ok(g.state.ending > 0);
  const start = { ...g.state.player };
  tick(g, { moveZ: 1, fire: true }, 310);
  assert.ok(Math.abs(g.state.player.pitch - 0.62) < 0.01);
  assert.equal(g.state.player.x, start.x);
  assert.equal(g.state.player.z, start.z);
  tick(g, {}, 320);
  assert.ok(Math.abs(g.state.player.yaw - Math.PI) < 0.01);
  assert.ok(Math.abs(g.state.player.pitch + 0.04) < 0.01);
  tick(g, {}, 470);
  assert.equal(g.state.complete, false);
  tick(g, {}, 45);
  assert.equal(g.state.complete, true);
  const ending = cues.filter((c) => c.time >= 4);
  assert.deepEqual(
    ending.map((c) => c.type),
    [
      "hashrate-drop",
      "station-relight",
      "station-relight",
      "station-relight",
      "station-relight",
      "checkpoint",
    ],
  );
  [4.4, 5, 5.8, 6.6, 7.4, 8.4].forEach((time, i) =>
    assert.ok(Math.abs(ending[i].time - time) < 0.01),
  );
});
test("third station relights only when the falling siege clears its spire", () => {
  const cues = [];
  const g = sim.create({ sfx: (type) => cues.push(type) });
  g.setZone(4);
  g.state.quiet = true;
  g.state.god = true;
  g.state.boss.alive = false;
  tick(g, {}, 400);
  assert.notEqual(g.state.stations[2].state, "keeper");
  assert.ok(!cues.includes("hashrate-drop"));
  tick(g, {}, 10);
  assert.equal(g.state.stations[2].state, "keeper");
  assert.equal(cues.filter((c) => c === "station-relight").length, 1);
  tick(g, {}, 100);
  assert.equal(cues.filter((c) => c === "station-relight").length, 1);
});
