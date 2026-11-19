// HASH WARS. Deterministic metres, Y up. Player y is feet; eye is +1.68.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HashWars = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const ZONES = [
    ["LANDFALL", 0, 60, "The Cartel holds 51%. Get off the beach."],
    ["THE PIPELINE", 60, 150, "Follow the pipeline. Take back the wellhead."],
    ["THE CAUSEWAY", 150, 230, "Cross the causeway. Mind the watchers."],
    ["THE FINS", 230, 310, "Take back the fins."],
    ["THE GATE", 310, 390, "Break the siege engine."],
    ["THE CHAIN HOLDS", 390, 430, "Light the beacon. The chain holds."],
  ].map(([name, s0, s1, text]) => ({ name, s0, s1, text }));
  const ENDING_SECONDS = 9.5;
  const CLIMB_RESPAWN_S = 55.1;
  const ENDING_CUES = [
    [4.4, "hashrate-drop"],
    [5, "station-relight"],
    [5.8, "station-relight"],
    [6.6, "station-relight"],
    [7.4, "station-relight"],
    [8.4, "checkpoint"],
  ];
  const SEA_Y = -1;
  // Route distance s is measured northward (-Z); the gentle lateral bends do not
  // change checkpoint coordinates. The same ground anchors cover and feet.
  const route = [
    [0, 0],
    [0, -60],
    [8, -110],
    [0, -150],
    [0, -230],
    [-8, -270],
    [0, -310],
    [0, -390],
    [0, -430],
  ];
  function at(s) {
    s = clamp(s, 0, 430);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      if (s <= -b[1]) {
        const t = (s + a[1]) / (a[1] - b[1]);
        return { x: a[0] + (b[0] - a[0]) * t, z: -s };
      }
    }
    return { x: 0, z: -430 };
  }
  const routeS = (_x, z) => clamp(-z, 0, 430);
  function zoneAt(z) {
    return Math.max(
      0,
      ZONES.findLastIndex((q) => -z >= q.s0),
    );
  }
  // Water positions are metres; width is the full wet channel width. Flow is
  // in array order, from the valley spring to the lip above the gorge.
  const river = [
    { x: 20, z: -67, y: 10.2, width: 3.2 },
    { x: 22, z: -88, y: 8.8, width: 4 },
    { x: 21, z: -111, y: 6.3, width: 4.8 },
    { x: 19, z: -135, y: 3.4, width: 5.2 },
    { x: 18, z: -156, y: 1, width: 6 },
  ];
  const waterfall = {
    top: { x: 18, y: 1, z: -156 },
    foot: { x: 18, y: -14, z: -166 },
    width: 6,
  };
  function groundY(x, z) {
    const s = -z,
      centre = at(s).x;
    const rise =
      12 * smooth(15, 60, s) +
      10 * smooth(68, 145, s) +
      12 * smooth(225, 252, s) +
      14 * smooth(302, 337, s) +
      12 * smooth(388, 429, s);
    // Shelving horseshoe bay, broad glacial valley, then rounded highland.
    const width = 24 + 3 * Math.sin(s * 0.037) + 10 * smooth(225, 260, s);
    const lateral = Math.abs(x - centre + 1.6 * Math.sin(s * 0.09));
    const bank = 23 * smooth(width, width + 13, lateral);
    const path = 1 - 0.78 * (1 - smooth(2, 9, Math.abs(x - centre)));
    const detail =
      (0.65 * Math.sin(x * 0.19 + s * 0.12) +
        0.32 * Math.sin(x * 0.43 - s * 0.23) +
        1.1 * Math.sin(s * 0.055)) *
      smooth(12, 28, s) *
      (1 - smooth(415, 430, s)) *
      path;
    let y = rise + bank + detail;
    // Shoreline bows inland at the centre; no straight seawall.
    y -= 5 * smooth(2 + x * x * 0.018, 24 + x * x * 0.018, z);
    // Continuous gorge BELOW the bridge, including its centre line.
    const gorge = smooth(150, 163, s) * (1 - smooth(211, 225, s));
    y = y * (1 - gorge) + (-16 + 0.5 * Math.sin(x * 0.17)) * gorge;
    // Incised river: flatten only the wet bed, blend steep banks to the valley.
    for (let i = 1; i < river.length; i++) {
      const a = river[i - 1],
        b = river[i];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = clamp(
        ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz),
        0,
        1,
      );
      const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      const half = (a.width + (b.width - a.width) * t) / 2;
      // Open the near bank to the track, preserving its central ten metres.
      // A convex shelf avoids hiding the entire river behind a smooth lip.
      const rx = a.x + dx * t;
      const nearSpan = Math.max(4, rx - at(-z).x - 5 - half);
      const weight =
        x < rx
          ? 1 - Math.pow(clamp((distance - half) / nearSpan, 0, 1), 1.6)
          : 1 - smooth(half, half + 4, distance);
      const bed = a.y + (b.y - a.y) * t - 1.2;
      y = Math.min(y, y * (1 - weight) + bed * weight);
    }
    // Far summit closes in as a rocky ridge beyond the beacon.
    return y + 22 * smooth(434, 445, s);
  }
  // Surface height only inside a water body; dry land returns -Infinity.
  function waterY(x, z) {
    if (z > 0) return SEA_Y;
    if (-z > 150 && -z < 225 && groundY(x, z) < waterfall.foot.y)
      return waterfall.foot.y;
    for (let i = 1; i < river.length; i++) {
      const a = river[i - 1],
        b = river[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = clamp(
        ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz),
        0,
        1,
      );
      if (
        Math.hypot(x - a.x - dx * t, z - a.z - dz * t) <
        (a.width + (b.width - a.width) * t) / 2
      )
        return a.y + (b.y - a.y) * t;
    }
    return -Infinity;
  }
  // March across wet and dry stretches, then refine the first entry.
  // A projectile already below the surface has no entry to report.
  function waterCrossing(o, d, max) {
    if (max <= 0 || o[1] < waterY(o[0], o[2])) return null;
    let lo = 0;
    for (let t = Math.min(0.2, max); ; t = Math.min(t + 0.5, max)) {
      let waterHeight = waterY(o[0] + d[0] * t, o[2] + d[2] * t);
      if (o[1] + d[1] * t <= waterHeight) {
        let hi = t;
        for (let j = 0; j < 14; j++) {
          const m = (lo + hi) / 2,
            height = waterY(o[0] + d[0] * m, o[2] + d[2] * m);
          if (o[1] + d[1] * m > height) lo = m;
          else {
            hi = m;
            waterHeight = height;
          }
        }
        return { distance: hi, waterHeight };
      }
      if (t === max) return null;
      lo = t;
    }
  }
  function impactPoint(o, d, { distance, waterHeight }) {
    return [
      o[0] + d[0] * distance,
      waterHeight ?? o[1] + d[1] * distance,
      o[2] + d[2] * distance,
    ];
  }
  function impactNormal(d, normal) {
    // A ray that starts inside an envelope has no entry face.
    return normal.some(Boolean) ? normal : d.map((v) => -v);
  }
  function groundSurface(x, y, z, up) {
    // Approximate LAND's dominant material without sampling its shader noise.
    const s = -z;
    if (up < 0.705 || s > 397) return "rock";
    if (y < SEA_Y + 3.3) return "sand";
    if (s > 63 && s < 129 && Math.abs(x - at(s).x + 14) < 3.1) return "rock"; // Crushed ballast under the pipeline.
    return "grass";
  }
  function routeY(x, z) {
    return z <= -150 && z >= -225 && Math.abs(x) <= 4.5 ? 22 : groundY(x, z);
  }
  const steamVents = [
    [-14, -102],
    [16, -276],
    [-22, -354],
  ].map(([x, z]) => ({ x, y: groundY(x, z), z }));
  const MAX_SLOPE = 1.05; // rise/run, about 46 degrees; steps still use 0.35 m.
  const PLAYER_HEIGHT = 1.9;
  const PLAYER_RADIUS = 0.28;
  const CONTACT_EPSILON = 0.001;
  const MACHINE_CLEARANCE = 0.15;
  const WEAPONS = {
    carbine: {
      name: "CARBINE",
      mag: 32,
      spare: 320,
      damage: 18,
      shield: 0.5,
      hull: 1,
      interval: 0.1,
      reload: 1.7,
      pellets: 1,
      spread: 0.007,
    },
    scatter: {
      name: "SCATTERGUN",
      mag: 6,
      spare: 48,
      damage: 18,
      shield: 0.7,
      hull: 1,
      interval: 0.8,
      reload: 2.2,
      pellets: 8,
      spread: 0.11,
    },
    rail: {
      name: "RAIL RIFLE",
      mag: 4,
      spare: 32,
      damage: 150,
      shield: 1,
      hull: 1,
      interval: 1.05,
      reload: 2.4,
      pellets: 1,
      spread: 0,
      charge: 0.35,
    },
    arc: {
      name: "ARC CASTER",
      mag: 0,
      spare: 0,
      damage: 16,
      shield: 3,
      hull: 0.4,
      interval: 0.09,
      reload: 0,
      pellets: 1,
      spread: 0.012,
    },
  };
  const MACHINES = {
    gnat: {
      hp: 36,
      shield: 0,
      r: 0.38,
      height: 0.7,
      centre: 2.5,
      muzzle: [0, 2.46, 0.53],
      range: 16,
      speed: 2,
      damage: 6,
      delay: 2.8,
    },
    strider: {
      hp: 110,
      shield: 60,
      r: 0.65,
      height: 2.4,
      centre: 1.35,
      muzzle: [0, 1.62, 1.28],
      range: 20,
      speed: 1.6,
      damage: 10,
      delay: 3.4,
    },
    watcher: {
      hp: 65,
      shield: 0,
      r: 0.5,
      height: 3,
      centre: 1.9,
      muzzle: [0, 2.76, 0.67],
      range: 55,
      speed: 0,
      damage: 32,
      delay: 4.8,
    },
    bulwark: {
      hp: 300,
      shield: 0,
      r: 1.5,
      height: 3,
      centre: 1.5,
      muzzle: [0, 2.94, 0.575],
      range: 28,
      speed: 0.6,
      damage: 24,
      delay: 5,
    },
    turret: {
      hp: 90,
      shield: 0,
      r: 0.6,
      height: 1.2,
      centre: 1,
      muzzle: [0, 1.05, 0.92],
      range: 40,
      speed: 0,
      damage: 8,
      delay: 3,
    },
  };
  const point = (s, x = at(s).x) => ({
    s,
    x,
    z: -s,
    y: routeY(x, -s),
    zone: zoneAt(-s),
  });
  const layout = [];
  function box(kind, zone, x, z, w, h, d, surface = "rock", extra = {}) {
    const y = kind === "parapet" ? 22 : routeY(x, z);
    layout.push({
      kind,
      zone,
      shape: "box",
      min: [x - w / 2, y, z - d / 2],
      max: [x + w / 2, y + h, z + d / 2],
      surface,
      ...extra,
    });
  }
  // Built parapets remain solids. Natural banks are bounded by their slope.
  for (let s = 155; s <= 220; s += 10)
    for (const x of [-5, 5])
      box("parapet", 2, x, -s, 1, 1.25, 10.2, "concrete");
  layout.push({
    kind: "bridge",
    zone: 2,
    shape: "box",
    min: [-4.5, 21, -225],
    max: [4.5, 22, -150],
    surface: "concrete",
  });
  for (const [zone, s, x] of [
    [0, 30, -6],
    [0, 43, 5],
    [1, 80, -6],
    [1, 95, 14],
    [1, 114, -8],
    [1, 132, 11],
    [2, 170, -2.8],
    [2, 190, 2.8],
    [2, 211, -2.8],
    [3, 250, 8],
    [3, 265, -17],
    [3, 283, 8],
    [3, 294, -15],
    [4, 329, -9],
    [4, 346, 9],
    [4, 366, -8],
  ])
    box("cover", zone, x, -s, 3, 1.3, 2.5, "rock");
  // LAND solids BEGIN — visible basalt and collision share these placements.
  // Wall boxes sit on the impassable banks, clear of the original combat lane.
  // Their dimensions are the dressed mesh bounds; no route cover is moved.
  const landBox = (asset, role, zone, x, z, w, h, d, base, yaw = 0) => {
    layout.push({
      kind: "cliff",
      owner: "land",
      landRole: role,
      zone,
      shape: "box",
      min: [x - w / 2, base, z - d / 2],
      max: [x + w / 2, base + h, z + d / 2],
      surface: "rock",
      asset,
      yaw,
    });
  };
  // The high cataract pours off the east bank beside the causeway. The river
  // retains its lower outlet; both share the same authoritative plunge pool.
  waterfall.cataract = {
    top: { x: 70, y: 34, z: -183 },
    foot: { x: 57, y: -14, z: -183 },
    width: 18,
  };
  // Broad tiered masses cover the entire bank, not just its foot. Their
  // outer crowns meet the plateau; front columns leave the combat lane clear.
  for (let s = -32, row = 0; s < 438; s += 15.2, row++) {
    if (s > 143 && s < 239) continue;
    for (const side of [-1, 1]) {
      const centre = at(Math.max(0, s)).x;
      let edge = 20;
      while (
        edge < 44 &&
        groundY(centre + side * (edge + 0.5), -s) -
          groundY(centre + side * (edge - 0.5), -s) <
          1.1
      )
        edge += 0.5;
      const z = -s,
        x = centre + side * (edge + 5);
      const base =
        Math.min(
          ...[-7.8, 0, 7.8].map((dz) =>
            groundY(centre + side * (edge - 3), z + dz),
          ),
        ) - 2;
      const skyline = Math.max(
        ...[-7.8, 0, 7.8].map((dz) =>
          groundY(centre + side * (edge + 13), z + dz),
        ),
      );
      landBox(
        "escarpment_" + (row % 2),
        "column-wall",
        zoneAt(z),
        x,
        z,
        16,
        Math.max(24, skyline - base + 3),
        18,
        base,
        (-side * Math.PI) / 2,
      );
      if (row % 2 === 0 && s > 10) {
        const bx = centre + side * (edge - 4),
          bz = z + 2;
        landBox(
          "boulder_" + (row % 4),
          "boulder",
          zoneAt(bz),
          bx,
          bz,
          3.3,
          1.9,
          3.1,
          groundY(bx, bz) - 0.7,
        );
        // Wide, low fracture debris roots the regular cooling columns.
        for (const offset of [-3.8, 3.4]) {
          const tx = centre + side * (edge - 2.5),
            tz = z + offset;
          const floor =
            Math.min(
              ...[-2.6, 0, 2.6].flatMap((dx) =>
                [-3.4, 0, 3.4].map((dz) => groundY(tx + dx, tz + dz)),
              ),
            ) - 0.4;
          landBox(
            "boulder_" + (offset < 0 ? 2 : 3),
            "talus",
            zoneAt(tz),
            tx,
            tz,
            5.2,
            2.2,
            6.8,
            floor,
          );
        }
      }
    }
  }
  // The gorge's head wall grows from below the plunge pool to the plateau.
  // Keep the bridge and the fanning fall (x=9..26) completely clear.
  // The chasm cuts east-west across the valley. Both walls are dressed, and
  // two column masses close it at x = +-76 so it reads as a gorge, not a
  // canal to the sea. The north wall stays clear of the bridge (|x| < 20).
  for (const [x, width] of [
    [-62, 16],
    [-46, 18],
    [-30, 18],
    [-14, 14],
    [35, 18],
    [51, 18],
    [66, 14],
  ]) {
    const z = -156.5,
      base = -18;
    const top = Math.max(
      groundY(x, -148),
      groundY(x - width / 2, -148),
      groundY(x + width / 2, -148),
    );
    landBox(
      "gorge_mass",
      "gorge-wall",
      2,
      x,
      z,
      width,
      top - base + 2,
      14,
      base,
      Math.PI,
    );
  }
  for (const x of [-60, -44, -28, 28, 44, 60]) {
    const z = -218,
      base = -18,
      width = 16;
    const top = Math.max(
      groundY(x, -226),
      groundY(x - width / 2, -226),
      groundY(x + width / 2, -226),
    );
    landBox(
      "gorge_mass",
      "gorge-wall",
      2,
      x,
      z,
      width,
      top - base + 2,
      14,
      base,
      0,
    );
  }
  for (const side of [-1, 1]) {
    const x = side * 77,
      top = Math.max(groundY(x, -148), groundY(x, -226), 24);
    for (const z of [-167, -182, -197, -211])
      landBox(
        "gorge_mass",
        "gorge-wall",
        2,
        x,
        z,
        14,
        top + 20,
        16,
        -18,
        (side * -Math.PI) / 2,
      );
  }
  // Column ends form a broken stair beside the existing walkable cove path.
  for (let s = 24, i = 0; s < 58; s += 2.1, i++) {
    const x = at(s).x - 5.1 - 0.35 * Math.sin(i * 1.3),
      z = -s;
    landBox(
      "stair_tread",
      "step",
      0,
      x,
      z,
      3.2,
      2.4,
      1.1,
      groundY(x, z - 0.55) - 2.32,
    );
  }
  // Broad column crowns are the walking stair. The tallest authored rise is
  // .31 m, below the .35 m step limit; a broad central lane stays open.
  for (let s = 24; s < 58; s += 0.75) {
    const x = at(s).x,
      z = -s,
      floor = groundY(x, z);
    // Ease the first few tops up so the player's radius can reach the first
    // riser from bare ground; later tops clear the uphill terrain edge.
    const blend = Math.min(1, (s - 24) / 4.5);
    const top =
      floor +
      0.1 +
      blend * (groundY(x, z - 0.4) + 0.08 - floor - 0.1) +
      0.18 * smooth(49, 55, s) -
      0.14 * smooth(56, 58, s);
    const width = 6 + 0.55 * Math.sin(s * 1.7);
    landBox("stair_tread", "stair-tread", 0, x, z, width, 2.4, 0.8, top - 2.4);
  }
  // Thick column crowns break the turf beside the top of the cove stair.
  // They stand 0.25-0.6 m proud, so they are solid (above the step limit).
  for (const [s, dx] of [
    [47, 6.3],
    [53, 7.8],
    [59, 6.6],
    [50, -9.4],
    [57, -8.2],
    [63, 9.5],
  ]) {
    const x = at(s).x + dx,
      z = -s;
    const floor = Math.min(
      ...[-2, 0, 2].flatMap((ox) =>
        [-2, 0, 2].map((oz) => groundY(x + ox, z + oz)),
      ),
    );
    landBox(
      "crown_field",
      "crown",
      s < 60 ? 0 : 1,
      x,
      z,
      5,
      1.2 + Math.max(...[-2, 0, 2].map((o) => groundY(x + o, z + o))) - floor,
      5,
      floor - 0.6,
      s * 1.7,
    );
  }
  // Full-depth column tiers dress the 22 m rise behind the beacon. A thin
  // front row left the smooth bank exposed; these extend through its crest.
  // Their nearest face is beyond the final platform and the walkable route.
  for (let i = -1; i < 8; i++) {
    const x = at(430).x - 40 + i * 13.4,
      z = -445 - 0.6 * Math.sin(i * 0.7);
    const height = Math.max(
      38 + 1.5 * Math.sin(i * 2.4),
      groundY(x, z - 3) - 58 + 17,
    );
    landBox("gorge_mass", "summit-wall", 5, x, z, 14.8, height, 20, 58);
  }
  // WATER reads these cylinders for white water at the authored stacks' feet.
  for (let i = 0; i < 6; i++) {
    layout.push({
      kind: "cliff",
      landRole: "sea-stack",
      owner: "land",
      zone: 0,
      shape: "cyl",
      x: route[0][0] + (i % 2 ? 1 : -1) * (18 + i * 8 + 6 * Math.sin(i * 2.3)),
      z: route[0][1] + 150 + i * 12 + 8 * Math.sin(i * 1.7),
      r: 5 + 1.5 * (0.5 + 0.5 * Math.sin(i * 2.15)),
      y0: SEA_Y - 13,
      y1: SEA_Y + 14 + 13 * (0.5 + 0.5 * Math.sin(i * 2.71 + 0.9)),
      yaw: i * 2.399963,
      surface: "rock",
      asset: "sea_stack_" + (i % 2),
      far: true,
    });
  }
  // The inherited cover hulls keep their tops and footprints. Extend their
  // hidden lower bounds to the same ground-rooted base the basalt mesh uses.
  for (const [i, solid] of layout.filter((b) => b.kind === "cover").entries()) {
    const cx = (solid.min[0] + solid.max[0]) / 2;
    const cz = (solid.min[2] + solid.max[2]) / 2;
    const onDeck = solid.min[1] - groundY(cx, cz) > 2;
    solid.min[1] = onDeck
      ? solid.min[1]
      : Math.min(
          solid.min[1] - 0.25,
          ...[solid.min[0], solid.max[0]].flatMap((x) =>
            [solid.min[2], solid.max[2]].map((z) => groundY(x, z) - 0.25),
          ),
        );
    solid.landGrounded = true;
    solid.rockProfile = "boulder_" + (i % 4);
  }
  // LAND solids END
  const entities = {
    pages: [
      point(12, -2),
      point(54, 2),
      point(92, 6),
      point(143, -3),
      point(201, 1),
      point(253, -5),
      point(302, 3),
      point(371, -3),
      point(417, 2),
    ],
    stashes: [point(37, -10), point(108, 16), point(256, -21), point(351, 18)],
    checkpoints: ZONES.slice(1).map((q, i) => ({
      ...point(q.s0),
      index: i + 1,
      name: q.name,
    })),
    pickups: [
      { ...point(76), kind: "ammo" },
      { ...point(146), kind: "scatter", station: 0 },
      { ...point(152), kind: "rail" },
      { ...point(236), kind: "ammo" },
      { ...point(278, -5), kind: "charges" },
      { ...point(314), kind: "ammo" },
      { ...point(350), kind: "ammo" },
    ].map((e, id) => ({ ...e, id })),
    cover: layout
      .filter((b) => b.kind === "cover")
      .map((b) => ({
        x: (b.min[0] + b.max[0]) / 2,
        z: b.max[2] + 1,
        y: b.min[1],
        zone: b.zone,
      })),
    stations: [
      { ...point(137, 0), index: 0 },
      { ...point(293, -4), index: 1 },
      { ...point(377, 12), index: 2 },
    ].map((e) => ({
      ...e,
      id: "station-" + e.index,
      pylon: { ...e },
      spire: { ...e, x: e.x + 9 },
    })),
    clamps: [point(365, -5), point(372, 0), point(380, 5)].map((e, index) => ({
      ...e,
      y: e.y + 2,
      index,
      id: "clamp-" + index,
    })),
    turrets: [point(360, 13), point(378, -14)],
    beacon: { ...point(427), id: "beacon", label: "LIGHT THE BEACON" },
    pod: point(0, 6),
    spawns: [],
    crates: [],
  };
  for (const e of entities.stations) {
    box("pylon", e.zone, e.x, e.z, 0.65, 1.5, 0.65, "stone", {
      asset: "control-pylon",
    });
    box("spire", e.zone, e.spire.x, e.z, 2, 30, 2, "stone", { asset: "spire" });
  }
  box("beacon", 5, 0, -427, 1, 1, 1, "concrete");
  for (const [zone, s, kinds] of [
    [0, 24, ["gnat", "gnat", "gnat"]],
    [0, 48, ["gnat", "gnat", "gnat"]],
    [1, 83, ["strider", "gnat", "gnat", "strider"]],
    [1, 125, ["strider", "strider", "gnat", "gnat", "gnat"]],
    [2, 184, ["watcher", "gnat", "gnat"]],
    [2, 217, ["watcher", "watcher", "gnat"]],
    [3, 258, ["strider", "strider", "gnat", "gnat", "gnat"]],
    [3, 286, ["bulwark", "strider", "gnat", "gnat"]],
    [4, 340, ["strider", "strider", "gnat", "gnat", "gnat"]],
    [4, 373, ["strider", "strider", "gnat", "gnat", "gnat"]],
  ]) {
    kinds.forEach((kind, i) => {
      const x =
        zone === 2
          ? i % 2
            ? 2.5
            : -2.5
          : at(s).x + (i % 2 ? 1 : -1) * (4 + Math.floor(i / 2) * 3);
      entities.spawns.push({
        ...point(s + i * 2, x),
        zone,
        kind,
        id: entities.spawns.length,
      });
    });
  }
  entities.turrets.forEach((e) =>
    entities.spawns.push({ ...e, kind: "turret", id: entities.spawns.length }),
  );
  box("pod", 0, 6, 0, 4, 3, 6, "stone", { asset: "drop-pod" });
  // Delivered vertical body envelope, excluding remote clamps and turrets.
  const siege = {
    origin: { x: 21, y: 48.83713472696438, z: -377 },
    landing: { x: -19, y: 0, z: -378 },
  };
  siege.landing.y =
    Math.max(
      ...[-30, -25, -19, -13, -8].flatMap((x) =>
        [-381, -378, -375].map((z) => groundY(x, z)),
      ),
    ) + 2.47;
  layout.push({
    kind: "siege-hull",
    zone: 4,
    shape: "box",
    surface: "metal",
    dynamic: "boss",
    min: [13.28, siege.origin.y + 5, -379.805],
    max: [18.88, siege.origin.y + 27, -374.476],
  });
  // Authoritative root transform: tip about the body centre, then land downslope.
  function siegePose(t, out = {}) {
    const u = smooth(0, 1, t),
      roll = (u * Math.PI) / 2;
    const cx =
      siege.origin.x - 5.3 + (siege.landing.x - (siege.origin.x - 5.3)) * u;
    const cy =
      siege.origin.y + 16 + (siege.landing.y - (siege.origin.y + 16)) * t * t;
    out.x = cx + 5.3 * Math.cos(roll) + 16 * Math.sin(roll);
    out.y = cy + 5.3 * Math.sin(roll) - 16 * Math.cos(roll);
    out.z = siege.origin.z + (siege.landing.z - siege.origin.z) * u;
    out.roll = roll;
    return out;
  }
  // STORY solids BEGIN — conservative container/lid envelopes from its report.
  layout.push(
    ...[
      {
        kind: "story-equipment",
        owner: "story",
        zone: 1,
        shape: "box",
        min: [2.02, 12.110851864203935, -76.38],
        max: [3.1, 12.920851864203936, -75.62],
        surface: "metal",
        asset: "ammo_crate",
        pickupId: 0,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 1,
        shape: "box",
        min: [-0.2300000000000002, 24.265951653359913, -145.565],
        max: [1.8299999999999998, 25.023951653359912, -143.683],
        surface: "metal",
        asset: "weapon_rack_open",
        pickupId: 1,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 1,
        shape: "box",
        min: [-0.4500000000000002, 22.03795165335991, -146.5],
        max: [2.05, 24.55795165335991, -145.5],
        surface: "metal",
        asset: "weapon_rack_open",
        pickupId: 1,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 2,
        shape: "box",
        min: [-0.89, 22.28, -152.711],
        max: [0.89, 23.139, -152.35],
        surface: "metal",
        asset: "weapon_case_open",
        pickupId: 2,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 2,
        shape: "box",
        min: [-0.9, 22, -152.43],
        max: [0.9, 22.52, -151.57],
        surface: "metal",
        asset: "weapon_case_open",
        pickupId: 2,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 3,
        shape: "box",
        min: [-1.74, 26.54482204474574, -236.38],
        max: [-0.6599999999999999, 27.354822044745738, -235.62],
        surface: "metal",
        asset: "ammo_crate",
        pickupId: 3,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 3,
        shape: "box",
        min: [-5.54, 34.22628496586627, -278.38],
        max: [-4.46, 35.03628496586627, -277.62],
        surface: "metal",
        asset: "ammo_crate_b",
        pickupId: 4,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 4,
        shape: "box",
        min: [-0.54, 37.56135127036307, -314.38],
        max: [0.54, 38.37135127036307, -313.62],
        surface: "metal",
        asset: "ammo_crate",
        pickupId: 5,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 4,
        shape: "box",
        min: [-0.54, 48.02840561561603, -350.38],
        max: [0.54, 48.83840561561603, -349.62],
        surface: "metal",
        asset: "ammo_crate",
        pickupId: 6,
        part: 0,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 1,
        shape: "box",
        min: [1.9500000000000002, 12.690851864203935, -76.71],
        max: [3.17, 13.540851864203935, -76.34],
        surface: "metal",
        asset: "temporary-crate-lid",
        pickupId: 0,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 3,
        shape: "box",
        min: [-1.81, 27.124822044745738, -236.71],
        max: [-0.59, 27.97482204474574, -236.34],
        surface: "metal",
        asset: "temporary-crate-lid",
        pickupId: 3,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 3,
        shape: "box",
        min: [-5.61, 34.80628496586627, -278.71],
        max: [-4.39, 35.65628496586627, -278.34],
        surface: "metal",
        asset: "temporary-crate-lid",
        pickupId: 4,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 4,
        shape: "box",
        min: [-0.61, 38.14135127036307, -314.71],
        max: [0.61, 38.99135127036307, -314.34],
        surface: "metal",
        asset: "temporary-crate-lid",
        pickupId: 5,
        part: 1,
      },
      {
        kind: "story-equipment",
        owner: "story",
        zone: 4,
        shape: "box",
        min: [-0.61, 48.60840561561603, -350.71],
        max: [0.61, 49.45840561561603, -350.34],
        surface: "metal",
        asset: "temporary-crate-lid",
        pickupId: 6,
        part: 1,
      },
    ],
  );
  // STORY solids END

  // STATIONS solids BEGIN — equipment, its level footings, and route architecture.
  // Origins and collision shapes are the authored kit's metre-scale contract.
  // Full-size control pedestal: keep render and player/bullet contact aligned.
  for (const e of entities.stations) {
    const pylon = layout.find((b) => b.kind === "pylon" && b.zone === e.zone);
    if (pylon) {
      pylon.min = [e.x - 0.65, e.y, e.z - 0.65];
      pylon.max = [e.x + 0.65, e.y + 2.35, e.z + 0.65];
    }
  }
  const stationKit = {
    terrace_wall: {
      file: "citadel.glb",
      surface: "stone",
      solids: [
        { shape: "box", min: [-6.0, 0.0, -1.0], max: [6.0, 2.7, 1.0] },
        {
          shape: "box",
          min: [-5.98, 0.05, 0.96],
          max: [-3.02, 2.6, 1.24],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [-2.98, 0.05, 0.96],
          max: [-0.02, 2.6, 1.24],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [0.02, 0.05, 0.96],
          max: [2.98, 2.6, 1.24],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [3.02, 0.05, 0.96],
          max: [5.98, 2.6, 1.24],
          surface: "concrete",
        },
        { shape: "box", min: [-6.05, 2.7, -1.1], max: [6.05, 3.0, 1.1] },
      ],
      min: [-6.05, 0.0, -1.1],
      max: [6.05, 3.0, 1.3],
    },
    summit_beacon: {
      file: "citadel.glb",
      surface: "stone",
      solids: [
        { shape: "box", min: [-1.3, 0.0, -1.3], max: [1.3, 0.3, 1.3] },
        {
          shape: "box",
          min: [-0.8, 0.3, -0.8],
          max: [0.8, 1.7, 0.8],
          surface: "concrete",
        },
        { shape: "box", min: [-0.85, 0.3, -0.85], max: [0.85, 7.85, 0.85] },
      ],
      min: [-1.3, 0.0, -1.3],
      max: [1.3, 7.525, 1.3],
    },
    whitepaper_monument: {
      file: "citadel.glb",
      surface: "stone",
      solids: [
        { shape: "box", min: [-3.0, 0.0, -1.25], max: [3.0, 0.25, 1.25] },
        { shape: "box", min: [-2.8, 0.25, -0.95], max: [2.8, 3.0, 0.95] },
      ],
      min: [-3.0, 0.0, -1.25],
      max: [3.0, 3.0, 1.25],
    },
    cover_wall: {
      file: "props.glb",
      surface: "concrete",
      solids: [{ shape: "box", min: [-1.5, 0, -1.25], max: [1.5, 1.3, 1.25] }],
      min: [-1.5, 0.0, -1.275],
      max: [1.5, 1.315, 1.325],
    },
    cover_wall_b: {
      file: "props.glb",
      surface: "concrete",
      solids: [{ shape: "box", min: [-1.5, 0, -1.25], max: [1.5, 1.3, 1.25] }],
      min: [-1.5, 0.0, -1.275],
      max: [1.5, 1.315, 1.325],
    },
    barrier: {
      file: "props.glb",
      surface: "concrete",
      solids: [{ shape: "box", min: [-1.5, 0, -0.39], max: [1.5, 1.2, 0.39] }],
      min: [-1.5, 0.0, -0.415],
      max: [1.5, 1.215, 0.465],
    },
    cargo_sled: {
      file: "props.glb",
      surface: "metal",
      solids: [
        { shape: "box", min: [-1.35, 0, -2.25], max: [1.35, 1.3, 2.25] },
      ],
      min: [-1.375, 0.0, -2.25],
      max: [1.375, 1.315, 2.345],
    },
    pipeline_pier: {
      file: "route.glb",
      surface: "concrete",
      solids: [
        { shape: "box", min: [-1.7, 0, -1.3], max: [1.7, 0.4, 1.3] },
        {
          shape: "box",
          min: [-1.3, 0.4, -0.975],
          max: [1.3, 2.15, 0.975],
          surface: "stone",
        },
        {
          shape: "box",
          min: [-1.24, 2.15, -0.75],
          max: [-1.08, 2.9, 0.75],
          surface: "metal",
        },
        {
          shape: "box",
          min: [1.08, 2.15, -0.75],
          max: [1.24, 2.9, 0.75],
          surface: "metal",
        },
      ],
      min: [-1.7, 0.0, -1.3],
      max: [1.7, 3.02, 1.313],
    },
    causeway_pier: {
      file: "route.glb",
      surface: "concrete",
      solids: [
        {
          shape: "box",
          min: [-6.0, 0.0, -4.0],
          max: [6.0, 1.2, 4.0],
          surface: "stone",
        },
        {
          shape: "box",
          min: [-5.15, 1.2, -2.8],
          max: [-1.65, 5.2, 2.8],
          surface: "stone",
        },
        { shape: "box", min: [-4.8, 5, -2.25], max: [-2.0, 33, 2.25] },
        {
          shape: "box",
          min: [1.65, 1.2, -2.8],
          max: [5.15, 5.2, 2.8],
          surface: "stone",
        },
        { shape: "box", min: [2.0, 5, -2.25], max: [4.8, 33, 2.25] },
        { shape: "box", min: [-5.4, 33.0, -2.5], max: [5.4, 35.5, 2.5] },
        { shape: "box", min: [-5.0, 35.9, -1.0], max: [-1.8, 37.0, 1.0] },
        { shape: "box", min: [1.8, 35.9, -1.0], max: [5.0, 37.0, 1.0] },
      ],
      min: [-6.0, 0.0, -4.0],
      max: [6.0, 37.0, 4.0],
    },
    dam_sluice: {
      file: "route.glb",
      surface: "concrete",
      solids: [
        { shape: "box", min: [-3.8, 0.0, -1.5], max: [-2.4, 14.0, 1.5] },
        { shape: "box", min: [2.4, 0.0, -1.5], max: [3.8, 14.0, 1.5] },
        { shape: "box", min: [-3.8, 13.9, -1.5], max: [3.8, 15.0, 1.5] },
        {
          shape: "box",
          min: [-2.4, 2, -0.4],
          max: [2.4, 13.8, 0.4],
          surface: "metal",
        },
      ],
      min: [-3.8, 0.0, -1.5],
      max: [4.582, 15.35, 1.56],
    },
    dam_winch: {
      file: "route.glb",
      surface: "metal",
      solids: [
        {
          shape: "box",
          min: [-1.75, 0.0, -1.2],
          max: [1.75, 0.25, 1.2],
          surface: "concrete",
        },
        { shape: "box", min: [-1.75, 0, -1.2], max: [1.75, 2.15, 1.2] },
      ],
      min: [-1.75, 0.0, -1.2],
      max: [1.75, 2.15, 1.2],
    },
    dam_control_hut: {
      file: "route.glb",
      surface: "concrete",
      solids: [
        {
          shape: "box",
          min: [-2.5, 0.0, -2.4],
          max: [2.5, 0.25, 2.4],
          surface: "stone",
        },
        { shape: "box", min: [-2.15, 0.25, -1.9], max: [2.15, 3.45, 1.9] },
      ],
      min: [-2.5, 0.0, -2.4],
      max: [2.5, 3.78, 2.4],
    },
    watcher_tower: {
      file: "route.glb",
      surface: "concrete",
      solids: [
        {
          shape: "box",
          min: [-3.0, 0.0, -3.0],
          max: [3.0, 0.8, 3.0],
          surface: "stone",
        },
        { shape: "box", min: [-1.9, 0.8, -1.9], max: [1.9, 11.3, 1.9] },
        { shape: "box", min: [-3.0, 11.3, -3.0], max: [3.0, 11.8, 3.0] },
        { shape: "box", min: [-3.0, 11.8, -3.0], max: [-2.6, 12.45, 3.0] },
        { shape: "box", min: [2.6, 11.8, -3.0], max: [3.0, 12.45, 3.0] },
        { shape: "box", min: [-2.6, 11.8, -3.0], max: [2.6, 12.45, -2.6] },
      ],
      min: [-3.0, 0.0, -3.0],
      max: [3.0, 12.45, 3.035],
    },
    spire: {
      file: "station.glb",
      surface: "stone",
      solids: [
        {
          shape: "box",
          min: [-3.184, 12.92, 1.934],
          max: [3.184, 13.0, 3.184],
          surface: "metal",
        },
        {
          shape: "box",
          min: [-3.184, 12.92, -3.184],
          max: [3.184, 13.0, -1.934],
          surface: "metal",
        },
        {
          shape: "box",
          min: [1.934, 12.92, -1.934],
          max: [3.184, 13.0, 1.934],
          surface: "metal",
        },
        {
          shape: "box",
          min: [-3.184, 12.92, -1.934],
          max: [-1.934, 13.0, 1.934],
          surface: "metal",
        },
        {
          shape: "box",
          min: [-3.5, 0, -3.5],
          max: [3.5, 1.0, 3.5],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [-1.3, 0, 3.5],
          max: [1.3, 0.33, 4.3],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [-1.3, 0, 3.5],
          max: [1.3, 0.66, 3.9],
          surface: "concrete",
        },
        {
          shape: "box",
          min: [-2.4, 1.0, -2.4],
          max: [2.4, 4.0, 2.4],
          surface: "concrete",
        },
        { shape: "box", min: [-2.1, 4.0, -2.1], max: [2.1, 31.2, 2.1] },
      ],
      min: [-3.5, 0.0, -4.61],
      max: [3.5, 32.74, 4.12],
    },
    fin_row: {
      file: "station.glb",
      surface: "metal",
      solids: [
        { shape: "box", min: [-2.56, 2.74, -0.76], max: [-1.04, 3.17, 0.76] },
        { shape: "box", min: [1.04, 2.74, -0.76], max: [2.56, 3.17, 0.76] },
        { shape: "box", min: [-3.6, 0, -1], max: [3.6, 2.85, 1] },
      ],
      min: [-3.632, 0.0, -1.0],
      max: [3.632, 3.207, 1.022],
    },
    fin_row_b: {
      file: "station.glb",
      surface: "metal",
      solids: [
        { shape: "box", min: [-2.56, 2.74, -0.76], max: [-1.04, 3.17, 0.76] },
        { shape: "box", min: [1.04, 2.74, -0.76], max: [2.56, 3.17, 0.76] },
        { shape: "box", min: [-3.6, 0, -1], max: [3.6, 2.85, 1] },
      ],
      min: [-3.632, 0.0, -1.0],
      max: [3.632, 3.207, 1.09],
    },
    immersion_tank: {
      file: "station.glb",
      surface: "metal",
      solids: [{ shape: "box", min: [-1.8, 0, -1.25], max: [1.8, 2.18, 1.25] }],
      min: [-1.8, 0.0, -1.25],
      max: [2.35, 2.292, 1.25],
    },
    immersion_tank_b: {
      file: "station.glb",
      surface: "metal",
      solids: [{ shape: "box", min: [-1.8, 0, -1.25], max: [1.8, 2.18, 1.25] }],
      min: [-1.8, 0.0, -1.393],
      max: [2.35, 2.292, 1.25],
    },
    wellhead: {
      file: "station.glb",
      surface: "metal",
      solids: [
        {
          shape: "box",
          min: [-2.4, 0, -2.4],
          max: [2.4, 0.28, 2.4],
          surface: "concrete",
        },
        // The square stone pedestal is a separate jumpable ledge.
        {
          shape: "box",
          min: [-1.15, 0.28, -1.15],
          max: [1.15, 1.28, 1.15],
          surface: "stone",
        },
        { shape: "cyl", x: 0, z: 0, r: 0.7, y0: 1.28, y1: 2.205 },
        { shape: "cyl", x: 0, z: 0, r: 0.94, y0: 1.295, y1: 1.425 },
        { shape: "cyl", x: 0, z: 0, r: 0.94, y0: 2.295, y1: 2.425 },
        { shape: "cyl", x: 0, z: 0, r: 0.94, y0: 3.075, y1: 3.205 },
        { shape: "box", min: [-0.55, 3.25, -0.34], max: [0.55, 3.95, 0.34] },
        { shape: "box", min: [-2.1, 0.28, -0.3], max: [-1.5, 2.34, 0.3] },
        { shape: "box", min: [1.5, 0.28, -0.3], max: [2.1, 2.34, 0.3] },
      ],
      min: [-2.4, 0.0, -2.4],
      max: [2.4, 3.95, 2.4],
    },
    pipe_run: {
      file: "station.glb",
      surface: "metal",
      solids: [{ shape: "box", min: [-2.8, 0, -0.7], max: [2.8, 0.8, 0.32] }],
      min: [-2.8, 0.0, -0.8],
      max: [2.8, 0.87, 0.32],
    },
    pipe_run_b: {
      file: "station.glb",
      surface: "metal",
      solids: [
        { shape: "box", min: [-2.8, 0, -0.7], max: [1.12, 0.8, 0.32] },
        { shape: "box", min: [0.48, 0, -2.1], max: [1.12, 0.8, 0.32] },
      ],
      min: [-2.8, 0.0, -2.56],
      max: [1.03, 0.87, 0.32],
    },
    lamp_mast: {
      file: "station.glb",
      surface: "metal",
      solids: [
        {
          shape: "box",
          min: [-0.35, 0, -0.35],
          max: [0.35, 0.35, 0.35],
          surface: "concrete",
        },
        { shape: "box", min: [-0.09, 0.35, -0.09], max: [0.09, 5.6, 0.09] },
      ],
      min: [-0.45, 0.0, -0.35],
      max: [0.45, 5.915, 1.45],
    },
    pipe_rack: {
      file: "station.glb",
      surface: "metal",
      solids: [
        {
          shape: "box",
          min: [-6.25, 0, -1.05],
          max: [-5.15, 0.35, 1.05],
          surface: "concrete",
        },
        { shape: "box", min: [-5.9, 0.35, -0.9], max: [-5.5, 5.02, 0.9] },
        {
          shape: "box",
          min: [5.15, 0, -1.05],
          max: [6.25, 0.35, 1.05],
          surface: "concrete",
        },
        { shape: "box", min: [5.5, 0.35, -0.9], max: [5.9, 5.02, 0.9] },
        { shape: "box", min: [-6.05, 4.7, -1.0], max: [6.05, 5.67, 1.0] },
      ],
      min: [-6.25, 0.0, -1.05],
      max: [6.25, 5.93, 1.05],
    },
    pipe_rack_drop: {
      file: "station.glb",
      surface: "metal",
      solids: [
        { shape: "box", min: [5.95, 0, -0.7], max: [7.15, 5.65, 0.65] },
        {
          shape: "box",
          min: [-6.25, 0, -1.05],
          max: [-5.15, 0.35, 1.05],
          surface: "concrete",
        },
        { shape: "box", min: [-5.9, 0.35, -0.9], max: [-5.5, 5.02, 0.9] },
        {
          shape: "box",
          min: [5.15, 0, -1.05],
          max: [6.25, 0.35, 1.05],
          surface: "concrete",
        },
        { shape: "box", min: [5.5, 0.35, -0.9], max: [5.9, 5.02, 0.9] },
        { shape: "box", min: [-6.05, 4.7, -1.0], max: [6.05, 5.67, 1.0] },
      ],
      min: [-6.25, 0.0, -1.05],
      max: [7.1, 5.93, 1.05],
    },
    control_kiosk: {
      file: "station.glb",
      surface: "metal",
      solids: [
        {
          shape: "box",
          min: [-1.6, 0, -1.35],
          max: [1.6, 0.14, 1.25],
          surface: "concrete",
        },
        { shape: "box", min: [-1.5, 0.14, -1.22], max: [1.5, 3.02, -0.88] },
        {
          shape: "box",
          min: [-1.66, 0.14, -1.22],
          max: [-1.5, 2.72, -0.88],
          surface: "stone",
        },
        {
          shape: "box",
          min: [1.5, 0.14, -1.22],
          max: [1.66, 2.72, -0.88],
          surface: "stone",
        },
        {
          shape: "box",
          min: [-1.75, 3.02, -1.3],
          max: [1.75, 3.24, 1.3],
          surface: "stone",
        },
      ],
      min: [-1.75, -0.5, -1.4],
      max: [1.75, 3.24, 1.313],
    },
  };
  function stationBox(kind, zone, min, max, detail = {}) {
    const solid = {
      kind,
      zone,
      shape: "box",
      min,
      max,
      surface: "concrete",
      owner: "stations",
      ...detail,
    };
    layout.push(solid);
    return solid;
  }
  function stationFooting(zone, x, z, w, d) {
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        const y = groundY(x + (i / 4 - 0.5) * w, z + (j / 4 - 0.5) * d);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    const top = high + 0.08;
    stationBox(
      "station-footing",
      zone,
      [x - w / 2, low - 0.35, z - d / 2],
      [x + w / 2, top, z + d / 2],
    );
    return top;
  }
  function stationPiece(
    node,
    zone,
    x,
    z,
    yaw = 0,
    station = -1,
    fixedY = null,
    verticalScale = 1,
  ) {
    const def = stationKit[node],
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const w = def.max[0] - def.min[0],
      d = def.max[2] - def.min[2];
    // Pipe bridges have two bearing pads, never a raised slab across the aisle.
    let rackY = null;
    if (node.startsWith("pipe_rack")) {
      const supports = [-5.7, 5.7].map((dx) => ({
        x: x + c * dx,
        z: z - s * dx,
      }));
      rackY = Math.max(...supports.map((p) => groundY(p.x, p.z))) + 0.08;
      for (const p of supports)
        stationBox(
          "station-footing",
          zone,
          [p.x - 0.7, groundY(p.x, p.z) - 0.4, p.z - 1.2],
          [p.x + 0.7, rackY, p.z + 1.2],
        );
    }
    const y =
      fixedY ??
      rackY ??
      stationFooting(
        zone,
        x,
        z,
        Math.abs(c) * w + Math.abs(s) * d + 0.3,
        Math.abs(s) * w + Math.abs(c) * d + 0.3,
      );
    const shaft = layout.find((b) => b.kind === "spire" && b.zone === zone);
    const sy = node === "spire" ? (shaft.max[1] - y) / 31.2 : verticalScale;
    const part = {
      node,
      file: def.file,
      x,
      y,
      z,
      yaw,
      station,
      scale: [1, sy, 1],
    };
    for (const [i, shape] of def.solids.entries()) {
      const surface = shape.surface ?? def.surface;
      if (shape.shape === "cyl") {
        layout.push({
          ...shape,
          owner: "stations",
          kind: "station-equipment",
          zone,
          x: x + c * shape.x + s * shape.z,
          z: z - s * shape.x + c * shape.z,
          y0: y + shape.y0 * sy,
          y1: y + shape.y1 * sy,
          surface,
          stationAssembly: part,
          ...(i === 0 ? { stationPart: part } : {}),
        });
      } else {
        const corners = [];
        for (const px of [shape.min[0], shape.max[0]])
          for (const pz of [shape.min[2], shape.max[2]])
            corners.push([x + c * px + s * pz, z - s * px + c * pz]);
        stationBox(
          "station-equipment",
          zone,
          [
            Math.min(...corners.map((p) => p[0])),
            y + shape.min[1] * sy,
            Math.min(...corners.map((p) => p[1])),
          ],
          [
            Math.max(...corners.map((p) => p[0])),
            y + shape.max[1] * sy,
            Math.max(...corners.map((p) => p[1])),
          ],
          {
            surface,
            stationAssembly: part,
            ...(i === 0 ? { stationPart: part } : {}),
          },
        );
      }
    }
    return part;
  }
  for (const e of entities.stations) {
    stationPiece("spire", e.zone, e.spire.x, e.spire.z, 0, e.index);
    // Station One: a compact wellhead cluster. Station Two: three long fin
    // banks (two rows, a 2.5 m slip gap, one row) with aisles to fight
    // through, a 2 x 2 tank block and a pipe bridge over the main aisle.
    const bank = (x, z0, pattern, yaw) => {
      let z = z0;
      return pattern
        .map((p, i) => {
          if (p === "gap") {
            z -= 2.5;
            return null;
          }
          const at = z - 3.6;
          z -= 7.2;
          return [i % 2 ? "fin_row_b" : "fin_row", x, at, yaw];
        })
        .filter(Boolean);
    };
    const sites =
      e.index === 0
        ? [
            ["wellhead", -6, -126],
            ["immersion_tank", -7, -134],
            ["immersion_tank_b", -12, -134],
            ["pipe_run", -6, -138.1, Math.PI / 2],
            ["fin_row", -6, -142],
            ["pipe_rack_drop", 2, -130, Math.PI],
          ]
        : e.index === 1
          ? [
              ["wellhead", -14, -299],
              ["immersion_tank", 12, -299],
              ["immersion_tank_b", 18, -299],
              ["immersion_tank_b", 12, -292],
              ["immersion_tank", 18, -292],
              ...bank(-21, -256.4, ["row", "row", "gap", "row"], Math.PI / 2),
              ...bank(13, -252.4, ["row", "row", "gap", "row"], -Math.PI / 2),
              ...bank(19.5, -257.4, ["row", "gap", "row", "row"], -Math.PI / 2),
              ["pipe_rack_drop", -14.6, -282.2, Math.PI],
              ["pipe_rack", -2.6, -282.2, 0],
              ["pipe_rack_drop", 9.4, -282.2, 0],
            ]
          : [
              ["wellhead", -17, -380],
              ["immersion_tank_b", -24, -371],
              ["immersion_tank", -24, -378],
              ["fin_row", -17, -360],
              ["fin_row_b", -17, -369],
            ];
    for (const [node, x, z, yaw] of sites)
      stationPiece(node, e.zone, x, z, yaw || 0, e.index);
    for (const [dx, dz] of [
      [-10, 5],
      [6, -8],
    ])
      stationPiece(
        "lamp_mast",
        e.zone,
        e.x + dx,
        e.z + dz,
        dx < 0 ? Math.PI / 2 : -Math.PI / 2,
        e.index,
      );
    // The control kiosk frames the pylon (open toward the route, +Z).
    stationPiece("control_kiosk", e.zone, e.x, e.z, 0, e.index, e.y);
  }
  // The trunk follows the route's west service verge; each segment meets the next.
  for (let s = 64, i = 0; s < 128; s += 8, i++) {
    const a = at(s),
      b = at(s + 8),
      x = (a.x + b.x) / 2 - 14,
      z = -s - 4;
    const ya = groundY(a.x - 14, -s),
      yb = groundY(b.x - 14, -s - 8),
      y = (ya + yb) / 2;
    const part = {
      node: i % 3 === 1 ? "pipeline_segment_b" : "pipeline_segment",
      file: "route.glb",
      x,
      y,
      z,
      yaw: Math.atan2(b.x - a.x, -8),
      pitch: -Math.atan2(yb - ya, Math.hypot(b.x - a.x, 8)),
      length: Math.hypot(b.x - a.x, 8, yb - ya) / 8,
    };
    stationBox(
      "pipeline-trunk",
      1,
      [Math.min(a.x, b.x) - 15.1, Math.min(ya, yb) + 2.05, -s - 8.05],
      [Math.max(a.x, b.x) - 12.9, Math.max(ya, yb) + 4.05, -s + 0.05],
      { surface: "metal", stationPart: part },
    );
    const px = x + Math.sin(part.yaw) * Math.sin(part.pitch) * 3,
      pz = z + Math.cos(part.yaw) * Math.sin(part.pitch) * 3;
    const c = Math.abs(Math.cos(part.yaw)),
      sn = Math.abs(Math.sin(part.yaw));
    const foot = stationFooting(
      1,
      px,
      pz,
      c * 3.4 + sn * 2.613 + 0.3,
      sn * 3.4 + c * 2.613 + 0.3,
    );
    stationPiece(
      "pipeline_pier",
      1,
      px,
      pz,
      part.yaw,
      -1,
      foot,
      Math.max(0.35, (y + 2.1 * Math.cos(part.pitch) - foot) / 2.1),
    );
  }
  for (const [zone, x, z, node, yaw] of [
    [0, -7, -18, "cover_wall", 0.08],
    [1, -6, -106, "cover_wall_b", -0.08],
    [3, 5, -247, "cover_wall", 0.05],
    [4, -6, -355, "barrier", 0],
  ]) {
    if (zone === 2) {
      const part = {
        node,
        file: "props.glb",
        x,
        y: 22,
        z,
        yaw,
        scale: [1, 1, 0.52],
      };
      stationBox(
        "cargo-sled",
        zone,
        [x - 1.375, 22, z - 1.25],
        [x + 1.375, 23.315, z + 1.25],
        { stationPart: part },
      );
    } else stationPiece(node, zone, x, z, yaw);
  }
  // Low service manifolds follow the apron, crossing walking lanes below the
  // 35 cm step limit. Every visible pipe has a matching conservative solid.
  function stationPipe(zone, a, b, r = 0.12, endRadius = r) {
    stationBox(
      "station-conduit",
      zone,
      a.map((v, i) => Math.min(v, b[i]) - r),
      a.map((v, i) => Math.max(v, b[i]) + r),
      { surface: "metal", stationPipe: { a, b, r, endRadius } },
    );
  }
  const trunk = layout
    .filter((b) => b.stationPart?.node.startsWith("pipeline_segment"))
    .at(-1)?.stationPart;
  const intake = layout.find(
    (b) => b.stationPart?.node === "wellhead" && b.zone === 1,
  )?.stationPart;
  if (trunk && intake) {
    const localZ =
      Math.sin(trunk.pitch) * 3 + Math.cos(trunk.pitch) * 4 * trunk.length;
    const end = [
      trunk.x + Math.sin(trunk.yaw) * localZ,
      trunk.y +
        Math.cos(trunk.pitch) * 3 -
        Math.sin(trunk.pitch) * 4 * trunk.length,
      trunk.z + Math.cos(trunk.yaw) * localZ,
    ];
    const reducer = [end[0] + 1.2, end[1], end[2]];
    stationPipe(1, end, reducer, 0.9, 0.32);
    stationPipe(1, reducer, [intake.x, intake.y + 2.5, end[2]], 0.32);
    stationPipe(
      1,
      [intake.x, intake.y + 2.5, end[2]],
      [intake.x, intake.y + 2.5, intake.z],
      0.32,
    );
  }
  for (const e of entities.stations) {
    const parts = layout
      .filter((b) => b.stationPart?.station === e.index)
      .map((b) => b.stationPart);
    const well = parts.find((p) => p.node === "wellhead");
    if (!well) continue;
    const target = [e.spire.x + 1.6, e.spire.z - 4.5];
    const columns = new Map([
      [well.x, [well.z, well.z]],
      [target[0], [Math.min(well.z, target[1]), Math.max(well.z, target[1])]],
    ]);
    for (const p of parts.filter(
      (p) => p.node.startsWith("immersion") || p.node.startsWith("fin_row"),
    )) {
      const range = columns.get(p.x) || [well.z, well.z];
      range[0] = Math.min(range[0], p.z);
      range[1] = Math.max(range[1], p.z);
      columns.set(p.x, range);
    }
    const xs = [...columns.keys()],
      runs = [
        [
          [Math.min(...xs), well.z],
          [Math.max(...xs), well.z],
        ],
      ];
    for (const [x, [z0, z1]] of columns)
      if (z1 - z0 > 0.01)
        runs.push([
          [x, z0],
          [x, z1],
        ]);
    for (const [a, b] of runs) {
      // Transverse services cross the full combat apron in a flush trench.
      // Half-metre sections keep the box bounds close to the sloping surface.
      const cross = Math.abs(a[1] - b[1]) < 0.01;
      const n = Math.ceil(
        Math.hypot(b[0] - a[0], b[1] - a[1]) / (cross ? 0.5 : 2),
      );
      for (let j = 0; j < n; j++) {
        const points = [j / n, (j + 1) / n].map((t) => {
          const x = a[0] + (b[0] - a[0]) * t,
            z = a[1] + (b[1] - a[1]) * t;
          const support = layout
            .filter(
              (b) =>
                b.kind === "station-footing" &&
                x >= b.min[0] &&
                x <= b.max[0] &&
                z >= b.min[2] &&
                z <= b.max[2],
            )
            .reduce((y, b) => Math.max(y, b.max[1]), groundY(x, z));
          return [x, support + 0.15, z];
        });
        const road = at(-(a[1] + b[1]) / 2).x;
        const trench =
          cross || Math.abs((points[0][0] + points[1][0]) / 2 - road) < 3;
        if (trench) for (const p of points) p[1] = groundY(p[0], p[2]) + 0.02;
        stationPipe(e.zone, ...points, trench ? 0.025 : 0.12);
      }
    }
  }
  stationPiece("cargo_sled", 2, -2.9, -202, 0, -1, 22);
  stationPiece("cargo_sled", 2, 2.9, -180, Math.PI, -1, 22);
  // Dam machinery stays off the 9 m combat lane; deck top remains y22.
  for (const z of [-158, -184, -210])
    stationPiece("causeway_pier", 2, 0, z, 0, -1, -16);
  stationPiece("dam_sluice", 2, 12, -166, 0, -1, -13);
  stationPiece("dam_winch", 2, 12, -166, 0, -1, 2);
  stationBox("dam-footing", 2, [5, -17, -187], [11, 22, -181]);
  stationPiece("dam_control_hut", 2, 8, -184, 0, -1, 22);
  for (const x of [-8, 8]) {
    stationBox("dam-footing", 2, [x - 3, -17, -223], [x + 3, 22, -217]);
    stationPiece("watcher_tower", 2, x, -220, 0, -1, 22);
  }
  // One slab-free authored portal fits the old wings and leaves the full
  // climbing route open. Both wing seats share a level bearing, not a floor.
  const gateY = Math.max(
    ...[-16, 16].map((x) => stationFooting(4, x, -389, 10, 10)),
  );
  for (const b of layout)
    if (
      b.kind === "station-footing" &&
      b.zone === 4 &&
      b.min[2] === -394 &&
      Math.abs((b.min[0] + b.max[0]) / 2) === 16
    ) {
      b.max[1] = gateY;
      b.max[2] = -381.8;
    }
  const gate = {
    node: "citadel_gate",
    file: "citadel.glb",
    x: 0,
    y: gateY,
    z: -389,
  };
  for (const [i, x] of [-16, 16].entries()) {
    stationBox(
      "citadel-tower",
      4,
      [x - 4, gateY, -393],
      [x + 4, gateY + 38, -385],
      {
        surface: "stone",
        stationAssembly: gate,
        ...(i === 0 ? { stationPart: gate } : {}),
      },
    );
  }
  stationBox(
    "citadel-lintel",
    4,
    [-20, gateY + 30.5, -393],
    [20, gateY + 39.5, -385],
    { stationAssembly: gate },
  );
  for (const side of [-1, 1]) {
    for (const dx of [-3, 3])
      for (const [h, depth, width, base] of [
        [7.4, 7, 1.8, 0],
        [8, 6.2, 1.5, 7.4],
        [8, 5.4, 1.2, 15.4],
        [7.1, 4.6, 0.95, 23.4],
      ]) {
        const x = side * 16 + dx;
        stationBox(
          "gate-buttress",
          4,
          [x - width / 2, gateY + base + 0.04, -389],
          [x + width / 2, gateY + base + h - 0.04, -389 + depth],
          { stationAssembly: gate },
        );
      }
    const doorX = side * 14.75;
    for (let i = 0; i < 5; i++)
      stationBox(
        "gate-access-step",
        4,
        [doorX - 1.2, gateY - 1.6, -379.65 - i * 0.55],
        [doorX + 1.2, gateY - 1.2 + i * 0.3, -379.1 - i * 0.55],
      );
  }
  stationBox(
    "citadel-tablet",
    4,
    [-17, gateY + 32.6, -385.02],
    [17, gateY + 38.2, -384.8],
    { surface: "stone", stationAssembly: gate },
  );
  stationBox(
    "citadel-catwalk",
    4,
    [-11.9, gateY + 30.675, -385.3],
    [11.9, gateY + 30.925, -384.2],
    { surface: "metal", stationAssembly: gate },
  );
  // Stepped portal: overhead layers and side jambs step in 0.6 m per layer.
  for (const [bottom, z0, z1, inset] of [
    [30.1, -387.6, -385.2, 0],
    [28.9, -390.2, -387.6, 0.6],
    [27.7, -392.6, -390.2, 1.2],
  ]) {
    stationBox(
      "citadel-reveal",
      4,
      [-12 + inset, gateY + bottom, z0],
      [12 - inset, gateY + 30.8, z1],
      { surface: "stone", stationAssembly: gate },
    );
    if (inset)
      for (const side of [-1, 1])
        stationBox(
          "citadel-jamb",
          4,
          [side > 0 ? 12 - inset : -12, gateY, z0],
          [side > 0 ? 12 : -12 + inset, gateY + bottom, z1],
          { surface: "stone", stationAssembly: gate },
        );
  }
  for (const side of [-1, 1]) {
    const x = side * 16;
    // Summit-facing ceramic is proud of the rear stone face by half a metre.
    for (let i = 0; i < 6; i++)
      stationBox(
        "citadel-rear-panel",
        4,
        [x - 3.4, gateY + i * 4.9 + 0.09, -393.5],
        [x + 3.4, gateY + i * 4.9 + 4.81, -393],
        { surface: "stone", stationAssembly: gate },
      );
    stationBox(
      "citadel-tower",
      4,
      [x - 3.6, gateY + 39.5, -392.3],
      [x + 3.6, gateY + 51.35, -385.7],
      { surface: "stone", stationAssembly: gate },
    );
    for (const h of [15.4, 23.4])
      stationBox(
        "citadel-gallery",
        4,
        [x - 2.3, gateY + h - 0.1, -385.4],
        [x + 2.3, gateY + h + 0.1, -384],
        { surface: "metal", stationAssembly: gate },
      );
    // Curtain walls tie the gate into the cliffs; nothing passes beside it.
    stationBox(
      "citadel-wall",
      4,
      [side > 0 ? 20 : -36.5, gateY - 6, -393.85],
      [side > 0 ? 36.5 : -20, gateY + 25.2, -387.6],
      { surface: "stone", stationAssembly: gate },
    );
    stationBox(
      "citadel-wall",
      4,
      [side > 0 ? 20 : -36.5, gateY - 6, -387.6],
      [side > 0 ? 36.5 : -20, gateY + 1, -387.2],
      { stationAssembly: gate },
    );
  }
  for (const x of [-26, 26])
    for (const z of [-355, -371]) stationPiece("terrace_wall", 4, x, z, 0);
  stationPiece("summit_beacon", 5, 0, -427, 0, 3);
  stationPiece("whitepaper_monument", 5, 8, -433, 0);
  // Buried apron reservations keep planting off the built wearing course.
  // Their top stays below the lowest terrain sample: no route/support change.
  for (const [zone, x0, x1, z0, z1] of [
    [1, -11, 13, -145, -123],
    [3, -23, 23, -304, -254],
    [4, -28, 28, -389, -354],
    [5, -8, 12, -436, -419],
  ]) {
    let low = Infinity;
    for (let x = x0; x <= x1; x += 1)
      for (let z = z0; z <= z1; z += 1) low = Math.min(low, groundY(x, z));
    stationBox("station-apron", zone, [x0, low - 1, z0], [x1, low - 0.5, z1], {
      surface: "stone",
    });
  }
  // STATIONS solids END
  // Mesh heights after the shear in land-rocks.js. Rows run along local +Z
  // and zero cells leave gaps. Placement bounds stay independent.
  const rockHeights = {
    crown_field: [
      4, 65, 74, 75, 4, 73, 80, 91, 87, 67, 81, 86, 98, 93, 79, 4, 86, 89, 79,
      82, 4, 55, 78, 74, 4,
    ],
    boulder_0: [
      0, 66, 67, 0, 0, 0, 81, 85, 79, 0, 69, 78, 86, 93, 89, 0, 74, 81, 90, 42,
      0, 57, 0, 84, 0,
    ],
    boulder_1: [
      0, 0, 0, 71, 0, 0, 73, 81, 85, 75, 26, 73, 93, 86, 26, 57, 58, 93, 96, 0,
      69, 81, 90, 0, 0,
    ],
    boulder_2: [
      25, 52, 53, 0, 0, 40, 62, 64, 54, 0, 76, 91, 82, 84, 0, 23, 96, 97, 86,
      89, 0, 75, 99, 92, 96,
    ],
    boulder_3: [
      0, 42, 0, 0, 0, 79, 80, 45, 81, 84, 33, 90, 57, 90, 0, 0, 87, 70, 91, 23,
      0, 0, 0, 90, 92,
    ],
  };
  // The first Causeway boulder's west edge needs tighter samples to capture
  // the low shelf and the recess beside it. Grid edges are mesh percentages.
  const causewayBoulderHeights = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 53, 53, 0, 0, 0, 0, 0, 22, 26, 31, 35, 36, 38,
    52, 52, 53, 54, 0, 0, 0, 0, 0, 24, 29, 33, 37, 38, 40, 52, 53, 53, 54, 0, 0,
    0, 0, 0, 26, 31, 35, 39, 40, 42, 53, 59, 62, 60, 57, 0, 0, 0, 0, 28, 33, 38,
    43, 64, 82, 82, 81, 89, 68, 71, 55, 0, 0, 0, 30, 35, 50, 65, 84, 84, 84, 83,
    91, 81, 84, 74, 0, 0, 7, 22, 38, 54, 69, 86, 86, 86, 94, 93, 81, 84, 87, 0,
    0, 9, 25, 41, 57, 72, 87, 87, 87, 95, 95, 80, 83, 87, 0, 0, 11, 27, 43, 59,
    74, 89, 88, 88, 96, 96, 80, 83, 83, 83, 0, 0, 9, 24, 38, 52, 70, 95, 89, 97,
    95, 97, 83, 85, 87, 0, 0, 0, 0, 0, 5, 23, 48, 84, 94, 96, 97, 83, 86, 88,
    89, 0, 0, 0, 0, 0, 0, 31, 70, 95, 96, 97, 84, 87, 89, 91, 0, 0, 0, 0, 0, 0,
    22, 62, 95, 96, 97, 97, 89, 90, 92, 0, 0, 0, 0, 0, 0, 13, 53, 95, 96, 98,
    97, 90, 92, 93, 0, 0, 0, 0, 0, 0, 0, 41, 94, 97, 98, 89, 91, 93, 95, 0, 0,
    0, 0, 0, 0, 0, 21, 78, 98, 99, 92, 94, 96, 97, 0, 0, 0, 0, 0, 0, 0, 0, 12,
    90, 0, 6, 96, 99, 0,
  ];
  const causewayRockX = [
    0, 2, 4, 6, 8, 10, 13, 17, 23, 31, 43, 55, 68, 81, 92, 100,
  ];
  const causewayRockZ = [
    0, 8, 16, 24, 32, 40, 48, 55, 59, 63, 66, 69, 72, 75, 78, 83, 91, 100,
  ];
  const rockEdges = [0, 20, 40, 60, 80, 100];
  const rockColliders = new Map();
  for (const b of layout) {
    if (b.zone > 2) continue;
    const detailed = b.zone === 2 && b.rockProfile === "boulder_2";
    const heights = detailed
      ? causewayBoulderHeights
      : rockHeights[b.rockProfile ?? b.asset];
    if (!heights) continue;
    const xEdges = detailed ? causewayRockX : rockEdges;
    const zEdges = detailed ? causewayRockZ : rockEdges;
    const columns = xEdges.length - 1;
    const x = (b.min[0] + b.max[0]) / 2,
      z = (b.min[2] + b.max[2]) / 2,
      c = Math.cos(b.yaw ?? 0),
      s = Math.sin(b.yaw ?? 0),
      a = Math.abs(c),
      t = Math.abs(s),
      w = b.max[0] - b.min[0],
      d = b.max[2] - b.min[2],
      determinant = a * a - t * t,
      // The rotated crown shell fits into the square placement bounds.
      aspect = b.asset === "crown_field" ? 1.104 : 1,
      depth = Math.min(w / (aspect * a + t), d / (aspect * t + a)),
      width = depth * aspect;
    const fit = Math.abs(determinant) > 0.1;
    const localWidth = fit ? (w * a - d * t) / determinant : width;
    const localDepth = fit ? (d * a - w * t) / determinant : depth;
    const cells = [];
    heights.forEach((height, i) => {
      if (!height) return;
      const col = i % columns;
      const row = Math.floor(i / columns);
      cells.push({
        min: [
          ((xEdges[col] - 50) / 100) * localWidth,
          b.min[1],
          ((zEdges[row] - 50) / 100) * localDepth,
        ],
        max: [
          ((xEdges[col + 1] - 50) / 100) * localWidth,
          b.min[1] + (b.max[1] - b.min[1]) * (height / 100),
          ((zEdges[row + 1] - 50) / 100) * localDepth,
        ],
      });
    });
    rockColliders.set(b, { x, z, c, s, cells });
  }
  function rayBox(o, d, b, max = Infinity) {
    let near = 0,
      far = max,
      axis = 0,
      sign = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < b.min[i] || o[i] > b.max[i]) return null;
        continue;
      }
      let a = (b.min[i] - o[i]) / d[i],
        c = (b.max[i] - o[i]) / d[i];
      const n = d[i] > 0 ? -1 : 1;
      if (a > c) [a, c] = [c, a];
      if (a > near) {
        near = a;
        axis = i;
        sign = n;
      }
      far = Math.min(far, c);
      if (near > far) return null;
    }
    const normal = [0, 0, 0];
    normal[axis] = sign;
    return { distance: near, normal };
  }
  function rayRock(o, d, rock, max) {
    const x = o[0] - rock.x,
      z = o[2] - rock.z,
      { c, s } = rock;
    const origin = [c * x - s * z, o[1], s * x + c * z];
    const direction = [c * d[0] - s * d[2], d[1], s * d[0] + c * d[2]];
    let hit = null;
    for (const cell of rock.cells) {
      const t = rayBox(origin, direction, cell, hit?.distance ?? max);
      if (t && t.distance < (hit?.distance ?? max)) hit = t;
    }
    if (hit) {
      const [nx, ny, nz] = hit.normal;
      hit.normal = [c * nx + s * nz, ny, -s * nx + c * nz];
    }
    return hit;
  }
  // Exact finite-cylinder ray hit; content can use cylinders without box corners.
  function rayCylinder(o, d, b, max = Infinity) {
    const dx = o[0] - b.x,
      dz = o[2] - b.z,
      a = d[0] * d[0] + d[2] * d[2],
      c = dx * dx + dz * dz - b.r * b.r;
    let hit = null;
    const offer = (t, normal) => {
      if (t >= 0 && t < max && (!hit || t < hit.distance))
        hit = { distance: t, normal };
    };
    if (a > 1e-10) {
      const v = dx * d[0] + dz * d[2],
        h = v * v - a * c;
      if (h >= 0)
        for (const t of [(-v - Math.sqrt(h)) / a, (-v + Math.sqrt(h)) / a]) {
          const y = o[1] + d[1] * t;
          if (y >= b.y0 && y <= b.y1)
            offer(t, [(dx + d[0] * t) / b.r, 0, (dz + d[2] * t) / b.r]);
        }
    }
    if (Math.abs(d[1]) > 1e-10)
      for (const [y, n] of [
        [b.y0, -1],
        [b.y1, 1],
      ]) {
        const t = (y - o[1]) / d[1];
        if ((dx + d[0] * t) ** 2 + (dz + d[2] * t) ** 2 <= b.r * b.r)
          offer(t, [0, n, 0]);
      }
    return hit;
  }
  const landedSiege = siegePose(1);
  const wreckBounds = {
    min: [landedSiege.x - 27, landedSiege.y - 7.72, landedSiege.z - 2.805],
    max: [landedSiege.x - 5, landedSiege.y - 2.12, landedSiege.z + 2.524],
    surface: "metal",
  };
  const solidCellSize = 8;
  const solidCell = (position) => Math.floor(position / solidCellSize);
  const solidPadding = Math.max(
    PLAYER_RADIUS,
    ...Object.values(MACHINES).map((m) => m.r + MACHINE_CLEARANCE),
  );
  const solidRows = new Map();
  const traceGroupSize = 8;
  const traceGroups = [];
  for (const [i, raw] of layout.entries()) {
    const box =
      raw.shape === "cyl"
        ? {
            min: [raw.x - raw.r, raw.y0, raw.z - raw.r],
            max: [raw.x + raw.r, raw.y1, raw.z + raw.r],
          }
        : raw;
    const entry = { index: i, raw, box, rock: rockColliders.get(raw) };
    // Index both siege poses once. Queries still choose the active bounds.
    const min =
      raw.dynamic === "boss"
        ? box.min.map((n, axis) => Math.min(n, wreckBounds.min[axis]))
        : box.min;
    const max =
      raw.dynamic === "boss"
        ? box.max.map((n, axis) => Math.max(n, wreckBounds.max[axis]))
        : box.max;
    // Pad the index for actor radii so movement and placement need one cell.
    const firstX = solidCell(min[0] - solidPadding);
    const lastX = solidCell(max[0] + solidPadding);
    const firstZ = solidCell(min[2] - solidPadding);
    const lastZ = solidCell(max[2] + solidPadding);
    for (let z = firstZ; z <= lastZ; z++) {
      if (!solidRows.has(z)) solidRows.set(z, new Map());
      const row = solidRows.get(z);
      for (let x = firstX; x <= lastX; x++) {
        if (!row.has(x)) row.set(x, []);
        row.get(x).push(entry);
      }
    }
    // Keep ray groups in layout order so ties still hit the same surface.
    if (i % traceGroupSize === 0)
      traceGroups.push({ min: [...min], max: [...max], entries: [] });
    const group = traceGroups.at(-1);
    group.entries.push(entry);
    for (let axis = 0; axis < 3; axis++) {
      group.min[axis] = Math.min(group.min[axis], min[axis]);
      group.max[axis] = Math.max(group.max[axis], max[axis]);
    }
  }
  const noSolids = [];
  function nearbySolids(x, z) {
    return solidRows.get(solidCell(z))?.get(solidCell(x)) ?? noSolids;
  }
  function create(hooks = {}, { seed = 2140 } = {}) {
    const inventory = (kind) => ({
      kind,
      ammo: WEAPONS[kind].mag,
      spare: WEAPONS[kind].spare,
      heat: 0,
      battery: 100,
    });
    const enemy = (e) => ({
      ...e,
      y: e.kind === "gnat" ? Math.max(e.y, routeY(at(-e.z).x, e.z)) : e.y,
      hp: MACHINES[e.kind].hp,
      shield: MACHINES[e.kind].shield,
      yaw: e.yaw ?? 0,
      mode: "idle",
      awareness: "idle",
      role: e.role ?? "guard",
      home: { x: e.x, z: e.z },
      goal: { x: e.x, z: e.z },
      memory: { x: e.x, y: e.y + 1, z: e.z },
      seen: -100,
      heard: -100,
      visible: false,
      thinkAt: 0,
      alertAt: 0,
      cover: null,
      turn: e.id % 2 ? 1 : -1,
      detourUntil: 0,
      patrolLeg: 0,
      nav: [],
      navAt: 0,
      progressAt: 0,
      progressX: e.x,
      progressZ: e.z,
      preferredRange: 0.62 + (e.id % 7) * 0.045,
      charge: 0,
      aim: { x: 0, y: 0, z: 0 },
      hit: 0,
      dead: 0,
      deathDelay: null,
      cooldown: 1 + (e.id % 4) * 0.6,
      lastHit: 0,
      paid: false,
      deployed: !(e.id >= 21 && e.id <= 25),
    });
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
        surface: "sand",
        health: 100,
        shield: 100,
        safe: 0,
        armed: true,
        hasShield: true,
      },
      weapons: [inventory("carbine")],
      held: 0,
      weapon: {
        kind: "carbine",
        reload: 0,
        raise: 0,
        spread: 0,
        kick: 0,
        aim: 0,
        charging: 0,
        heat: 0,
        venting: false,
        firing: false,
        cooldown: 0,
      },
      charges: 4,
      zone: 0,
      progress: 0,
      combat: 0,
      hashrate: 51.3,
      stations: entities.stations.map(() => ({ state: "cartel", relight: 0 })),
      enemies: [],
      bolts: [],
      pickups: entities.pickups.map((e) => ({ ...e })),
      drops: [],
      hauler: null,
      boss: {
        alive: true,
        clamps: entities.clamps.map(() => ({
          hp: 180,
          shield: 80,
          alive: true,
        })),
        dying: 0,
        pose: siegePose(0),
      },
      prompt: null,
      pagesTaken: entities.pages.map(() => false),
      stashesTaken: entities.stashes.map(() => false),
      coins: 0,
      lastDamage: { angle: 0, age: 10 },
      events: [],
      fade: 0,
      ending: 0,
      complete: false,
      time: 0,
      steps: 0,
      checkpoint: 0,
      respawnS: 0.6,
      runSeed: seed >>> 0,
      seed: seed >>> 0,
      director: {
        threat: [],
        groups: [],
        drop: null,
        traces: 0,
        traceLimit: 4,
        fireLimit: 3,
      },
      god: false,
      quiet: false,
      pose: null,
      respawn: 0,
      gameOver: false,
      hitTick: 0,
      killTick: 0,
    };
    const p = state.player,
      w = state.weapon;
    let jumpBuffer = 0,
      coyote = 0.1,
      jumpHeld = false,
      swapHeld = false,
      chargeHeld = false,
      useTime = 0,
      useId = null,
      useConsumed = false,
      endingYaw = 0,
      endingPitch = 0,
      endingCue = 0,
      stepDistance = 0,
      haulerDone = false;
    const copyItems = (items) => items.map((item) => ({ ...item }));
    let savedLoadout;
    function saveLoadout() {
      savedLoadout = {
        weapons: copyItems(state.weapons),
        held: state.held,
        charges: state.charges,
        pickups: copyItems(state.pickups),
      };
    }
    saveLoadout();
    const boltPool = Array.from({ length: 128 }, (_, id) => ({
      id,
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      kind: "",
      from: "",
      bounced: false,
    }));
    const dropPool = Array.from({ length: 128 }, (_, id) => ({
      id,
      active: false,
      x: 0,
      y: 0,
      z: 0,
    }));
    const eventPool = Array.from({ length: 128 }, () => ({
      type: "",
      weapon: "",
      kind: "",
      from: [0, 0, 0],
      to: [0, 0, 0],
      at: [0, 0, 0],
      normal: [0, 0, 0],
      hit: null,
      enemy: null,
      index: 0,
    }));
    let eventIndex = 0;
    const sound = (type, pos = p, detail = {}) =>
      hooks.sfx?.(
        type,
        pos ? { x: pos.x, y: pos.y, z: pos.z, surface: p.surface } : null,
        { weapon: w.kind, ...detail },
      );
    const event = (type) => {
      const e = eventPool[eventIndex++ % 128];
      e.type = type;
      e.weapon = w.kind;
      e.kind = "";
      e.hit = null;
      e.enemy = null;
      e.index = 0;
      state.events.push(e);
      return e;
    };
    const random = () => {
      state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
      return state.seed / 4294967296;
    };
    function activeBounds({ raw, box }) {
      if (raw.dynamic !== "boss" || state.boss.alive) return box;
      return state.boss.dying < 1 ? null : wreckBounds;
    }
    function trace(
      o,
      d,
      max = 120,
      actors = true,
      skip = null,
      stopAtWater = false,
    ) {
      let result = {
        distance: max,
        hit: null,
        index: -1,
        normal: [0, 0, 0],
        enemy: null,
        clamp: null,
      };
      for (const group of traceGroups) {
        if (!rayBox(o, d, group, result.distance)) continue;
        for (const entry of group.entries) {
          const b = activeBounds(entry);
          if (!b) continue;
          const { raw, rock } = entry;
          let t = rayBox(o, d, b, result.distance);
          if (!t) continue;
          if (rock) t = rayRock(o, d, rock, result.distance);
          else if (raw.shape === "cyl")
            t = rayCylinder(o, d, raw, result.distance);
          if (t && t.distance < result.distance)
            result = {
              ...t,
              hit: raw.surface,
              index: entry.index,
              enemy: null,
              clamp: null,
            };
        }
      }
      // Include the endpoint even for sub-20 cm projectile steps.
      for (let t = Math.min(0.2, result.distance); t > 0;) {
        if (o[1] + d[1] * t <= groundY(o[0] + d[0] * t, o[2] + d[2] * t)) {
          let lo = Math.max(0, t - 0.5),
            hi = t;
          // Use the contact side of a tighter bracket for impact effects.
          for (let j = 0; j < (stopAtWater ? 14 : 7); j++) {
            const m = (lo + hi) / 2;
            if (o[1] + d[1] * m > groundY(o[0] + d[0] * m, o[2] + d[2] * m))
              lo = m;
            else hi = m;
          }
          const distance = stopAtWater ? hi : lo;
          if (distance === result.distance && result.hit) break;
          const x = o[0] + d[0] * distance,
            y = o[1] + d[1] * distance,
            z = o[2] + d[2] * distance;
          const nx = groundY(x - 0.01, z) - groundY(x + 0.01, z),
            nz = groundY(x, z - 0.01) - groundY(x, z + 0.01),
            length = Math.hypot(nx, 0.02, nz);
          result = {
            distance,
            hit: groundSurface(x, y, z, 0.02 / length),
            index: -1,
            normal: [nx / length, 0.02 / length, nz / length],
            enemy: null,
            clamp: null,
          };
          break;
        }
        if (t === result.distance) break;
        t = Math.min(t + 0.5, result.distance);
      }
      if (actors && !state.quiet)
        for (const e of state.enemies) {
          if (e.hp <= 0 || e === skip || !e.deployed) continue;
          const m = MACHINES[e.kind],
            cy = e.y + m.centre;
          const t = rayBox(
            o,
            d,
            {
              min: [e.x - m.r, cy - m.height * 0.35, e.z - m.r],
              max: [e.x + m.r, cy + m.height * 0.35, e.z + m.r],
            },
            result.distance,
          );
          if (t && t.distance < result.distance) {
            const y = o[1] + d[1] * t.distance;
            const weak =
              y > cy + m.height * 0.18 ||
              (e.kind === "bulwark" &&
                (o[0] - e.x) * Math.sin(e.yaw) +
                  (o[2] - e.z) * Math.cos(e.yaw) <
                  0);
            result = {
              ...t,
              hit: e.shield > 0 ? "shield" : weak ? "weak" : "enemy",
              index: -1,
              enemy: e,
              clamp: null,
            };
          }
        }
      if (actors)
        entities.clamps.forEach((e, i) => {
          if (!state.boss.clamps[i].alive) return;
          const t = rayBox(
            o,
            d,
            {
              min: [e.x - 0.8, e.y - 0.7, e.z - 0.8],
              max: [e.x + 0.8, e.y + 0.7, e.z + 0.8],
            },
            result.distance,
          );
          if (t && t.distance < result.distance)
            result = {
              ...t,
              hit: state.boss.clamps[i].shield ? "shield" : "weak",
              index: -1,
              enemy: null,
              clamp: i,
            };
        });
      if (stopAtWater) {
        const water = waterCrossing(o, d, result.distance);
        if (water && (!result.hit || water.distance < result.distance))
          result = {
            ...water,
            hit: "water",
            index: -1,
            normal: [0, 1, 0],
            enemy: null,
            clamp: null,
          };
      }
      return result;
    }
    // Placement and steering share the same clearance test. Foot anchors stay on
    // dry, walkable terrain (or the bridge deck), never on top of a hidden hull.
    function machineY(kind, x, z) {
      return kind === "gnat"
        ? Math.max(routeY(x, z), routeY(at(-z).x, z))
        : routeY(x, z);
    }
    function clearMachine(kind, x, z) {
      const m = MACHINES[kind],
        y = machineY(kind, x, z),
        s = -z;
      if (kind !== "gnat" && Math.abs(y - routeY(at(s).x, z)) > 3) return false;
      if (
        s < 3 ||
        s > 389 ||
        Math.abs(x - at(s).x) > (s > 150 && s < 225 ? 3.8 - m.r : 19 - m.r) ||
        y < waterY(x, z)
      )
        return false;
      const bottom = kind === "gnat" ? y + m.centre - m.height / 2 : y + 0.08;
      for (const entry of nearbySolids(x, z)) {
        const b = activeBounds(entry);
        if (
          b &&
          bottom < solidTop(entry, b, x, z, m.r + MACHINE_CLEARANCE) &&
          y + m.centre + m.height / 2 > b.min[1]
        )
          return false;
      }
      return true;
    }
    function lineClear(from, to) {
      const dx = to.x - from.x,
        dy = to.y - from.y,
        dz = to.z - from.z,
        d = Math.hypot(dx, dy, dz);
      return (
        d < 0.01 ||
        !trace([from.x, from.y, from.z], [dx / d, dy / d, dz / d], d, false).hit
      );
    }
    function inView(e) {
      const m = MACHINES[e.kind],
        dx = e.x - p.x,
        dz = e.z - p.z,
        d = Math.hypot(dx, dz);
      // Conservative 140 degree cone, including actor width. Initial placement
      // tests top and both shoulders; deployed actors are never teleported.
      if (
        (-dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)) / Math.max(0.01, d) <
        0.34 - m.r / Math.max(1, d)
      )
        return false;
      const eye = { x: p.x, y: p.y + 1.68, z: p.z };
      return [-m.r, 0, m.r].some((offset) =>
        lineClear(eye, {
          x: e.x + offset,
          y: e.y + m.centre + m.height / 2,
          z: e.z,
        }),
      );
    }
    const weights = { gnat: 1, strider: 3, watcher: 3, bulwark: 6, turret: 3 };
    const roster = [];
    // Build the complete roster before START: no sudden combat spawns. Budget
    // and passenger identities stay stable; group sizes and sites are seeded.
    for (let zone = 0; zone < 5; zone++) {
      const area = ZONES[zone],
        candidates = [];
      for (let s = area.s0 + (zone === 1 ? 30 : 12); s < area.s1 - 9; s += 3)
        for (let x = -12; x <= 12; x += 3) {
          const q = point(s, at(s).x + (zone === 2 ? x * 0.2 : x));
          if (clearMachine("strider", q.x, q.z)) candidates.push(q);
        }
      if (zone === 0)
        for (let z = -3; z >= -6; z -= 3)
          for (const x of [-18, -15, -12, 12, 15, 18])
            if (clearMachine("gnat", x, z)) candidates.push(point(-z, x));
      // Reserve the entire sentry formation before gnats take deck space.
      // Three individually greedy picks can strand the last watcher between
      // new tower footings even when a well-spaced formation exists.
      const watcherSites = [],
        watcherCount = entities.spawns.filter(
          (e) => e.zone === zone && e.kind === "watcher",
        ).length;
      let watcherIndex = 0;
      if (watcherCount) {
        const sites = candidates
          .filter(
            (q) =>
              -q.z >= 190 &&
              clearMachine("watcher", q.x, q.z) &&
              !inView({
                ...q,
                kind: "watcher",
                y: machineY("watcher", q.x, q.z),
              }),
          )
          .map((q) => ({ q, rank: random() }))
          .sort((a, b) => a.rank - b.rank)
          .map((a) => a.q);
        const reserve = (start) => {
          if (watcherSites.length === watcherCount) return true;
          for (let i = start; i < sites.length; i++)
            if (
              watcherSites.every(
                (q) => Math.hypot(q.x - sites[i].x, q.z - sites[i].z) >= 7,
              )
            ) {
              watcherSites.push(sites[i]);
              if (reserve(i + 1)) return true;
              watcherSites.pop();
            }
          return false;
        };
        if (!reserve(0))
          throw new Error("No safe far-causeway watcher formation");
      }
      let group = null,
        remaining = 0;
      for (const template of entities.spawns.filter(
        (e) => e.zone === zone && (zone !== 0 || e.id < 3),
      )) {
        const kind = template.kind;
        // Preserve the arc drop, bulwark and hauler cast. Watchers belong
        // only to the far causeway, never the introductory valley.
        if (!remaining || template.id === 21 || template.id === 26) {
          const size =
            template.id === 21 ? 5 : [1, 2, 4, 5][Math.floor(random() * 4)];
          group = { zone, size, x: 0, z: 0, ids: [] };
          remaining = size;
          const anchor = candidates[Math.floor(random() * candidates.length)];
          Object.assign(group, { x: anchor.x, z: anchor.z });
          state.director.groups.push(group);
        }
        const passenger = template.id >= 21 && template.id <= 25;
        const choices = candidates
          .map((q) => ({
            q,
            rank: Math.hypot(q.x - group.x, q.z - group.z) + random() * 8,
          }))
          .sort((a, b) => a.rank - b.rank);
        let q =
          kind === "watcher"
            ? watcherSites[watcherIndex++]
            : choices.find(
                ({ q }) =>
                  clearMachine(kind, q.x, q.z) &&
                  !watcherSites.some(
                    (w) =>
                      Math.hypot(w.x - q.x, w.z - q.z) <
                      MACHINES[kind].r + MACHINES.watcher.r + 1,
                  ) &&
                  !roster.some(
                    (e) =>
                      Math.hypot(e.x - q.x, e.z - q.z) <
                      (kind === "watcher" && e.kind === "watcher"
                        ? 7
                        : MACHINES[kind].r + MACHINES[e.kind].r + 1),
                  ) &&
                  !inView({ ...q, kind, y: machineY(kind, q.x, q.z) }),
              )?.q;
        if (kind === "turret") q = template;
        if (!q)
          throw new Error(
            "No safe director site for " + kind + " in zone " + zone,
          );
        const e = {
          ...template,
          ...q,
          kind,
          id: template.id,
          zone,
          y: machineY(kind, q.x, q.z),
          wakeAt: zone === 0 ? 6 + template.id * 1.2 : 0,
          role: passenger
            ? "guard"
            : ["guard", "patrol", "roam"][Math.floor(random() * 3)],
          yaw: random() - 0.5,
        };
        roster.push(e);
        group.ids.push(e.id);
        remaining--;
        state.director.threat[zone] =
          (state.director.threat[zone] ?? 0) + weights[kind];
      }
    }
    roster.sort((a, b) => a.id - b.id);
    const passengers = roster.filter((e) => e.id >= 21 && e.id <= 25);
    state.director.drop = {
      x: passengers.reduce((v, e) => v + e.x, 0) / 5,
      z: passengers.reduce((v, e) => v + e.z, 0) / 5,
      delay: random() * 1.5,
    };
    state.enemies = roster.map(enemy);
    let sightCursor = 0,
      zoneTime = 0,
      previousZone = 0;
    function hear(e, source) {
      if (e.visible || e.hp <= 0 || !e.deployed) return;
      Object.assign(e.memory, { x: source.x, y: source.y + 1, z: source.z });
      e.heard = state.time;
      if (e.awareness === "idle" || e.awareness === "patrol")
        e.awareness = "suspicious";
      e.thinkAt = 0;
    }
    function noise(source, radius) {
      for (const e of state.enemies)
        if (Math.hypot(e.x - source.x, e.z - source.z) < radius)
          hear(e, source);
    }
    function perceive() {
      state.director.traces = 0;
      state.director.paths = 0;
      // Rotating cursor prevents the first machine from monopolizing the cap.
      for (
        let count = 0;
        count < state.enemies.length &&
        state.director.traces < state.director.traceLimit;
        count++
      ) {
        const e = state.enemies[sightCursor++ % state.enemies.length];
        if (
          e.hp <= 0 ||
          e.deathDelay !== null ||
          !e.deployed ||
          state.quiet ||
          state.time < e.thinkAt ||
          state.time < (e.wakeAt ?? 0) ||
          (e.zone === 1 && -p.z < 55)
        )
          continue;
        const m = MACHINES[e.kind],
          dx = p.x - e.x,
          dz = p.z - e.z,
          d = Math.hypot(dx, dz);
        e.thinkAt = state.time + (d > 55 ? 1 : 0.18);
        const cone =
          (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / Math.max(d, 0.01) >
          0.25;
        let visible = false;
        if (d < m.range + 14 && (cone || d < 5)) {
          state.director.traces++;
          visible = lineClear(
            { x: e.x, y: e.y + m.muzzle[1], z: e.z },
            { x: p.x, y: p.y + 1.2, z: p.z },
          );
        }
        e.visible = visible;
        if (visible) {
          Object.assign(e.memory, { x: p.x, y: p.y + 1, z: p.z });
          e.seen = state.time;
          if (e.awareness !== "alert" && e.awareness !== "engage") {
            e.awareness = "alert";
            e.alertAt = state.time;
            sound("alert", e, { kind: e.kind });
            for (const ally of state.enemies)
              if (ally !== e && Math.hypot(ally.x - e.x, ally.z - e.z) < 18)
                hear(ally, e.memory);
          } else if (state.time - e.alertAt > 0.4) e.awareness = "engage";
        } else if (
          state.time - e.seen > 1.2 &&
          (e.awareness === "engage" || e.awareness === "alert")
        ) {
          e.awareness = "search";
          e.charge = 0;
        }
        if (!visible && state.time - Math.max(e.seen, e.heard) > 9) {
          e.awareness = e.role === "guard" ? "idle" : "patrol";
          e.cover = null;
        }
        chooseGoal(e, d);
      }
    }
    function chooseGoal(e, distance) {
      const fighting = e.awareness === "engage" || e.awareness === "alert",
        m = MACHINES[e.kind];
      e.mode = e.awareness;
      if (
        fighting ||
        e.awareness === "search" ||
        e.awareness === "suspicious"
      ) {
        Object.assign(e.goal, e.memory);
        const retreat = e.kind === "strider" && e.shield < 20;
        if (
          fighting &&
          e.kind === "strider" &&
          (retreat ||
            (e.role === "guard" && !w.reload && (state.time + e.id) % 6 < 2))
        ) {
          const cover = entities.cover
            .filter((c) => c.zone === e.zone)
            .sort(
              (a, b) =>
                Math.hypot(a.x - e.x, a.z - e.z) -
                Math.hypot(b.x - e.x, b.z - e.z),
            );
          for (const c of cover) {
            // Cover markers sit south of the wall. Pick the opposite side from
            // the last observed player, then prove that it actually occludes.
            const z = c.z - 2.25,
              dx = c.x - e.memory.x,
              dz = z - e.memory.z,
              d = Math.hypot(dx, dz) || 1;
            const q = { x: c.x + (dx / d) * 2.8, z: z + (dz / d) * 2.8 };
            if (
              !clearMachine(e.kind, q.x, q.z) ||
              state.director.traces >= state.director.traceLimit
            )
              continue;
            state.director.traces++;
            if (
              !lineClear(e.memory, {
                ...q,
                y: machineY(e.kind, q.x, q.z) + 0.8,
              })
            ) {
              e.cover = q;
              Object.assign(e.goal, q);
              e.mode = retreat ? "retreat" : "cover";
              return;
            }
          }
        }
        e.cover = null;
        if (
          fighting &&
          distance < m.range * e.preferredRange &&
          !w.reload &&
          p.health >= 45
        ) {
          const allies = state.enemies.filter(
            (a) =>
              a.hp > 0 && a.visible && Math.hypot(a.x - e.x, a.z - e.z) < 16,
          ).length;
          const side = e.turn * (allies > 2 ? 5 : 2),
            dx = e.x - e.memory.x,
            dz = e.z - e.memory.z,
            d = Math.hypot(dx, dz) || 1;
          e.goal.x = e.x - (dz / d) * side;
          e.goal.z = e.z + (dx / d) * side;
          e.mode = allies > 2 ? "flank" : "strafe";
        } else if (fighting) e.mode = "push";
      } else {
        if (Math.hypot(e.x - e.goal.x, e.z - e.goal.z) < 1) e.patrolLeg++;
        const radius = e.role === "roam" ? 9 : e.role === "patrol" ? 4 : 0;
        e.goal.x = e.home.x + Math.sin(e.patrolLeg * 2.4 + e.id) * radius;
        e.goal.z = e.home.z + Math.cos(e.patrolLeg * 2.4 + e.id) * radius;
      }
    }
    // Only a stalled actor requests a bounded local route; at most one search
    // per tick, at most 160 cells. Ordinary strafing needs no path search.
    function detour(e) {
      const start = { x: e.x, z: e.z, parent: null },
        open = [start],
        visited = new Set(["0,0"]);
      let best = start,
        score = Math.hypot(e.goal.x - e.x, e.goal.z - e.z);
      for (let i = 0; i < open.length && i < 160; i++) {
        const q = open[i],
          distance = Math.hypot(q.x - e.goal.x, q.z - e.goal.z);
        if (distance < score) {
          score = distance;
          best = q;
        }
        if (distance < 2) break;
        for (const [dx, dz] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ]) {
          const x = q.x + dx,
            z = q.z + dz,
            key = Math.round((x - e.x) / 2) + "," + Math.round((z - e.z) / 2);
          if (visited.has(key)) continue;
          visited.add(key);
          if (
            !clearMachine(e.kind, x, z) ||
            !clearMachine(e.kind, q.x + dx / 2, q.z + dz / 2) ||
            Math.abs(machineY(e.kind, x, z) - machineY(e.kind, q.x, q.z)) >
              2 * MAX_SLOPE
          )
            continue;
          open.push({ x, z, parent: q });
        }
      }
      e.nav.length = 0;
      for (let q = best; q.parent; q = q.parent)
        e.nav.unshift({ x: q.x, z: q.z });
      if (!e.nav.length) {
        e.patrolLeg++;
        e.goal.x = e.home.x;
        e.goal.z = e.home.z;
      }
      e.navAt = state.time + 3;
      state.director.paths++;
    }
    function steer(e, dt) {
      const m = MACHINES[e.kind];
      if (e.nav.length && Math.hypot(e.nav[0].x - e.x, e.nav[0].z - e.z) < 0.75)
        e.nav.shift();
      const goal = e.nav[0] ?? e.goal,
        dx = goal.x - e.x,
        dz = goal.z - e.z,
        d = Math.hypot(dx, dz);
      if (!m.speed || d < 0.25 || e.charge) return;
      if (state.time - e.progressAt > 2) {
        if (
          Math.hypot(e.x - e.progressX, e.z - e.progressZ) < 0.7 &&
          state.time > e.navAt &&
          state.director.paths < 1
        )
          detour(e);
        e.progressAt = state.time;
        e.progressX = e.x;
        e.progressZ = e.z;
      }
      let angle = Math.atan2(dx, dz);
      if (
        !e.visible &&
        e.awareness !== "suspicious" &&
        e.awareness !== "search"
      )
        e.yaw = angle;
      if (state.time < e.detourUntil) angle += (e.turn * Math.PI) / 2;
      const step = Math.min(d, m.speed * dt);
      for (const turn of [
        0,
        e.turn * 0.65,
        e.turn * 1.3,
        -e.turn * 0.65,
        -e.turn * 1.3,
        Math.PI,
      ]) {
        const x = e.x + Math.sin(angle + turn) * step,
          z = e.z + Math.cos(angle + turn) * step,
          y = machineY(e.kind, x, z);
        if (
          !clearMachine(e.kind, x, z) ||
          Math.abs(y - e.y) > step * MAX_SLOPE + 0.05 ||
          state.enemies.some(
            (a) =>
              a !== e &&
              a.hp > 0 &&
              a.deployed &&
              Math.hypot(a.x - x, a.z - z) < m.r + MACHINES[a.kind].r + 0.15,
          )
        )
          continue;
        e.x = x;
        e.z = z;
        e.y = y;
        if (turn && state.time >= e.detourUntil) {
          e.detourUntil = state.time + 1.2;
          e.turn = turn > 0 ? 1 : -1;
        }
        return;
      }
      // A blocked patrol selects its next leg, rather than oscillating forever.
      e.patrolLeg++;
      e.thinkAt = 0;
      e.turn = -e.turn;
    }
    function kill(e) {
      if (e.hp <= 0 && e.mode === "dead") return;
      e.hp = 0;
      e.mode = "dead";
      e.deathDelay = null;
      e.charge = 0;
      sound("kill", e, { kind: e.kind });
      const v = event("explode");
      v.kind = e.kind;
      v.at.splice(0, 3, e.x, e.y + 1, e.z);
      sound("explode", e, { kind: e.kind });
      if (!e.paid) {
        e.paid = true;
        const d = dropPool.find((d) => !d.active);
        if (d) {
          Object.assign(d, { active: true, x: e.x, y: e.y + 0.5, z: e.z });
          state.drops.push(d);
        }
        hooks.reward?.(0, 100);
        if (e.kind === "strider") {
          const pickup = {
            id: 100 + e.id,
            kind: "arc",
            x: e.x,
            y: e.y,
            z: e.z,
          };
          state.pickups.push(pickup);
          // The kill's paid flag survives a death, so this loot must survive
          // as well, even when the player already took it on this attempt.
          savedLoadout.pickups.push({ ...pickup });
        }
      }
      state.killTick = 0.25;
    }
    function damage(t, kind, amount = WEAPONS[kind].damage) {
      const e =
        t.enemy || (t.clamp !== null ? state.boss.clamps[t.clamp] : null);
      if (!e) return;
      const spec = WEAPONS[kind],
        absorbed = Math.min(e.shield, amount * spec.shield);
      e.shield -= absorbed;
      if (absorbed) {
        sound("shield-impact", t.enemy || entities.clamps[t.clamp]);
        if (!e.shield) {
          const shieldEvent = event("shield-break");
          shieldEvent.enemy = t.enemy?.id ?? null;
          shieldEvent.index = t.clamp;
          sound("enemy-shield-break", t.enemy || p);
        }
      }
      let hull = Math.max(0, amount - absorbed / spec.shield) * spec.hull;
      if (t.hit === "weak") hull *= 2.5;
      if (t.enemy?.kind === "bulwark" && t.hit !== "weak" && kind !== "arc")
        hull *= 0.15;
      e.hp = Math.max(0, e.hp - hull);
      e.hit = 1;
      e.lastHit = state.time;
      if (t.enemy) hear(e, p);
      state.hitTick = 0.15;
      sound("hit", t.enemy || p);
      if (e.hp === 0) {
        if (t.enemy) kill(e);
        else {
          e.alive = false;
          event("clamp-break").index = t.clamp;
          const flash = event("explode"),
            point = entities.clamps[t.clamp];
          flash.kind = "clamp";
          flash.at.splice(0, 3, point.x, point.y, point.z);
          sound("clamp-break", entities.clamps[t.clamp]);
          if (state.boss.clamps.every((c) => !c.alive)) {
            state.boss.alive = false;
            sound("boss-die");
            let i = 0;
            for (const a of state.enemies) {
              if (a.zone !== 4 || a.hp <= 0) continue;
              a.deathDelay = Math.min(1.1, 0.08 * i++ + random() * 0.25);
              a.mode = "dying";
              a.charge = 0;
            }
          }
        }
      }
    }
    function hurt(amount, source = p) {
      if (state.god || p.safe > 0 || state.respawn || state.gameOver) return;
      const absorb = Math.min(p.shield, amount);
      p.shield -= absorb;
      p.health = Math.max(0, p.health - amount + absorb);
      state.lastDamage = {
        age: 0,
        angle: Math.atan2(source.x - p.x, p.z - source.z) + p.yaw,
      };
      sound(absorb ? (p.shield ? "shield-hit" : "shield-break") : "hurt");
      if (!p.health) {
        sound("death");
        if (hooks.death?.() === false) state.gameOver = true;
        else state.respawn = 0.7;
      }
    }
    function spawn(kind, x, z, y = groundY(x, z)) {
      if (!MACHINES[kind] || state.enemies.length >= 96) return null;
      const e = enemy({
        kind,
        x,
        z,
        y,
        zone: zoneAt(z),
        id: Math.max(-1, ...state.enemies.map((e) => e.id)) + 1,
      });
      state.enemies.push(e);
      return e;
    }
    function give(kind) {
      if (!WEAPONS[kind]) return false;
      const i = state.weapons.findIndex((a) => a.kind === kind);
      if (i >= 0) {
        state.weapons[i] = inventory(kind);
        state.held = i;
      } else if (state.weapons.length < 2) {
        state.weapons.push(inventory(kind));
        state.held = state.weapons.length - 1;
      } else state.weapons[state.held] = inventory(kind);
      syncWeapon();
      return true;
    }
    function syncWeapon() {
      Object.assign(w, {
        kind: state.weapons[state.held].kind,
        reload: 0,
        charging: 0,
        cooldown: 0,
        raise: 1,
        venting: false,
      });
    }
    function target() {
      if (state.ending) return null;
      const close = (e) =>
        Math.hypot(e.x - p.x, e.z - p.z) < 2.6 && Math.abs(e.y - p.y) < 3;
      // Dropped guns must not trap a cleared pylon in repeated weapon swaps.
      for (const e of entities.stations)
        if (
          e.index < 2 &&
          state.stations[e.index].state === "clear" &&
          close(e)
        )
          return {
            ...e,
            type: "station",
            label: "RELIGHT STATION " + (e.index + 1),
          };
      if (
        state.stations.every((s) => s.state === "keeper") &&
        close(entities.beacon)
      )
        return { ...entities.beacon, type: "beacon" };
      for (const e of state.pickups)
        if (
          WEAPONS[e.kind] &&
          !e.needsSpace &&
          !state.weapons.some((w) => w.kind === e.kind) &&
          close(e) &&
          (e.station === undefined ||
            state.stations[e.station].state === "keeper")
        )
          return { ...e, type: "weapon", label: WEAPONS[e.kind].name };
      return null;
    }
    function relight(i) {
      if (state.stations[i].state === "keeper") return;
      state.stations[i].state = "keeper";
      state.hashrate =
        51.3 -
        state.stations.reduce(
          (v, s, j) => v + (s.state === "keeper" ? [0.7, 0.8, 1.6][j] : 0),
          0,
        );
      sound("station-relight", entities.stations[i]);
      sound("hashrate-drop");
    }
    function use(t) {
      if (t.type === "station") relight(t.index);
      else if (t.type === "beacon") {
        state.ending = 0.001;
        endingYaw = p.yaw;
        endingPitch = p.pitch;
        endingCue = 0;
        p.vx = p.vy = p.vz = 0;
        w.aim = w.charging = 0;
        w.firing = false;
        sound("beacon");
      } else {
        const old = state.weapons[state.held];
        state.pickups.splice(
          state.pickups.findIndex((e) => e.id === t.id),
          1,
        );
        if (state.weapons.length === 2)
          state.pickups.push({
            id: 1000 + Math.floor(state.time * 120),
            kind: old.kind,
            x: p.x,
            y: p.y,
            z: p.z,
            needsSpace: true,
            ...old,
          });
        give(t.kind);
        for (const key of ["ammo", "spare", "heat", "battery"])
          if (t[key] !== undefined) state.weapons[state.held][key] = t[key];
        sound("pickup-weapon", p, { weapon: t.kind });
      }
    }
    function overlaps(x, z, b, r) {
      return (
        x + r > b.min[0] &&
        x - r < b.max[0] &&
        z + r > b.min[2] &&
        z - r < b.max[2]
      );
    }
    // All movement axes use the same footprint, including the support under
    // the feet. A cylinder's bounding-box corners only serve as a broad phase.
    function solidTop({ raw, rock }, b, x, z, r = PLAYER_RADIUS) {
      if (!overlaps(x, z, b, r)) return -Infinity;
      if (raw.shape === "cyl")
        return Math.hypot(x - raw.x, z - raw.z) < raw.r + r
          ? b.max[1]
          : -Infinity;
      if (!rock) return b.max[1];
      const dx = x - rock.x,
        dz = z - rock.z,
        localX = rock.c * dx - rock.s * dz,
        localZ = rock.s * dx + rock.c * dz;
      let top = -Infinity;
      for (const cell of rock.cells) {
        const gapX = Math.max(cell.min[0] - localX, localX - cell.max[0], 0);
        const gapZ = Math.max(cell.min[2] - localZ, localZ - cell.max[2], 0);
        if (gapX * gapX + gapZ * gapZ <= r * r)
          top = Math.max(top, cell.max[1]);
      }
      return top;
    }
    function move(axis, delta) {
      if (!delta) return;
      const x = axis === "x" ? p.x + delta : p.x,
        z = axis === "z" ? p.z + delta : p.z;
      let top = groundY(x, z);
      const here = groundY(p.x, p.z);
      // Reject uphill motion along steep terrain even during a jump. Sampling
      // the actual displacement prevents tiny fixed steps from climbing cliffs.
      if (
        top > here &&
        (top - here) / Math.max(Math.abs(delta), 0.00001) > MAX_SLOPE &&
        top > p.y - 0.35
      )
        return;
      // Water is the visible boundary; walking in ankle-deep surf is allowed.
      if (z > 0 && top < SEA_Y - 0.45 && top < here && p.y < SEA_Y + 0.2)
        return;
      if (top - p.y > 0.35 && p.grounded) return;
      top = Math.max(p.y, top);
      let ceiling = Infinity;
      for (const entry of nearbySolids(x, z)) {
        const b = activeBounds(entry);
        if (!b || p.y >= b.max[1] - CONTACT_EPSILON) continue;
        const surface = solidTop(entry, b, x, z);
        if (p.y >= surface - CONTACT_EPSILON) continue;
        if (p.y + PLAYER_HEIGHT <= b.min[1] + CONTACT_EPSILON) {
          ceiling = Math.min(ceiling, b.min[1]);
          continue;
        }
        if (!p.grounded || surface - p.y > 0.35) return;
        // A rock touching the edge of a boot can block a step. Only lift
        // the player when the centre of the boot reaches that height.
        if (entry.rock && solidTop(entry, b, x, z, 0) < surface) return;
        top = Math.max(top, surface);
      }
      if (p.grounded && top + PLAYER_HEIGHT > ceiling + CONTACT_EPSILON) return;
      p[axis] += delta;
      if (p.grounded) p.y = top;
    }
    function bolt(kind, from, o, d, speed) {
      const b = boltPool.find((b) => !b.active);
      if (!b) return;
      Object.assign(b, {
        active: true,
        kind,
        from,
        x: o[0],
        y: o[1],
        z: o[2],
        vx: d[0] * speed,
        vy: d[1] * speed,
        vz: d[2] * speed,
        age: 0,
        bounced: false,
        settled: false,
        splashed: false,
      });
      state.bolts.push(b);
      return b;
    }
    function shoot() {
      const a = state.weapons[state.held],
        spec = WEAPONS[a.kind];
      w.cooldown = spec.interval;
      w.kick = Math.min(0.08, w.kick + 0.03);
      w.spread = Math.min(0.03, w.spread + 0.003);
      noise(p, 38);
      sound("shot");
      event("casing");
      sound("casing", p, { surface: p.surface });
      if (a.kind === "arc") {
        a.battery = Math.max(0, a.battery - 1);
        a.heat = Math.min(1, a.heat + 0.085);
        if (a.heat >= 1) {
          w.venting = true;
          sound("arc-vent");
        }
      } else a.ammo--;
      const o = [p.x, p.y + 1.68, p.z];
      for (let pellet = 0; pellet < spec.pellets; pellet++) {
        const spread = spec.spread * (w.aim > 0.5 ? 0.6 : 1),
          yaw = p.yaw + (random() - 0.5) * spread,
          pitch = p.pitch + (random() - 0.5) * spread,
          d = [
            -Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch),
          ];
        if (a.kind === "arc") {
          bolt("arc", "player", o, d, 65);
          continue;
        }
        const t = trace(o, d, 120, true, null, true);
        const e = event("shot");
        e.from.splice(0, 3, ...o);
        e.to.splice(0, 3, ...impactPoint(o, d, t));
        e.normal.splice(
          0,
          3,
          ...(t.hit ? impactNormal(d, t.normal) : t.normal),
        );
        e.hit = t.hit;
        e.index = t.index;
        e.enemy = t.enemy?.id ?? null;
        damage(
          t,
          a.kind,
          spec.damage *
            (a.kind === "scatter" ? 1 - smooth(8, 30, t.distance) * 0.8 : 1),
        );
        if (a.kind === "rail" && t.enemy) {
          const next = trace(o, d, 120, true, t.enemy, true);
          if (next.distance > t.distance) damage(next, a.kind);
        }
        if (t.hit)
          sound(
            "impact",
            { x: e.to[0], y: e.to[1], z: e.to[2] },
            { surface: t.hit },
          );
      }
    }
    function reload() {
      const a = state.weapons[state.held];
      if (
        a.kind !== "arc" &&
        !w.reload &&
        a.ammo < WEAPONS[a.kind].mag &&
        a.spare
      ) {
        w.reload = 0.0001;
        w.charging = 0;
        sound("reload-out");
      }
    }
    function explode(b) {
      noise(b, 52);
      const e = event("explode");
      e.kind = b.kind;
      e.at.splice(0, 3, b.x, b.y, b.z);
      sound("explode", b, { kind: b.kind });
      for (const a of state.enemies) {
        const d = Math.hypot(a.x - b.x, a.y + 1 - b.y, a.z - b.z);
        if (
          a.hp > 0 &&
          d < 7 &&
          !trace(
            [b.x, b.y + 0.2, b.z],
            [(a.x - b.x) / d, (a.y + 1 - b.y) / d, (a.z - b.z) / d],
            d,
            false,
          ).hit
        )
          damage(
            { enemy: a, hit: "weak", clamp: null },
            "rail",
            100 * (1 - d / 7),
          );
      }
      if (b.from === "enemy" && Math.hypot(p.x - b.x, p.z - b.z) < 5)
        hurt(24, b);
    }
    function update(dt, input = {}) {
      state.events.length = 0;
      eventIndex = 0;
      if (state.complete || state.gameOver) return;
      dt = clamp(dt, 0, 0.05);
      if (!input.use) useConsumed = false;
      state.time += dt;
      p.safe = Math.max(0, p.safe - dt);
      state.lastDamage.age += dt;
      state.hitTick = Math.max(0, state.hitTick - dt);
      state.killTick = Math.max(0, state.killTick - dt);
      if (state.ending) {
        state.ending += dt;
        const t = state.ending;
        const turn = Math.atan2(
          Math.sin(Math.PI - endingYaw),
          Math.cos(Math.PI - endingYaw),
        );
        if (t < 2.6)
          p.pitch = endingPitch + (0.62 - endingPitch) * smooth(0, 2.6, t);
        else {
          const blend = smooth(2.6, 5.2, t);
          p.pitch = 0.62 + (-0.04 - 0.62) * blend;
          p.yaw = endingYaw + turn * blend + Math.max(0, t - 5.2) * 0.01;
        }
        while (endingCue < ENDING_CUES.length && t >= ENDING_CUES[endingCue][0])
          sound(ENDING_CUES[endingCue++][1], null);
        if (state.ending >= ENDING_SECONDS) {
          state.complete = true;
          hooks.complete?.();
        }
        return;
      }
      if (state.respawn) {
        state.respawn = Math.max(0, state.respawn - dt);
        state.fade = Math.sin((Math.PI * state.respawn) / 0.7);
        if (!state.respawn) {
          const q = at(state.respawnS);
          let y = routeY(q.x, q.z);
          // The climb save sits on a stair tread above the terrain.
          if (state.respawnS === CLIMB_RESPAWN_S)
            for (const entry of nearbySolids(q.x, q.z))
              if (entry.raw.landRole === "stair-tread")
                y = Math.max(y, solidTop(entry, entry.box, q.x, q.z));
          Object.assign(p, q, {
            y,
            health: 100,
            shield: 100,
            safe: 2,
            vx: 0,
            vy: 0,
            vz: 0,
            grounded: true,
          });
          state.weapons = copyItems(savedLoadout.weapons);
          state.held = savedLoadout.held;
          state.charges = savedLoadout.charges;
          state.pickups = copyItems(savedLoadout.pickups);
          useTime = 0;
          useId = null;
          state.useProgress = 0;
          state.prompt = null;
          syncWeapon();
          for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i],
              original = roster.find((a) => a.id === e.id);
            if (
              e.zone === state.checkpoint &&
              e.zone !== 0 &&
              original &&
              (e.zone !== 4 || state.boss.alive)
            )
              state.enemies[i] = { ...enemy(original), paid: e.paid };
          }
          if (state.checkpoint === 3) {
            haulerDone = false;
            state.hauler = null;
            zoneTime = 0;
          }
          state.bolts.length = 0;
          boltPool.forEach((b) => (b.active = false));
        }
        return;
      }
      if (input.yaw !== undefined) p.yaw = input.yaw;
      if (input.pitch !== undefined) p.pitch = clamp(input.pitch, -1.4, 1.4);
      if (state.lastDamage.age > 8)
        p.health = Math.min(100, p.health + 10 * dt);
      if (state.lastDamage.age > 4) {
        const old = p.shield;
        p.shield = Math.min(100, p.shield + 25 * dt);
        if (old < 100 && p.shield === 100) sound("shield-up");
      }
      jumpBuffer = input.jump && !jumpHeld ? 0.1 : Math.max(0, jumpBuffer - dt);
      jumpHeld = !!input.jump;
      coyote = p.grounded ? 0.1 : Math.max(0, coyote - dt);
      if (jumpBuffer && coyote) {
        p.vy = Math.sqrt(2 * 10 * 1.6);
        p.grounded = false;
        jumpBuffer = coyote = 0;
        sound("jump");
      }
      const mx = input.moveX || 0,
        mz = input.moveZ || 0,
        n = Math.max(1, Math.hypot(mx, mz)),
        speed = input.sprint ? 6.5 : 4.2,
        k = 1 - Math.exp(-(p.grounded ? 18 : 7) * dt);
      p.vx +=
        (((mx * Math.cos(p.yaw) + mz * Math.sin(p.yaw)) / n) * speed - p.vx) *
        k;
      p.vz +=
        (((-mx * Math.sin(p.yaw) + mz * Math.cos(p.yaw)) / n) * speed - p.vz) *
        k;
      move("x", p.vx * dt);
      move("z", p.vz * dt);
      const oldY = p.y,
        wasGrounded = p.grounded;
      p.vy -= 10 * dt;
      p.y += p.vy * dt;
      p.grounded = false;
      let floor = groundY(p.x, p.z);
      let ceiling = Infinity;
      p.surface =
        state.zone === 0
          ? "sand"
          : state.zone === 2 || state.zone === 4
            ? "concrete"
            : "grass";
      for (const entry of nearbySolids(p.x, p.z)) {
        const b = activeBounds(entry);
        if (!b) continue;
        const surface = solidTop(entry, b, p.x, p.z);
        if (surface === -Infinity) continue;
        if (p.vy > 0 && oldY + PLAYER_HEIGHT <= b.min[1] + CONTACT_EPSILON)
          ceiling = Math.min(ceiling, b.min[1]);
        else if (
          p.vy <= 0 &&
          oldY >= surface - CONTACT_EPSILON &&
          p.y <= surface &&
          surface >= floor
        ) {
          floor = surface;
          p.surface = b.surface;
        }
      }
      if (p.y + PLAYER_HEIGHT > ceiling) {
        p.y = ceiling - PLAYER_HEIGHT;
        p.vy = 0;
        jumpBuffer = coyote = 0;
      }
      if (p.y <= floor) {
        p.y = floor;
        p.vy = 0;
        p.grounded = true;
      }
      const water = waterY(p.x, p.z);
      if (p.y < water - 0.8) {
        hurt(300);
        return;
      }
      if (p.y < water + 0.15) p.surface = "wet";
      if (!wasGrounded && p.grounded) sound("land");
      const travel = Math.hypot(p.vx, p.vz) * dt;
      state.steps += travel;
      stepDistance += p.grounded ? travel : 0;
      if (stepDistance > 1.8) {
        stepDistance = 0;
        sound("step", p, { surface: p.surface });
      }
      state.zone = zoneAt(p.z);
      state.progress = routeS(p.x, p.z) / 430;
      if (state.checkpoint === 0 && state.respawnS < 55 && -p.z >= 55) {
        state.respawnS = CLIMB_RESPAWN_S;
        saveLoadout();
        sound("checkpoint");
      }
      while (state.checkpoint < state.zone) {
        state.checkpoint++;
        state.respawnS = ZONES[state.checkpoint].s0 + 0.6;
        saveLoadout();
        hooks.checkpoint?.(state.checkpoint, ZONES[state.checkpoint].name);
        sound("checkpoint");
      }
      if (input.swap && !swapHeld && state.weapons.length > 1) {
        state.held = 1 - state.held;
        syncWeapon();
        sound("swap");
      }
      swapHeld = !!input.swap;
      if (input.charge && !chargeHeld && state.charges > 0) {
        state.charges--;
        bolt(
          "charge",
          "player",
          [p.x, p.y + 1.5, p.z],
          [
            -Math.sin(p.yaw) * Math.cos(p.pitch),
            Math.sin(p.pitch) + 0.4,
            -Math.cos(p.yaw) * Math.cos(p.pitch),
          ],
          12,
        );
        sound("charge-throw");
      }
      chargeHeld = !!input.charge;
      const a = state.weapons[state.held];
      w.kind = a.kind;
      w.firing = false;
      w.aim += (+!!input.aim - w.aim) * (1 - Math.exp(-dt * 12));
      w.raise = Math.max(0, w.raise - dt * 3);
      w.kick *= Math.exp(-dt * 10);
      w.spread *= Math.exp(-dt * 3);
      w.cooldown = Math.max(0, w.cooldown - dt);
      a.heat = Math.max(0, a.heat - dt * (w.venting ? 0.45 : 0.12));
      w.heat = a.heat;
      if (w.venting && a.heat <= 0.1) w.venting = false;
      if (input.reload || (!a.ammo && a.kind !== "arc")) reload();
      if (w.reload) {
        const old = w.reload;
        w.reload += dt / WEAPONS[a.kind].reload;
        if (old < 0.65 && w.reload >= 0.65) sound("reload-in");
        if (w.reload >= 1) {
          const n = Math.min(a.spare, WEAPONS[a.kind].mag - a.ammo);
          a.ammo += n;
          a.spare -= n;
          w.reload = 0;
          sound("reload-rack");
        }
      } else if (
        input.fire &&
        !input.sprint &&
        !w.venting &&
        !w.raise &&
        (a.kind === "arc" ? a.battery > 0 : a.ammo > 0)
      ) {
        w.firing = true;
        if (!w.cooldown) {
          if (a.kind === "rail") {
            if (!w.charging) sound("rail-charge");
            w.charging += dt / WEAPONS.rail.charge;
            if (w.charging >= 1) {
              shoot();
              w.charging = 0;
            }
          } else shoot();
        }
      } else w.charging = 0;
      let threats = 0;
      perceive();
      const fireCost = (kind) =>
        kind === "watcher" || kind === "bulwark" ? 2 : 1;
      let fireSlots =
        state.enemies.reduce(
          (n, e) => n + (e.hp > 0 && e.charge > 0 ? fireCost(e.kind) : 0),
          0,
        ) +
        state.bolts.reduce(
          (n, b) => n + (b.from === "enemy" ? fireCost(b.kind) : 0),
          0,
        );
      for (const e of state.enemies) {
        e.hit = Math.max(0, e.hit - dt * 5);
        if (e.hp <= 0) {
          e.dead = Math.min(1, e.dead + dt);
          continue;
        }
        if (e.deathDelay !== null) {
          e.deathDelay = Math.max(0, e.deathDelay - dt);
          if (!e.deathDelay) kill(e);
          continue;
        }
        if (
          state.quiet ||
          Math.abs(e.zone - state.zone) > 1 ||
          !e.deployed ||
          state.time < (e.wakeAt ?? 0) ||
          (e.zone === 1 && -p.z < 55)
        )
          continue;
        if (
          e.zone === 0 &&
          e.awareness === "idle" &&
          state.time < e.wakeAt + 0.1
        )
          hear(e, p);
        const m = MACHINES[e.kind],
          d = Math.hypot(p.x - e.x, p.z - e.z);
        if (e.awareness === "idle" || (!m.speed && e.awareness === "patrol"))
          e.yaw += dt * 0.5;
        if (e.visible) {
          threats++;
          e.yaw = Math.atan2(e.memory.x - e.x, e.memory.z - e.z);
        } else if (e.awareness === "suspicious" || e.awareness === "search")
          e.yaw = Math.atan2(e.memory.x - e.x, e.memory.z - e.z);
        if (e.shield < m.shield && state.time - e.lastHit > 5)
          e.shield = Math.min(m.shield, e.shield + 15 * dt);
        // Far actors think once a second and move in small, bounded steps only
        // in neighbouring zones. They never chase a live player through walls.
        if (d < 60) steer(e, dt);
        e.cooldown -= dt;
        if (e.charge && (!e.visible || d > m.range + 10)) {
          e.charge = 0;
          fireSlots -= fireCost(e.kind);
          e.cooldown = 0.5;
        }
        if (
          e.cooldown <= 0 &&
          e.visible &&
          (e.awareness === "engage" || e.charge > 0) &&
          d <= m.range + 10 &&
          (e.charge > 0 ||
            fireSlots + fireCost(e.kind) <= state.director.fireLimit)
        ) {
          if (!e.charge) {
            fireSlots += fireCost(e.kind);
            e.aim = { x: p.x, y: p.y + 1, z: p.z };
            sound(e.kind === "watcher" ? "watcher-aim" : "alert", e, {
              kind: e.kind,
            });
          }
          e.mode = "charge";
          e.charge += dt / (e.kind === "watcher" ? 1.5 : 0.8);
          if (e.charge < 0.8) e.aim = { x: p.x, y: p.y + 1, z: p.z };
          if (e.charge >= 1) {
            e.charge = 0;
            e.cooldown = m.delay;
            e.mode = "fire";
            const muzzle = m.muzzle,
              ox =
                e.x + muzzle[0] * Math.cos(e.yaw) + muzzle[2] * Math.sin(e.yaw),
              oz =
                e.z - muzzle[0] * Math.sin(e.yaw) + muzzle[2] * Math.cos(e.yaw),
              y = e.y + muzzle[1],
              tx = e.aim.x,
              tz = e.aim.z,
              ty = e.aim.y,
              dist = Math.hypot(tx - ox, ty - y, tz - oz),
              speed =
                e.kind === "watcher" ? 60 : e.kind === "bulwark" ? 18 : 14;
            const b = bolt(
              e.kind,
              "enemy",
              [ox, y, oz],
              [(tx - ox) / dist, (ty - y) / dist, (tz - oz) / dist],
              speed,
            );
            if (b && e.kind === "bulwark") b.vy += dist * 0.16;
            sound(
              e.kind === "bulwark" ? "bulwark-mortar" : e.kind + "-shot",
              e,
            );
          }
        }
      }
      state.combat +=
        (Math.min(1, threats / 4) - state.combat) * (1 - Math.exp(-dt * 3));
      for (let i = state.bolts.length - 1; i >= 0; i--) {
        const b = state.bolts[i];
        b.age += dt;
        const o = [b.x, b.y, b.z],
          v = [b.vx * dt, b.vy * dt, b.vz * dt],
          len = Math.hypot(...v),
          dir = v.map((n) => (len ? n / len : 0)),
          explosive = b.kind === "charge" || b.kind === "bulwark",
          t = trace(
            o,
            dir,
            len,
            b.from === "player" && b.kind === "arc",
            null,
            !explosive,
          );
        const ph =
          b.from === "enemy"
            ? rayBox(
                o,
                dir,
                {
                  min: [p.x - 0.3, p.y, p.z - 0.3],
                  max: [p.x + 0.3, p.y + 1.7, p.z + 0.3],
                },
                len,
              )
            : null;
        let end = false,
          contact = false;
        if (explosive) {
          if (b.kind === "charge" && !b.splashed && !b.settled && v[1] < 0) {
            const water = waterCrossing(o, dir, t.distance);
            if (water && (!t.hit || water.distance < t.distance)) {
              b.splashed = true;
              const splash = event("splash");
              splash.kind = "charge";
              splash.at.splice(0, 3, ...impactPoint(o, dir, water));
            }
          }
          if (!b.settled) b.vy -= 10 * dt;
          if (t.hit && !b.settled) {
            // Consume the step at contact; never apply its old travel after a bounce.
            contact = true;
            b.x += dir[0] * t.distance + t.normal[0] * 0.02;
            b.y += dir[1] * t.distance + t.normal[1] * 0.02;
            b.z += dir[2] * t.distance + t.normal[2] * 0.02;
            if (b.kind === "charge" && !b.bounced) {
              const into = Math.min(
                0,
                b.vx * t.normal[0] + b.vy * t.normal[1] + b.vz * t.normal[2],
              );
              b.vx = b.vx * 0.5 - into * 0.95 * t.normal[0];
              b.vy = b.vy * 0.5 - into * 0.95 * t.normal[1];
              b.vz = b.vz * 0.5 - into * 0.95 * t.normal[2];
              b.bounced = true;
              sound("charge-bounce", b);
            } else if (b.kind === "charge") {
              b.settled = true;
              b.vx = b.vy = b.vz = 0;
            } else {
              explode(b);
              end = true;
            }
          }
          if (!end && b.age >= 1.6) {
            explode(b);
            end = true;
          }
        } else if (t.hit || ph) {
          const hitPlayer = ph && (!t.hit || ph.distance < t.distance);
          if (hitPlayer) hurt(MACHINES[b.kind]?.damage || 10, b);
          else if (b.from === "player") damage(t, "arc");
          const contact = hitPlayer ? ph : t;
          const ev = event("bolt-hit");
          ev.kind = b.kind;
          ev.hit = hitPlayer ? "player" : t.hit;
          ev.index = hitPlayer ? -1 : t.index;
          ev.at.splice(0, 3, ...impactPoint(o, dir, contact));
          ev.normal.splice(0, 3, ...impactNormal(dir, contact.normal));
          end = true;
        }
        if (end || b.age > 8) {
          b.active = false;
          state.bolts.splice(i, 1);
        } else if (!b.settled && !contact) {
          b.x += v[0];
          b.y += v[1];
          b.z += v[2];
        }
      }
      for (let i = 0; i < 2; i++)
        if (
          state.stations[i].state === "cartel" &&
          !state.enemies.some(
            (e) => e.zone === entities.stations[i].zone && e.hp > 0,
          )
        ) {
          state.stations[i].state = "clear";
          sound("station-clear", entities.stations[i]);
        }
      for (const s of state.stations)
        if (s.state === "keeper") s.relight = Math.min(1, s.relight + dt * 0.5);
      if (!state.boss.alive && state.boss.dying < 1) {
        state.boss.dying = Math.min(1, state.boss.dying + dt * 0.25);
        siegePose(state.boss.dying, state.boss.pose);
        if (state.boss.dying === 1) {
          const flash = event("explode");
          flash.kind = "siege";
          flash.at.splice(
            0,
            3,
            siege.landing.x,
            siege.landing.y - 2.47,
            siege.landing.z,
          );
        }
      }
      if (!state.boss.alive && state.boss.dying >= 0.85) relight(2);
      // Clear the landing footprint before impact, including a late arrival.
      // This is a gentle shove, never damage or a camera teleport.
      if (
        !state.boss.alive &&
        state.boss.dying > 0.6 &&
        overlaps(p.x, p.z, wreckBounds, 0.6) &&
        p.y < wreckBounds.max[1]
      ) {
        const near = wreckBounds.max[2] + 0.6,
          far = wreckBounds.min[2] - 0.6;
        const target = p.z - far < near - p.z ? far : near;
        const step = ((near - far) / 2 / 0.4) * dt;
        p.z += clamp(target - p.z, -step, step);
        p.vz = 0;
        p.y = Math.max(p.y, groundY(p.x, p.z));
      }
      if (previousZone !== state.zone) {
        previousZone = state.zone;
        zoneTime = 0;
      }
      zoneTime += dt;
      if (
        state.zone === 3 &&
        !haulerDone &&
        zoneTime >= state.director.drop.delay
      ) {
        haulerDone = true;
        state.hauler = {
          x: -45,
          y: groundY(0, -255) + 25,
          z: -255,
          yaw: Math.PI / 2,
          phase: 0,
        };
        sound("hauler-arrive", state.hauler);
      }
      if (state.hauler) {
        const h = state.hauler;
        h.phase += dt / 14;
        const approach = smooth(0, 0.24, h.phase),
          exit = smooth(0.58, 1, h.phase);
        const hover = state.director.drop,
          floor = groundY(hover.x, hover.z);
        h.x = -45 + (hover.x + 45) * approach + 70 * exit;
        h.z = hover.z + 18 - 18 * approach - 38 * exit;
        h.y = floor + 18 + 18 * (1 - approach) + 42 * exit;
        h.descent = smooth(0.24, 0.4, h.phase);
        if (h.phase >= 0.4)
          for (const e of state.enemies)
            if (e.id >= 21 && e.id <= 25) e.deployed = true;
        if (h.phase >= 1) {
          sound("hauler-leave", h);
          state.hauler = null;
        }
      }
      for (let i = state.pickups.length - 1; i >= 0; i--) {
        const e = state.pickups[i];
        if (
          e.station !== undefined &&
          state.stations[e.station].state !== "keeper"
        )
          continue;
        const distance = Math.hypot(p.x - e.x, p.z - e.z);
        if (e.needsSpace) {
          if (distance < 1.5) continue;
          delete e.needsSpace;
        }
        if (distance > 1.4) continue;
        const carried = state.weapons.find((a) => a.kind === e.kind);
        if (e.kind === "ammo") {
          state.weapons.forEach((a) => {
            a.spare = WEAPONS[a.kind].spare;
            a.battery = 100;
          });
        } else if (e.kind === "charges") state.charges = 4;
        else if (carried) {
          carried.spare = WEAPONS[e.kind].spare;
          carried.battery = 100;
        } else continue;
        state.pickups.splice(i, 1);
        sound("pickup-ammo");
      }
      const t = target();
      state.prompt = t ? { type: t.type, kind: t.kind || t.id } : null;
      const need =
        t?.type === "station" ? 2.5 : t?.type === "beacon" ? 1.6 : 0.65;
      if (input.use && !useConsumed && t) {
        if (useId !== t.id) {
          useTime = 0;
          useId = t.id;
          if (t.type === "station") sound("rail-charge", t);
        }
        useTime += dt;
        if (useTime >= need) {
          use(t);
          useTime = 0;
          useConsumed = true;
        }
      } else {
        useTime = 0;
        useId = null;
      }
      state.useProgress = useTime / need;
      entities.pages.forEach((e, i) => {
        if (
          !state.pagesTaken[i] &&
          Math.hypot(e.x - p.x, e.z - p.z) < 1.6 &&
          Math.abs(e.y - p.y) < 3
        ) {
          state.pagesTaken[i] = true;
          hooks.page?.();
          sound("page", e);
        }
      });
      entities.stashes.forEach((e, i) => {
        if (!state.stashesTaken[i] && Math.hypot(e.x - p.x, e.z - p.z) < 1.5) {
          state.stashesTaken[i] = true;
          state.coins += 3;
          hooks.reward?.(3, 30);
          sound("coin", e);
        }
      });
      for (let i = state.drops.length - 1; i >= 0; i--) {
        const d = state.drops[i],
          r = Math.hypot(d.x - p.x, d.z - p.z);
        if (r < 2.5) {
          d.x += (p.x - d.x) * Math.min(1, dt * 8);
          d.z += (p.z - d.z) * Math.min(1, dt * 8);
          if (r < 0.5) {
            d.active = false;
            state.drops.splice(i, 1);
            state.coins += 3;
            hooks.reward?.(3, 30);
            sound("coin", d);
          }
        }
      }
    }
    function objective() {
      if (state.ending) return "The chain holds.";
      const i = state.stations.findIndex((s) => s.state !== "keeper");
      return (
        (state.zone === 1 && state.stations[0].state === "keeper"
          ? "Wellhead relit. Cross the causeway."
          : state.zone === 3 && state.stations[1].state === "keeper"
            ? "Fins relit. Reach the gate."
            : ZONES[state.zone].text) +
        (i >= 0
          ? " · STATION " +
            (i + 1) +
            (state.stations[i].state === "clear"
              ? " CLEAR · HOLD E AT PYLON"
              : "")
          : " · HOLD E AT BEACON")
      );
    }
    function setZone(n) {
      if (!Number.isInteger(n) || n < 0 || n > 5) return false;
      const q = at(ZONES[n].s0 + 0.6);
      Object.assign(p, q, {
        y: routeY(q.x, q.z),
        yaw: 0,
        pitch: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        health: 100,
        shield: 100,
        safe: 2,
        grounded: true,
      });
      state.zone = n;
      state.enemies = roster.map((e) => {
        const a = enemy(e);
        if (e.zone < n) {
          a.hp = 0;
          a.dead = 1;
          a.paid = true;
        }
        return a;
      });
      state.bolts.length = 0;
      boltPool.forEach((b) => (b.active = false));
      haulerDone = n > 3;
      zoneTime = 0;
      previousZone = n;
      state.hauler = null;
      state.checkpoint = n;
      state.respawnS = ZONES[n].s0 + 0.6;
      state.progress = -q.z / 430;
      state.stations.forEach((s, i) => {
        s.state = entities.stations[i].zone < n ? "keeper" : "cartel";
        s.relight = s.state === "keeper" ? 1 : 0;
      });
      state.hashrate =
        51.3 -
        state.stations.reduce(
          (v, s, i) => v + (s.state === "keeper" ? [0.7, 0.8, 1.6][i] : 0),
          0,
        );
      state.boss.alive = n < 5;
      state.boss.dying = n < 5 ? 0 : 1;
      siegePose(state.boss.dying, state.boss.pose);
      state.boss.clamps.forEach((c) =>
        Object.assign(c, {
          hp: n < 5 ? 180 : 0,
          shield: n < 5 ? 80 : 0,
          alive: n < 5,
        }),
      );
      state.weapons = [inventory("carbine")];
      state.held = 0;
      if (n >= 2) give("rail");
      saveLoadout();
      syncWeapon();
      return true;
    }
    return {
      state,
      ENDING_SECONDS,
      update,
      snapshot: () => JSON.parse(JSON.stringify(state)),
      objective,
      target,
      trace,
      hurt,
      spawn,
      give,
      setZone,
      killAll() {
        state.enemies.forEach((e) => {
          if (e.hp > 0) kill(e);
        });
      },
    };
  }
  return {
    create,
    ENDING_SECONDS,
    ZONES,
    route,
    groundY,
    SEA_Y,
    river,
    waterfall,
    waterY,
    steamVents,
    MAX_SLOPE,
    layout,
    entities,
    WEAPONS,
    MACHINES,
    siege,
    at,
    routeS,
    rayBox,
  };
});
