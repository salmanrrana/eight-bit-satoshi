// FIRST LIGHT: deterministic metres, Y up, player.y is FEET (eye = y + 1.68).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FirstLight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ZONES = [
    ["BROKEN WORLD", 0, 45, "2008: money printers and broken banks."],
    ["CYPHERPUNKS", 45, 90, "Cryptography gives the individual a shield."],
    ["GENESIS", 90, 130, "Mine the genesis block and keep moving."],
    [
      "BLOCKCHAIN",
      130,
      180,
      "Blocks link together. Enemies cannot rewrite them.",
    ],
    ["NETWORK", 180, 230, "Nodes, miners, and users harden the network."],
    ["HANDOFF", 230, 270, "Satoshi fades. The system keeps running."],
    ["WHITEPAPER", 270, 300, "Reach the whitepaper. The code lives on."],
  ].map(([name, s0, s1, text]) => ({ name, s0, s1, text }));
  const route = [
    [0, 0],
    [0, -45],
    [20, -45],
    [20, -280],
  ];
  function at(s, offset = 0) {
    if (s <= 45) return { x: offset, z: -s };
    if (s <= 65) return { x: s - 45, z: -45 + offset };
    return { x: 20 + offset, z: 20 - s };
  }
  // Closest point on the polyline, not -z: progress remains correct at bends.
  function routeS(x, z) {
    let best = Infinity,
      result = 0,
      total = 0;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1],
        [bx, bz] = route[i];
      const dx = bx - ax,
        dz = bz - az,
        len = Math.hypot(dx, dz);
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (len * len), 0, 1);
      const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < best) {
        best = d;
        result = total + t * len;
      }
      total += len;
    }
    return result;
  }
  const WATER_Y = -0.65;
  function groundY(x, z) {
    if (z < -111 && z > -158) return -5; // bank-to-bank channel
    const s = 20 - z;
    if (s <= 180) return 0;
    const rise = clamp((s - 180) / 50, 0, 1);
    const ridge = 8 * (rise * rise * (3 - 2 * rise));
    const summit = 2 * clamp((s - 270) / 30, 0, 1);
    const off = Math.max(0, Math.abs(x - 20) - 4);
    return (
      ridge +
      summit -
      Math.min(5, off * 0.18) +
      Math.sin(x * 0.12) * Math.sin(z * 0.08) * Math.min(0.8, off * 0.06)
    );
  }
  const layout = [];
  function solid(kind, zone, min, max, surface = "stone", extra = {}) {
    const item = { kind, zone, min, max, surface, ...extra };
    layout.push(item);
    return item;
  }
  // CITY solids. Route-critical decks and openings: rerun tests after edits.
  for (let s = 0; s < 40; s += 10)
    for (const side of [-1, 1])
      solid(
        "building",
        0,
        [side < 0 ? -17 : 7, 0, -s - 9.8],
        [side < 0 ? -7 : 17, 13 + (s % 7), -s],
      );
  solid("barrier", 1, [-7, 0, -48], [17.8, 3.5, -47]);
  solid("building", 1, [2.3, 0, -42.8], [17.8, 14, -37]);
  for (const x of [17.5, 22])
    solid("building", 1, [x, 0, -70], [x + 0.5, 12, -47]);
  solid("kerb", 0, [4, 0, -39], [6.9, 0.2, 0], "stone");
  solid("dumpster", 1, [18.15, 0, -50], [21.85, 1.2, -48], "metal");
  solid("deck", 1, [18.1, 0, -54], [21.9, 2.4, -50], "metal");
  solid("deck", 1, [18.1, 0, -59.6], [21.9, 2.4, -55.6], "metal");
  solid("deck", 1, [18.1, 0, -65.2], [21.9, 2.4, -61.2], "metal");
  for (let i = 0; i < 8; i++)
    solid(
      "stairs",
      1,
      [18.1, 0, -65.6 - i * 0.4],
      [21.9, 2.4 - i * 0.3, -65.2 - i * 0.4],
      "metal",
    );
  solid("workbench", 2, [22, 0, -91], [24, 0.9, -89], "wood");
  for (const x of [12, 28])
    solid("fence", 2, [x, 0, -110], [x + 0.15, 2, -70], "metal");
  // HILLS renders these same bounds. Short sections follow the slope while
  // keeping the top above the uphill take-off ground, without tall steps.
  for (let s = 180; s < 300; s += 1.25)
    for (const x of [13, 27]) {
      const y = groundY(x, 20 - s);
      const innerX = x < 20 ? x + 1 : x - 0.6;
      const top =
        Math.max(groundY(innerX, 20 - s), groundY(innerX, 18.75 - s)) + 1.4;
      solid(
        "wall",
        Math.min(
          6,
          ZONES.findIndex((z) => s >= z.s0 && s < z.s1),
        ),
        [x, y - 1, 18.75 - s],
        [x + 0.4, top, 20 - s],
      );
    }
  // Close the ends of the playable corridor with visible solids, including the
  // outside corners of both turns. The finite grey-box terrain has no hidden walls.
  solid("barrier", 0, [-7, 0, 1.5], [7, 2, 2]);
  for (const x of [-7, 7])
    solid("fence", 0, [x, 0, 0], [x + 0.15, 2, 2], "metal");
  solid("fence", 1, [-7, 0, -48], [-6.85, 2, -39.8], "metal");
  solid("building", 1, [22, 0, -47], [22.5, 12, -42.8]);
  solid("building", 1, [17.8, 0, -42.8], [22.5, 12, -42.3]);
  for (const [a, b] of [
    [12, 17.5],
    [22.5, 28],
  ])
    solid("fence", 2, [a, 0, -70.2], [b, 2, -70], "metal");
  for (const x of [12, 28])
    solid("fence", 2, [x, 0, -111], [x + 0.15, 2, -110], "metal");
  for (const x of [13, 27])
    solid("wall", 3, [x, -1, -160], [x + 0.4, 1.3, -158]);
  // Low end courses expose the valley; the outside-face clamp still contains jumps.
  solid("wall", 6, [13, 9, -280.4], [27.4, 10.35, -280]);
  // --- Content solids -------------------------------------------------------
  // Anything a content worker builds that the player can bump into goes here.
  // Each worker edits ONLY its own block, with small patches, then re-runs
  // `node --test tests/first-light.test.js`.
  // STREET (zone 0):
  solid("street-paving", 0, [-7, 0, -39], [-4, 0.2, 0], "stone");
  // Projecting shopfronts and the locked bank grille meet the structural shells.
  for (const side of [-1, 1])
    solid(
      "street-front",
      0,
      [side < 0 ? -7 : 6.5, 0.2, -39.8],
      [side < 0 ? -6.5 : 7, 3.5, 0],
      "stone",
    );
  for (const z of [-18.7, -11.1])
    solid(
      "bank-column",
      0,
      [-6.5, 0.2, z - 0.4],
      [-5.7, 3.5, z + 0.4],
      "stone",
    );
  solid("street-atm", 0, [-6.91, 0.2, -8.75], [-6.05, 2.2, -7.85], "metal");
  for (const [side, z] of [
    [-1, -3],
    [1, -10],
    [-1, -22],
    [1, -32],
    [-1, -38],
  ])
    solid(
      "street-lamp",
      0,
      [side * 4.85 - 0.18, 0.2, z - 0.18],
      [side * 4.85 + 0.18, 5.3, z + 0.18],
      "metal",
    );
  for (const z of [-23.5, -27.4])
    for (const x of [-6.55, -5.05])
      solid(
        "shelter-post",
        0,
        [x - 0.05, 0.2, z - 0.05],
        [x + 0.05, 2.6, z + 0.05],
        "metal",
      );
  solid("shelter-glass", 0, [-6.6, 0.2, -27.4], [-6.5, 2.6, -23.5], "metal");
  solid(
    "shelter-roof",
    0,
    [-6.75, 2.53, -27.675],
    [-4.85, 2.69, -23.225],
    "metal",
  );
  solid(
    "shelter-poster",
    0,
    [-6.52, 0.2, -27.45],
    [-5.08, 2.5, -27.3],
    "metal",
  );
  solid(
    "shelter-bench",
    0,
    [-6.375, 0.2, -26.85],
    [-5.825, 0.73, -24.15],
    "metal",
  );
  solid("newspaper-box", 0, [4.885, 0.2, -5.9], [5.615, 1.41, -5.3], "metal");
  for (const [x, z] of [
    [6, -19.1],
    [-6.2, -31.5],
    [5.8, -34.3],
  ]) {
    solid(
      "street-bin",
      0,
      [x - 0.35, 0.2, z - 0.35],
      [x + 0.35, 1.2, z + 0.35],
      "metal",
    );
    solid(
      "street-bags",
      0,
      [x - 0.81, 0.2, z - 0.25],
      [x - 0.19, 0.8, z + 1.05],
      "stone",
    );
  }
  for (const [x, z] of [
    [-4.55, -35],
    [-4.6, -36.6],
    [3.8, -41.4],
  ])
    solid(
      "street-cone",
      0,
      [x - 0.2, 0.06, z - 0.2],
      [x + 0.2, 0.76, z + 0.2],
      "metal",
    );
  solid("street-signal", 0, [-4.9, 0, -40.5], [-4.7, 5.3, -40.3], "metal");
  for (const [x, z] of [
    [4.55, -2.1],
    [4.55, -7.3],
    [-4.6, -17.9],
  ])
    solid(
      "street-bollard",
      0,
      [x - 0.115, 0.2, z - 0.115],
      [x + 0.115, 1.16, z + 0.115],
      "metal",
    );
  solid("street-hydrant", 0, [5.76, 0.2, -9.88], [6.14, 1.065, -9.32], "metal");
  solid(
    "street-meter",
    0,
    [4.515, 0.2, -15.91],
    [4.785, 1.795, -15.68],
    "metal",
  );
  for (const [side, z] of [
    [-1, -1.1],
    [1, -21.1],
    [-1, -31.1],
  ])
    solid(
      "street-threshold",
      0,
      [side * 6.37 - 0.125, 0.2, z - 0.525],
      [side * 6.37 + 0.125, 0.34, z + 0.525],
      "stone",
    );
  for (const z of [-29.1, -36.5])
    solid(
      "street-lightwell",
      0,
      [-6.5, 0.2, z - 0.78],
      [-5.94, 1.03, z + 0.78],
      "metal",
    );
  // ALLEY + YARD (zones 1-2):
  // Open-front garage: the west opening faces the route and the genesis PC.
  solid("garage-wall", 2, [21.4, 0, -94], [27.5, 3.2, -93.7], "stone");
  solid("garage-wall", 2, [21.4, 0, -86.3], [27.5, 3.2, -86], "stone");
  solid("garage-wall", 2, [27.2, 0, -94], [27.5, 3.2, -86], "stone");
  solid("garage-wall", 2, [21.4, 0, -94], [21.65, 3.2, -92.4], "stone");
  solid("garage-wall", 2, [21.4, 0, -87.6], [21.65, 3.2, -86], "stone");
  solid("garage-header", 2, [21.4, 2.45, -92.4], [21.65, 3.2, -87.6], "metal");
  solid("garage-roof", 2, [21.2, 3.2, -94.15], [27.65, 3.4, -85.85], "metal");
  solid("yard-container", 2, [13, 0, -84.5], [15.6, 2.6, -77.5], "metal");
  solid("yard-pallets", 2, [13.1, 0, -92], [14.3, 0.65, -90.8], "wood");
  // Keep the drums inward: a raised prop beside the 2m fence becomes a jump boost.
  solid("yard-drums", 2, [22, 0, -80.8], [23.6, 0.95, -79.3], "metal");
  solid("garage-locker", 2, [25.9, 0, -93.5], [27, 1.6, -92.9], "metal");
  // Low salvage stays away from the fences and the required walking jumps.
  solid("alley-crate", 1, [3.175, 0, -46.6], [4.025, 0.72, -45.9], "wood");
  solid("alley-crate", 1, [7.45, 0, -46.7], [8.55, 0.5, -46], "wood");
  solid("alley-crate", 1, [15.55, 0, -46.6], [16.25, 0.35, -45.9], "wood");
  solid("alley-bags", 1, [5.18, 0, -46.64], [6.04, 0.44, -46.04], "stone");
  solid("alley-bike", 1, [12.6, 0, -46.5], [14.25, 0.17, -45.65], "metal");
  solid("alley-sign", 1, [18.08, 4.17, -53.18], [18.35, 5.13, -51.02], "metal");
  solid("alley-sign", 1, [18.06, 4.37, -67.98], [18.34, 5.33, -65.82], "metal");
  solid("alley-bars", 1, [18, 3.62, -54.62], [18.1, 4.57, -53.38], "metal");
  solid("alley-bars", 1, [21.9, 3.62, -64.92], [22, 4.57, -63.68], "metal");
  solid(
    "alley-bulkhead",
    1,
    [14.52, 2.34, -47.02],
    [14.88, 2.7, -46.89],
    "metal",
  );
  solid("yard-scrap-skip", 2, [21.7, 0, -104.5], [23.5, 1.15, -101.7], "metal");
  solid("yard-scrap-tarp", 2, [14.1, 0, -98.1], [16.6, 0.56, -96.5], "wood");
  solid("yard-scrap-reel", 2, [23.9, 0, -96.4], [24.8, 0.58, -95.5], "wood");
  solid("yard-scrap-reel", 2, [15.8, 0, -105.2], [16.9, 0.62, -104.1], "wood");
  solid(
    "garage-supply-shelves",
    2,
    [26.65, 0, -91.9],
    [27.15, 1.6, -89.7],
    "wood",
  );
  solid(
    "garage-supply-stool",
    2,
    [24.6, 0, -88.35],
    [25.08, 0.58, -87.87],
    "wood",
  );
  // Suspended service tray stops the PC becoming a step through the low roof.
  solid(
    "garage-supply-canopy",
    2,
    [21.7, 2.55, -91.3],
    [24.25, 2.68, -88.7],
    "metal",
  );
  // RIVER (zone 3):
  // HILLS (zones 4-6):
  // The oak is a backdrop beyond the summit wall; the trail stays clear.
  // STORY (owner: "story"):
  // --- End content solids ---------------------------------------------------
  function entity(s, offset = 0, height = 0) {
    const p = at(s, offset);
    return {
      ...p,
      y: groundY(p.x, p.z) + height,
      s,
      zone: Math.max(
        0,
        ZONES.findIndex((z) => s >= z.s0 && s < z.s1),
      ),
    };
  }
  const blocks = Array.from({ length: 10 }, (_, i) => {
    const s = 132.6 + i * 4.8,
      p = at(s, Math.sin((i / 9) * Math.PI * 2) * 0.65),
      y = 0.2 + (i % 3) * 0.2;
    const box = solid(
      "block",
      3,
      [p.x - 1.6, -4, p.z - 1.6],
      [p.x + 1.6, y, p.z + 1.6],
      "stone",
      { block: i },
    );
    return { ...p, y, s, zone: 3, size: 3.2, min: box.min, max: box.max };
  });
  const entities = {
    pages: [15, 54, 80, 112, 151.8, 194, 220, 248, 290].map((s, i) => {
      const p = entity(s, [2, 0, 0, -2, 0, 2, -2, 2, 0][i], 1.15);
      if (i === 2) p.y = 3.4;
      if (i === 4)
        Object.assign(p, {
          x: blocks[4].x,
          z: blocks[4].z,
          y: blocks[4].y + 1,
        });
      return p;
    }),
    coins: [10, 30, 53, 78, 104, 143, 200, 242, 283].flatMap((s, arc) =>
      Array.from({ length: arc < 4 ? 6 : 5 }, (_, i) =>
        entity(
          s + i * 0.65,
          arc % 2 ? -1 : 1,
          0.8 + Math.sin((i / 5) * Math.PI) * 1.2 + (arc === 3 ? 2.4 : 0),
        ),
      ),
    ),
    enemies: [22, 35, 57, 96, 119, 196, 215, 242, 261].map((s, i) => ({
      ...entity(s, i % 2 ? 3 : -3),
      kind: [
        "banker",
        "printer",
        "banker",
        "printer",
        "miner",
        "banker",
        "printer",
        "miner",
        "banker",
      ][i],
      size: [0.9, 0.9, 0.9],
      patrol: 1.1,
    })),
    hazards: [25, 38, 74.8, 80.4, 121, 207, 256].map((s, i) => ({
      ...entity(s, i === 2 || i === 3 ? 0 : 2.8),
      kind: i < 5 ? "electric" : "fire",
      size: [
        i === 2 || i === 3 ? 3.9 : 1.5,
        0.18,
        i === 2 || i === 3 ? 1.6 : 1.5,
      ],
    })),
    checkpoints: ZONES.slice(1).map((z, i) => ({
      ...entity(z.s0),
      index: i + 1,
      name: z.name,
    })),
    blocks,
    nodes: [185, 195, 205, 215, 225].map((s) => entity(s, 4.5)),
    genesis: {
      ...entity(110, 2),
      y: 1.4,
      id: "genesis",
      label: "MINE GENESIS · 03/Jan/2009",
    },
    bench: entity(248, -4),
    plinth: { ...entity(293), id: "whitepaper", label: "THE WHITEPAPER" },
  };
  // STORY (owner: "story"): seat-top props, PC support and the visible mast poles.
  for (const [kind, e, w, h, d] of [
    ["bench", entities.bench, 2, 0.9, 0.7],
    ["plinth", entities.plinth, 0.8, 1.2, 0.8],
    ["genesis-pc", { ...entities.genesis, y: 0.9 }, 0.52, 0.9, 0.35],
    ...entities.nodes.map((e) => ["node", e, 0.16, 4, 0.16]),
  ])
    solid(
      kind,
      e.zone,
      [e.x - w / 2, e.y, e.z - d / 2],
      [e.x + w / 2, e.y + h, e.z + d / 2],
      "stone",
      { owner: "story" },
    );
  // The river arc follows the actual block tops, never the submerged riverbed.
  for (const c of entities.coins)
    if (c.s >= 130 && c.s < 180) {
      const b = blocks.reduce((a, b) =>
        Math.abs(b.s - c.s) < Math.abs(a.s - c.s) ? b : a,
      );
      c.x = b.x;
      c.y = b.y + 1.2;
    }
  // Continue the two outside faces through gaps between boundary sections.
  // This prevents going around a fence end, or climbing over a wall via a prop.
  const boundaries = layout.filter(
    (b) => b.kind === "wall" || b.kind === "fence",
  );
  const sideBoundaries = boundaries.filter(
    (b) => b.max[2] - b.min[2] > b.max[0] - b.min[0],
  );
  const boundarySides = [true, false].map((west) => ({
    west,
    boxes: sideBoundaries.filter((b) => {
      const centreZ = (b.min[2] + b.max[2]) / 2;
      const centreX = (b.min[0] + b.max[0]) / 2;
      return centreX < at(routeS(centreX, centreZ)).x === west;
    }),
  }));
  function boundaryX(x, z) {
    for (const { west, boxes } of boundarySides) {
      let nearest = null,
        distance = Infinity;
      for (const b of boxes) {
        const d = Math.max(0, b.min[2] - z, z - b.max[2]);
        if (d < distance) {
          nearest = b;
          distance = d;
        }
      }
      if (nearest)
        x = west
          ? Math.max(x, nearest.min[0] + 0.23)
          : Math.min(x, nearest.max[0] - 0.23);
    }
    return x;
  }
  function create(hooks = {}) {
    const state = {
      player: {
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        grounded: true,
        surface: "asphalt",
      },
      progress: 0,
      zone: 0,
      rain: 1,
      genesisMined: false,
      blocks: blocks.map(() => ({ risen: 0, lit: false })),
      nodes: entities.nodes.map(() => ({ lit: false })),
      enemies: entities.enemies.map((e) => ({
        ...e,
        alive: true,
        squash: 0,
        heading: 0,
      })),
      pagesTaken: entities.pages.map(() => false),
      coinsTaken: entities.coins.map(() => false),
      fade: 0,
      shadow: 1,
      ending: 0,
      complete: false,
      time: 0,
      steps: 0,
      checkpoint: 0,
      safety: 0,
      timeOverride: null,
    };
    let coyote = 0.1,
      buffer = 0,
      respawn = 0,
      dead = false,
      miningAge = 0,
      stepAt = 0;
    const p = state.player,
      radius = 0.23;
    const sound = (type) =>
      hooks.sfx?.(type, { x: p.x, y: p.y, z: p.z, surface: p.surface });
    function enabled(b) {
      return b.block === undefined || state.blocks[b.block].risen >= 1;
    }
    function overlaps(x, z, b) {
      return (
        x + radius > b.min[0] &&
        x - radius < b.max[0] &&
        z + radius > b.min[2] &&
        z - radius < b.max[2]
      );
    }
    function hurt(water = false) {
      if (respawn > 0 || dead || (state.safety > 0 && !water)) return;
      sound(water ? "splash" : "hurt");
      if (hooks.death?.() === false) {
        dead = true;
        return;
      }
      respawn = 0.7;
      state.fade = 0;
      p.vx = p.vy = p.vz = 0;
    }
    function target() {
      const t = state.genesisMined ? entities.plinth : entities.genesis;
      const dx = t.x - p.x,
        dz = t.z - p.z,
        d = Math.hypot(dx, dz);
      if (
        d < 2.7 &&
        (d < 0.6 || (dx * -Math.sin(p.yaw) - dz * Math.cos(p.yaw)) / d > 0.25)
      )
        return t;
      return null;
    }
    function interact() {
      const t = target();
      if (!t) return false;
      if (t.id === "genesis") {
        state.genesisMined = true;
        sound("genesis");
      } else if (!state.ending) {
        state.ending = 0.001;
        sound("whitepaper");
      }
      return true;
    }
    function moveAxis(axis, delta) {
      if (delta === 0) return;
      let next = p[axis] + delta;
      if (axis === "x") next = boundaryX(next, p.z);
      // End faces also contain a player standing above the visible wall.
      if (axis === "z") {
        for (const b of boundaries) {
          if (
            b.max[0] - b.min[0] <= b.max[2] - b.min[2] ||
            p.x < b.min[0] - radius ||
            p.x > b.max[0] + radius
          )
            continue;
          const mid = (b.min[2] + b.max[2]) / 2;
          if (p.z >= mid && next < b.min[2] + radius) next = b.min[2] + radius;
          if (p.z < mid && next > b.max[2] - radius) next = b.max[2] - radius;
        }
      }
      const x = axis === "x" ? next : p.x,
        z = axis === "z" ? next : p.z;
      let step = p.y;
      for (const b of layout) {
        if (
          !enabled(b) ||
          !overlaps(x, z, b) ||
          p.y + 1.6 <= b.min[1] ||
          p.y >= b.max[1] - 0.001
        )
          continue;
        if (p.grounded && b.max[1] - p.y <= 0.301)
          step = Math.max(step, b.max[1]);
        else {
          p[axis === "x" ? "vx" : "vz"] = 0;
          return;
        }
      }
      // A step may not push the player's head through a low ceiling.
      if (
        step > p.y &&
        layout.some(
          (b) =>
            enabled(b) &&
            overlaps(x, z, b) &&
            b.min[1] < step + 1.6 &&
            b.max[1] > step + 0.001,
        )
      ) {
        p[axis === "x" ? "vx" : "vz"] = 0;
        return;
      }
      p[axis] = next;
      if (axis === "z") p.x = boundaryX(p.x, p.z);
      p.y = step;
    }
    function update(dt, input = {}) {
      if (state.complete || dead) return;
      state.time += dt;
      state.safety = Math.max(0, state.safety - dt);
      if (state.ending) {
        state.ending += dt;
        if (state.ending > 2.4) {
          state.complete = true;
          hooks.complete?.();
        }
        return;
      }
      if (respawn > 0) {
        const previous = respawn;
        respawn -= dt;
        state.fade = Math.sin(Math.PI * clamp(respawn / 0.7, 0, 1));
        if (previous > 0.35 && respawn <= 0.35) {
          const q = at(state.checkpoint ? ZONES[state.checkpoint].s0 : 0);
          Object.assign(p, q, {
            y: groundY(q.x, q.z),
            vx: 0,
            vy: 0,
            vz: 0,
            grounded: true,
            yaw: state.checkpoint === 1 ? -Math.PI / 2 : 0,
          });
        }
        if (respawn <= 0) {
          respawn = 0;
          state.fade = 0;
          state.safety = 1.5;
        }
        return;
      }
      if (input.throwPressed) interact();
      if (state.genesisMined) {
        miningAge += dt;
        state.blocks.forEach((b, i) => {
          const before = b.risen;
          b.risen = Math.max(
            b.risen,
            clamp((miningAge - i * 0.23) / 0.9, 0, 1),
          );
          if (!before && b.risen) hooks.sfx?.("block-rise", blocks[i]);
        });
      }
      buffer = input.jumpPressed ? 0.1 : Math.max(0, buffer - dt);
      coyote = p.grounded ? 0.1 : Math.max(0, coyote - dt);
      if (buffer > 0 && coyote > 0) {
        p.vy = Math.sqrt(35);
        p.grounded = false;
        coyote = buffer = 0;
        sound("jump");
      }
      let x = +!!input.right - +!!input.left,
        z = +!!input.down - +!!input.up;
      const n = Math.hypot(x, z) || 1,
        speed = input.fire ? 5.6 : 3.4,
        k = 1 - Math.exp(-(p.grounded ? 18 : 9) * dt),
        c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      x /= n;
      z /= n;
      p.vx += ((x * c + z * s) * speed - p.vx) * k;
      p.vz += ((z * c - x * s) * speed - p.vz) * k;
      moveAxis("x", p.vx * dt);
      moveAxis("z", p.vz * dt);
      const beforeY = p.y,
        wasGrounded = p.grounded;
      p.vy -= 14 * dt;
      p.y += p.vy * dt;
      p.grounded = false;
      let floor = groundY(p.x, p.z),
        surface =
          state.zone < 3
            ? "asphalt"
            : Math.abs(p.x - 20) > 2
              ? "grass"
              : "dirt",
        landedBlock = -1;
      for (const b of layout)
        if (enabled(b) && overlaps(p.x, p.z, b)) {
          if (beforeY >= b.max[1] - 0.31 && b.max[1] > floor) {
            floor = b.max[1];
            surface = b.surface;
            landedBlock = b.block ?? -1;
          }
          if (p.vy > 0 && beforeY + 1.6 <= b.min[1] && p.y + 1.6 > b.min[1]) {
            p.y = b.min[1] - 1.6;
            p.vy = 0;
          }
        }
      if (p.y <= floor && p.vy <= 0) {
        p.y = floor;
        p.vy = 0;
        p.grounded = true;
        p.surface = surface;
        if (!wasGrounded) sound("land");
        if (landedBlock >= 0 && !state.blocks[landedBlock].lit) {
          state.blocks[landedBlock].lit = true;
          sound("block-lock");
        }
      }
      if (p.y < WATER_Y && p.z < -111 && p.z > -158) {
        hurt(true);
        return;
      }
      const sNow = routeS(p.x, p.z);
      state.progress = Math.max(state.progress, clamp(sNow / 300, 0, 1));
      state.zone = Math.max(
        0,
        ZONES.findIndex((z) => sNow >= z.s0 && sNow < z.s1),
      );
      const weather = state.timeOverride ?? state.progress;
      state.rain = 1 - clamp((weather * 300 - 90) / 40, 0, 1);
      state.shadow = Math.min(state.shadow, 1 - clamp((sNow - 238) / 20, 0, 1));
      for (const cp of entities.checkpoints)
        if (sNow >= cp.s && cp.index === state.checkpoint + 1) {
          state.checkpoint = cp.index;
          hooks.checkpoint?.(cp.index, cp.name);
          sound("checkpoint");
        }
      state.steps += Math.hypot(p.vx, p.vz) * dt;
      if (p.grounded && state.steps - stepAt > 1.7) {
        stepAt = state.steps;
        sound("step");
      }
      for (const [list, taken, type] of [
        [entities.pages, state.pagesTaken, "page"],
        [entities.coins, state.coinsTaken, "coin"],
      ])
        list.forEach((e, i) => {
          if (
            !taken[i] &&
            Math.hypot(p.x - e.x, p.z - e.z) < 0.9 &&
            Math.abs(p.y + 0.9 - e.y) < 1.5
          ) {
            taken[i] = true;
            sound(type);
            if (type === "page") hooks.page?.();
            else hooks.reward?.(1, 100);
          }
        });
      state.enemies.forEach((e, i) => {
        if (!e.alive) {
          e.squash = Math.min(1, e.squash + dt * 4);
          return;
        }
        const origin = entities.enemies[i];
        e.x = origin.x + Math.sin(state.time * 1.5 + i) * origin.patrol;
        e.heading =
          Math.cos(state.time * 1.5 + i) > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (
          Math.hypot(p.x - e.x, p.z - e.z) < 0.7 &&
          p.y < e.y + 0.93 &&
          p.y + 1.6 > e.y
        ) {
          if (p.vy < 0 && beforeY >= e.y + 0.85) {
            e.alive = false;
            p.vy = 4.8;
            p.grounded = false;
            hooks.reward?.(3, 500);
            sound("stomp");
          } else hurt();
        }
      });
      for (const h of entities.hazards)
        if (
          Math.abs(p.x - h.x) < h.size[0] / 2 + radius &&
          Math.abs(p.z - h.z) < h.size[2] / 2 + radius &&
          p.y < h.y + h.size[1]
        )
          hurt();
      entities.nodes.forEach((e, i) => {
        if (!state.nodes[i].lit && sNow >= e.s) {
          state.nodes[i].lit = true;
          hooks.sfx?.("node-link", e);
        }
      });
      // Level 1 is ANY%: pages are optional and reported, never a finish gate.
      if (
        state.genesisMined &&
        Math.hypot(p.x - entities.plinth.x, p.z - entities.plinth.z) < 1.4 &&
        !state.ending
      ) {
        state.ending = 0.001;
        sound("whitepaper");
      }
    }
    return {
      state,
      update,
      target,
      interact,
      objective: () =>
        state.ending ? "Bitcoin lives." : ZONES[state.zone].text,
      snapshot: () =>
        JSON.parse(
          JSON.stringify({ ...state, interactable: target()?.id ?? null }),
        ),
    };
  }
  return {
    create,
    ZONES,
    route,
    layout,
    groundY,
    WATER_Y,
    entities,
    at,
    routeS,
  };
});
