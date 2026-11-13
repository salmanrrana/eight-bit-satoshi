// Fixed-step game rules. Coordinates are metres; forward is negative Z.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ProofOfWork = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Reachable solid geometry is authored once here and consumed by the renderer.
  // Bounds are [left, right, north, south]; height is independent of collision.
  const layout = [
    { kind: "room", bounds: [-1.5, 1.5, 0, 8], height: 3 },
    { kind: "room", bounds: [-6, 6, -16, 0], height: 6 },
    { kind: "room", bounds: [-2, 2, -21, -16], height: 3.2 },
    ...[-5.75, 5.75].flatMap((x) =>
      [-1, -4.6, -8.2, -11.8, -15.4].map((z) => ({
        kind: "column",
        bounds: [x - 0.25, x + 0.25, z - 0.25, z + 0.25],
        height: 5.8,
      })),
    ),
    ...[-3, 3].flatMap((x) =>
      [-3, -6, -9, -12].map((z) => ({
        kind: "rack",
        bounds: [x - 0.575, x + 0.575, z - 1, z + 1],
        height: 3.1,
      })),
    ),
    { kind: "glass", bounds: [-2, -0.8, -16.04, -15.96], height: 3 },
    { kind: "glass", bounds: [0.8, 2, -16.04, -15.96], height: 3 },
    { kind: "door", bounds: [-0.8, 0.8, -16.04, -15.96], height: 3 },
    { kind: "desk", bounds: [-1.8, 1.8, -20.3, -19.3], height: 0.925 },
    { kind: "chair", bounds: [-0.135, 0.435, -18.925, -18.35], height: 1.315 },
    ...[-1.4, 1.4].map((x) => ({
      kind: "entry-frame",
      bounds: [x - 0.075, x + 0.075, -0.03, 0.19],
      height: 3,
    })),
    {
      kind: "pipe-run",
      bounds: [-1.395, -1.245, 0.1, 7.9],
      bottom: 0.3,
      height: 2.35,
      levels: [0.35, 0.6, 2.6],
    },
  ];
  function shell(x, y, z, w, h, d, material = "concrete") {
    layout.push({
      kind: "shell",
      bounds: [x - w / 2, x + w / 2, z - d / 2, z + d / 2],
      bottom: y - h / 2,
      height: h,
      material,
    });
  }
  for (let z = -15; z <= 7; z += 2) {
    const corridor = z > 0,
      edge = corridor ? 1.63 : 6.13,
      h = corridor ? 3 : 6;
    for (const x of [-edge, edge]) {
      if (x > 0 && (z === 5 || z === 7)) continue;
      shell(x, h / 2, z, 0.26, h, 1.98);
    }
    if (!corridor && (z === -7 || z === -9)) {
      shell(-3.6, h + 0.12, z, 4.7, 0.24, 2);
      shell(4.1, h + 0.12, z, 3.7, 0.24, 2);
    } else shell(0, h + 0.12, z, corridor ? 3.5 : 12.5, 0.24, 2);
    if (corridor) shell(0, -0.18, z, 3.25, 0.3, 2);
    else for (const x of [-3.5, 3.5]) shell(x, -0.18, z, 5.05, 0.3, 2, "floor");
  }
  for (const x of [-3.85, 3.85]) shell(x, 3, 0, 4.3, 6, 0.25);
  shell(0, 4.6, 0, 3.4, 2.8, 0.25);
  for (const x of [-4, 4]) shell(x, 3, -16, 4, 6, 0.25);
  shell(0, 4.5, -16, 4, 3, 0.25);
  shell(0, 1.5, 8.1, 3.5, 3, 0.2);
  shell(0, -0.13, -18.5, 4, 0.25, 5);
  for (const x of [-2.12, 2.12]) shell(x, 1.6, -18.5, 0.24, 3.2, 5);
  shell(0, 1.6, -21.1, 4.4, 3.2, 0.2);
  shell(0, 3.25, -18.5, 4.3, 0.15, 5);
  shell(1.63, 0.295, 6, 0.26, 0.59, 4);
  shell(1.63, 2.885, 6, 0.26, 0.23, 4);
  shell(1.63, 1.68, 4.525, 0.26, 2.18, 1.05);
  shell(1.63, 1.68, 7.175, 0.26, 2.18, 1.65);
  layout.push({
    kind: "window",
    bounds: [1.26, 1.5, 5.02, 6.38],
    bottom: 0.545,
    height: 2.27,
  });
  const rooms = layout.filter((o) => o.kind === "room").map((o) => o.bounds);
  const racks = layout.filter((o) => o.kind === "rack").map((o) => o.bounds);
  const targets = [
    { id: "A", x: 1.27, z: 1, y: 1.5 },
    { id: "B", x: -5.75, z: -10.5, y: 1.5 },
    { id: "C", x: 5.75, z: -14, y: 1.5 },
    { id: "lever", x: 1.25, z: -19.4, y: 1.3 },
    { id: "coin", x: -0.4, z: -19.4, y: 1.15 },
  ];
  // Wall-mounted housings protrude into the room and are solid at body height.
  for (const t of targets.slice(0, 3)) {
    layout.push({
      kind: "breaker",
      targetId: t.id,
      bounds: [t.x - 0.34, t.x + 0.34, t.z - 0.31, t.z + 0.31],
      bottom: 1.075,
      height: 0.85,
    });
  }
  function create(hooks = {}) {
    const state = {
      player: { x: 0, z: 6.5, y: 1.68, yaw: 0, pitch: 0, vx: 0, vz: 0 },
      breakers: [false, false, false],
      stage: 0,
      doorOpen: 0,
      leverPulled: false,
      coinTrayOpen: 0,
      coinCollected: false,
      satsCollected: 0,
      mining: 0,
      ending: 0,
      complete: false,
      flashlight: true,
      time: 0,
      steps: 0,
    };
    function blocked(x, z) {
      const r = 0.22;
      if (
        ![
          [x - r, z - r],
          [x + r, z - r],
          [x - r, z + r],
          [x + r, z + r],
        ].every(([a, b]) =>
          rooms.some(([l, h, n, s]) => a >= l && a <= h && b >= n && b <= s),
        )
      )
        return true;
      return layout.some(
        ({ kind, bounds: [l, h, n, s], bottom = 0, height }) =>
          kind !== "room" &&
          bottom < 1.7 &&
          bottom + height > 0.1 &&
          !(kind === "door" && state.doorOpen >= 0.8) &&
          x + r > l &&
          x - r < h &&
          z + r > n &&
          z - r < s,
      );
    }
    function target() {
      const p = state.player;
      let best = null,
        bestAim = 0.55;
      for (const t of targets) {
        const bank = "ABC".indexOf(t.id);
        if (bank >= 0 && state.breakers[bank]) continue;
        if (t.id === "lever" && (state.leverPulled || state.stage < 3))
          continue;
        if (
          t.id === "coin" &&
          (state.coinTrayOpen < 0.6 || state.coinCollected)
        )
          continue;
        const dx = t.x - p.x,
          dz = t.z - p.z,
          dy = t.y - p.y,
          d = Math.hypot(dx, dy, dz);
        const aim =
          d < 0.3
            ? 1
            : ((dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) *
                Math.cos(p.pitch) +
                dy * Math.sin(p.pitch)) /
              d;
        if (d < 1.8 && aim > bestAim) {
          best = t;
          bestAim = aim;
        }
      }
      return best;
    }
    function interact() {
      const t = target();
      if (!t || state.ending || state.complete) return false;
      const i = "ABC".indexOf(t.id);
      if (i >= 0 && !state.breakers[i]) {
        state.breakers[i] = true;
        state.stage = state.breakers.filter(Boolean).length;
        hooks.checkpoint?.(i, `BREAKER ${t.id}`);
        hooks.sfx?.("breaker", t);
        return true;
      }
      if (t.id === "lever" && state.stage === 3 && !state.mining) {
        state.mining = 0.001;
        state.leverPulled = true;
        hooks.sfx?.("power", t);
        return true;
      }
      if (t.id === "coin" && state.mining >= 6) {
        state.ending = 0.001;
        state.coinCollected = true;
        hooks.reward?.(1, 21000);
        hooks.sfx?.("coin", t);
        return true;
      }
      return false;
    }
    function update(dt, input = {}) {
      if (state.complete) return;
      state.time += dt;
      if (state.stage === 3) state.doorOpen = Math.min(1, state.doorOpen + dt);
      if (state.mining >= 6)
        state.coinTrayOpen = Math.min(1, state.coinTrayOpen + dt);
      if (state.mining) state.mining = Math.min(6, state.mining + dt);
      if (state.ending) {
        state.ending += dt;
        if (state.ending > 2.2) {
          state.complete = true;
          hooks.complete?.();
        }
        return;
      }
      const p = state.player;
      let x = Number(!!input.right) - Number(!!input.left),
        z = Number(!!input.down) - Number(!!input.up);
      const n = Math.hypot(x, z) || 1;
      x /= n;
      z /= n;
      const speed = input.fire ? 3.8 : 2.3,
        k = 1 - Math.exp(-12 * dt),
        c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      p.vx += ((x * c + z * s) * speed - p.vx) * k;
      p.vz += ((z * c - x * s) * speed - p.vz) * k;
      if (!blocked(p.x + p.vx * dt, p.z)) p.x += p.vx * dt;
      else p.vx = 0;
      if (!blocked(p.x, p.z + p.vz * dt)) p.z += p.vz * dt;
      else p.vz = 0;
      state.steps += Math.hypot(p.vx, p.vz) * dt;
      if (input.throwPressed || input.jumpPressed) interact();
    }
    function objective() {
      return state.ending
        ? "PROOF OF WORK."
        : state.mining >= 6
          ? "Block found. Collect the coin."
          : state.mining
            ? "Mining the next block…"
            : state.stage === 3
              ? "Control room unlocked. Pull the master lever."
              : `Restore power · ${state.stage}/3 breakers`;
    }
    // A detached, JSON-safe view for local playtesting. No rendering objects.
    function snapshot() {
      return {
        ...state,
        player: { ...state.player },
        breakers: [...state.breakers],
        interactable: target()?.id ?? null,
      };
    }
    return { state, update, interact, target, blocked, objective, snapshot };
  }
  return { create, rooms, racks, layout, targets };
});
