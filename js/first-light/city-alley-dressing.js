import { details } from "./city-alley-detail.js";

import { surfaceAge } from "./surfaces.js";

// Gravity wear and poured slabs use the shared surface shader's uniform styles.
export function ageWalls(material) {
  return surfaceAge(material, 1);
}
export function yardConcrete(material) {
  return surfaceAge(material, 2);
}

// These small, repeated objects never enter either planar mirror or shadow pass.
function dressing(ctx, zone) {
  const group = new ctx.T.Group();
  group.userData.noReflect = true;
  ctx.zoneGroup(zone).add(group);
  return details(ctx, group);
}

// Bent glass tubes use actual paths. The sign board, spacers and wiring remain
// visible when the tube is seen from the side or its light falls away.
function neon(d, T, { x, y, z, face, text, symbol, material, steel, dark }) {
  const point = (u, v, depth = 0) => [
    x + Math.sin(face) * depth + Math.cos(face) * u,
    y + v,
    z + Math.cos(face) * depth - Math.sin(face) * u,
  ];
  d.box(
    x,
    y,
    z,
    Math.abs(Math.sin(face)) > 0.5 ? 0.11 : 2.15,
    0.95,
    Math.abs(Math.sin(face)) > 0.5 ? 2.15 : 0.11,
    dark,
    0.02,
  );
  const path = (points, closed = false) => {
    const vertices = points.map(
      ([u, v]) => new T.Vector3(...point(u, v, 0.085)),
    );
    const curve = closed
      ? new T.CatmullRomCurve3(vertices, true, "centripetal")
      : new T.CurvePath();
    if (!closed)
      for (let i = 1; i < vertices.length; i++)
        curve.add(new T.LineCurve3(vertices[i - 1], vertices[i]));
    d.shape(
      new T.TubeGeometry(curve, points.length * 4, 0.015, 5, closed),
      material,
      [0, 0, 0],
    );
  };
  // Single-line architectural lettering, deliberately avoiding filled font quads.
  const letters = {
    C: [
      [0.34, 0.5],
      [0.08, 0.5],
      [0, 0.4],
      [0, 0.1],
      [0.08, 0],
      [0.34, 0],
    ],
    I: [
      [0.06, 0.5],
      [0.26, 0.5],
      [0.16, 0.5],
      [0.16, 0],
      [0.06, 0],
      [0.26, 0],
    ],
    P: [
      [0, 0],
      [0, 0.5],
      [0.25, 0.5],
      [0.34, 0.42],
      [0.34, 0.32],
      [0.25, 0.25],
      [0, 0.25],
    ],
    H: [
      [0, 0],
      [0, 0.5],
      [0, 0.25],
      [0.32, 0.25],
      [0.32, 0.5],
      [0.32, 0],
    ],
    E: [
      [0.32, 0.5],
      [0, 0.5],
      [0, 0],
      [0.32, 0],
      [0, 0],
      [0, 0.25],
      [0.26, 0.25],
    ],
    R: [
      [0, 0],
      [0, 0.5],
      [0.25, 0.5],
      [0.32, 0.42],
      [0.32, 0.32],
      [0.25, 0.25],
      [0, 0.25],
      [0.14, 0.25],
      [0.34, 0],
    ],
    K: [
      [0, 0],
      [0, 0.5],
      [0, 0.24],
      [0.32, 0.5],
      [0, 0.24],
      [0.34, 0],
    ],
    Y: [
      [0, 0.5],
      [0.16, 0.25],
      [0.32, 0.5],
      [0.16, 0.25],
      [0.16, 0],
    ],
    S: [
      [0.32, 0.5],
      [0.06, 0.5],
      [0, 0.4],
      [0.06, 0.28],
      [0.27, 0.24],
      [0.33, 0.14],
      [0.27, 0],
      [0, 0],
    ],
    O: [
      [0.08, 0],
      [0, 0.1],
      [0, 0.4],
      [0.08, 0.5],
      [0.26, 0.5],
      [0.34, 0.4],
      [0.34, 0.1],
      [0.26, 0],
      [0.08, 0],
    ],
    N: [
      [0, 0],
      [0, 0.5],
      [0.32, 0],
      [0.32, 0.5],
    ],
  };
  let u = -text.length * 0.19 + (symbol ? 0.35 : 0);
  for (const letter of text) {
    if (letters[letter])
      path(letters[letter].map(([a, b]) => [u + a, b - 0.16]));
    u += 0.39;
  }
  if (symbol === "key") {
    path(
      [
        [-0.88, -0.28],
        [-0.98, -0.15],
        [-0.88, -0.02],
        [-0.75, -0.15],
        [-0.88, -0.28],
      ],
      true,
    );
    path([
      [-0.76, -0.15],
      [-0.45, -0.15],
      [-0.45, -0.29],
      [-0.55, -0.29],
      [-0.55, -0.15],
    ]);
  } else if (symbol === "lock") {
    path([
      [-0.97, -0.3],
      [-0.97, 0.04],
      [-0.62, 0.04],
      [-0.62, -0.3],
      [-0.97, -0.3],
    ]);
    path([
      [-0.91, 0.04],
      [-0.91, 0.22],
      [-0.8, 0.3],
      [-0.68, 0.22],
      [-0.68, 0.04],
    ]);
  }
  for (const u of [-0.8, 0.8]) {
    d.rod(point(u, -0.3, -0.22), point(u, -0.3, 0.01), 0.025, steel);
    d.rod(point(u, 0.3, -0.22), point(u, 0.3, 0.01), 0.025, steel);
  }
  d.rod(point(0.94, -0.2, 0.02), point(0.94, -0.8, -0.03), 0.014, dark);
}

export function dressAlley(ctx) {
  const { T, kit } = ctx,
    d = dressing(ctx, 1);
  const steel = d.material("galvanized", { tint: 0x777d80 });
  const dark = d.material("paintedMetal", { tint: 0x39464a });
  const rust = d.material("rustedSteel", { scale: 0.8 });
  const rubber = d.material("rubber");
  const wood = d.material("wood", { scale: 1 });
  const glass = d.material("glass");
  const purple = kit.material({
    color: 0xc7a4ee,
    emissive: 0x9955df,
    emissiveIntensity: 3.2,
    roughness: 0.24,
  });
  const pink = kit.material({
    color: 0xf69bc9,
    emissive: 0xe84ca0,
    emissiveIntensity: 2.8,
    roughness: 0.24,
  });
  const cyan = kit.material({
    color: 0x98ece1,
    emissive: 0x39b8b0,
    emissiveIntensity: 2.3,
    roughness: 0.24,
  });
  neon(d, T, {
    x: 18.19,
    y: 4.65,
    z: -52.1,
    face: Math.PI / 2,
    text: "CIPHER",
    material: purple,
    steel,
    dark,
  });
  neon(d, T, {
    x: 20.6,
    y: 5.9,
    z: -59.6,
    face: 0,
    text: "KEYS",
    symbol: "key",
    material: pink,
    steel,
    dark,
  });
  neon(d, T, {
    x: 18.18,
    y: 4.85,
    z: -66.9,
    face: Math.PI / 2,
    text: "ON",
    symbol: "lock",
    material: cyan,
    steel,
    dark,
  });
  neon(d, T, {
    x: 15.8,
    y: 4.5,
    z: -42.98,
    face: Math.PI,
    text: "CIPHER",
    material: purple,
    steel,
    dark,
  });
  d.fixture([18.65, 4.45, -52.1], 0x9b62dd, 13, "neon");
  d.fixture([20.6, 5.7, -59.4], 0xe355a6, 15, "neon");
  for (const y of [5.6, 6.2])
    d.rod([21.98, y, -59.65], [20.2, y, -59.65], 0.025, steel);
  d.fixture([18.5, 4.65, -66.9], 0x60d6c3, 7, "neon");
  // Dense service clusters sit above a jumping player's head; wall-level
  // apparatus stays within the collision shell rather than blocking deck edges.
  for (const [x, z, face] of [
    [18.04, -50.7, 1],
    [21.96, -56.9, -1],
    [18.04, -63.7, 1],
  ]) {
    d.box(x + face * 0.24, 6.05, z, 0.48, 0.7, 1.15, dark, 0.03);
    d.box(x + face * 0.49, 6.05, z, 0.025, 0.57, 0.97, steel);
    for (let y = 5.82; y < 6.31; y += 0.07)
      d.box(x + face * 0.51, y, z, 0.025, 0.019, 0.94, rust);
    for (const dz of [-0.4, 0.4])
      d.rod([x, 5.58, z + dz], [x + face * 0.5, 5.65, z + dz], 0.025, steel);
    d.rod(
      [x + face * 0.21, 5.71, z + 0.44],
      [x + face * 0.21, 5.35, z + 0.44],
      0.019,
      rubber,
    );
    d.box(x + face * 0.1, 8.7, z - 1, 0.2, 0.65, 1.65, steel);
    d.rod(
      [x + face * 0.16, 6.6, z - 1],
      [x + face * 0.16, 10.5, z - 1],
      0.15,
      steel,
      10,
    );
    d.rod(
      [x + face * 0.16, 10.5, z - 1],
      [x + face * 0.65, 10.5, z - 1],
      0.15,
      rust,
      10,
    );
  }
  for (const [x, z, face] of [
    [18.035, -54, 1],
    [21.965, -64.3, -1],
  ]) {
    // Barred utility window above eye level with a recessed dark centre.
    d.box(x, 4.1, z, 0.025, 0.85, 1.2, glass);
    for (let zz = z - 0.55; zz < z + 0.6; zz += 0.15)
      d.rod(
        [x + face * 0.04, 3.65, zz],
        [x + face * 0.04, 4.55, zz],
        0.012,
        steel,
        5,
      );
    for (const y of [3.65, 4.55])
      d.rod(
        [x + face * 0.04, y, z - 0.61],
        [x + face * 0.04, y, z + 0.61],
        0.023,
        rust,
      );
  }
  // Street-facing service door, meters and bundled cables in the opening court.
  d.box(6.9, 1.15, -42.837, 1.12, 2.3, 0.025, dark);
  d.box(6.9, 0.35, -42.86, 1.03, 0.48, 0.02, steel);
  d.rod([7.29, 0.95, -42.88], [7.29, 1.21, -42.88], 0.018, steel);
  d.box(7.3, 0.92, -42.91, 0.07, 0.1, 0.025, rust);
  for (const x of [4.5, 8.2, 14.7]) {
    d.box(x, 1.65, -42.847, 0.42, 0.55, 0.025, dark);
    d.shape(
      new T.CircleGeometry(0.1, 16),
      glass,
      [x, 1.77, -42.87],
      [0, Math.PI, 0],
    );
    for (const dx of [-0.11, 0.11])
      d.rod([x + dx, 0.3, -42.85], [x + dx, 1.4, -42.85], 0.016, steel);
  }
  for (let i = 0; i < 5; i++)
    d.rod(
      [2.5, 3.9 + i * 0.035, -42.87],
      [17.3, 3.9 + i * 0.035, -42.87],
      0.012,
      rubber,
      5,
    );
  for (const [x, z, face, text] of [
    [18.04, -56.2, Math.PI / 2, "NO MASTER KEY"],
    [21.96, -62.4, -Math.PI / 2, "KEEP YOUR KEYS"],
  ]) {
    d.label(text, x, 3.2, z, 1.4, 0.35, [0, face, -0.04], {
      font: 38,
      background: "rgba(0,0,0,0)",
      colour: "#858c83",
      distress: true,
    });
    for (let i = 0; i < 3; i++)
      d.label(
        "RELAY / 09\nPRIVATE CHANNELS\nNIGHT SERVICE",
        x,
        1.4 + i * 0.13,
        z + 0.26 - i * 0.17,
        0.4,
        0.6,
        [0, face, (i - 1) * 0.06],
        {
          font: 28,
          background: i % 2 ? "#969785" : "#a8a397",
          colour: "#323b37",
          distress: true,
        },
      );
  }
  // A caged maintenance lamp lights one little work area on the otherwise
  // dark hoarding, opposite the basement CRT spill.
  const bulkhead = kit.material({
    color: 0xffcf8a,
    emissive: 0xffb45e,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  });
  d.box(14.7, 2.52, -46.975, 0.34, 0.32, 0.045, dark, 0.02);
  d.box(14.7, 2.52, -46.94, 0.27, 0.22, 0.025, bulkhead, 0.025);
  for (const x of [14.59, 14.7, 14.81])
    d.rod([x, 2.39, -46.915], [x, 2.65, -46.915], 0.009, steel, 5);
  d.fixture([14.7, 2.5, -46.7], 0xffbb72, 4);
  d.lightPool(14.7, -45.9, 3, 1.8, 0xd9a768);
  d.label(
    "ACCESS PERMIT / 09\nNIGHT WORKS\nKEEP CLEAR",
    13.85,
    1.5,
    -46.958,
    0.4,
    0.58,
    [0, 0, 0.035],
    { font: 30, background: "#aaa58f", colour: "#2c3933", distress: true },
  );
  // Ground-level clutter fills registered bounds at the court, before the climb.
  for (const [x, z, w, h, depth] of [
    [3.6, -46.25, 0.85, 0.72, 0.7],
    [8, -46.35, 1.1, 0.5, 0.7],
    [15.9, -46.25, 0.7, 0.35, 0.7],
  ]) {
    d.box(x, h / 2, z, w, h, depth, wood, 0.01);
    if (h < 0.4)
      for (let xx = x - w / 2 + 0.07; xx < x + w / 2; xx += 0.12)
        d.box(xx, h - 0.025, z, 0.085, 0.05, depth, wood);
    for (const dy of [-0.2, 0.15])
      d.box(
        x,
        Math.max(0.07, h / 2 + dy),
        z + depth / 2 + 0.005,
        w,
        0.055,
        0.025,
        rust,
      );
  }
  for (let i = 0; i < 7; i++) {
    const x = 5.4 + (i % 3) * 0.21,
      z = -46.42 + Math.floor(i / 3) * 0.08;
    d.shape(
      new T.SphereGeometry(0.22, 9, 6),
      rubber,
      [x, 0.19, z],
      [0.2, i, 0.12],
    );
    d.rod([x, 0.35, z], [x + 0.025, 0.44, z + 0.02], 0.025, rubber, 5);
  }
  // Discarded bicycle frame: flat in its registered low scrap tray.
  const a = [13.1, 0.11, -46.25],
    b = [13.65, 0.11, -46.25],
    c = [13.37, 0.14, -45.8];
  for (const [p, q] of [
    [a, b],
    [b, c],
    [c, a],
  ])
    d.rod(p, q, 0.018, rust);
  for (const x of [12.93, 13.9])
    d.shape(
      new T.TorusGeometry(0.3, 0.018, 5, 20),
      rubber,
      [x, 0.08, -46.13],
      [-Math.PI / 2, 0, 0],
    );
  // Continuous central gully and shallow irregular puddles, not new mirrors.
  for (let x = 2.6; x < 17.3; x += 0.23)
    d.box(x, 0.003, -45.15, 0.025, 0.005, 0.18, steel);
  d.box(10, 0.001, -45.15, 14.8, 0.002, 0.22, rubber);
  const amber = kit.material({
    color: 0xffc66b,
    emissive: 0xf7a234,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });
  // Recessed lens plates stay inside the structural wall, so tiny warning
  // lamps cannot become unintended jumping steps above the scaffold route.
  for (const z of [-53.85, -59.45, -65.05]) {
    d.box(17.97, 3.1, z, 0.06, 0.24, 0.22, dark);
    d.shape(
      new T.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      amber,
      [18.001, 3.1, z],
      [0, Math.PI / 2, 0],
    );
    d.shape(
      new T.TorusGeometry(0.085, 0.01, 5, 16),
      steel,
      [17.99, 3.1, z],
      [0, Math.PI / 2, 0],
    );
  }
  const puddle = d.canvasMaterial(
    (c, s) => {
      c.fillStyle = "#333d43";
      c.beginPath();
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2,
          r = 0.43 + Math.sin(i * 3.7) * 0.015;
        const x = s * (0.5 + Math.cos(a) * r),
          y = s * (0.5 + Math.sin(a) * r);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      c.fill();
    },
    {
      transparent: true,
      depthWrite: false,
      roughness: 0.035,
      metalness: 0.25,
      envMapIntensity: 1.5,
      weather: true,
    },
  );
  for (const z of [-54.8, -60.4])
    d.plane(20, 0.012, z, 3.9, 1.65, puddle, [-Math.PI / 2, 0, 0]);
  d.lightPool(20, -54.8, 3.6, 1.5, 0x8d6de8);
  d.lightPool(20, -60.4, 3.6, 1.5, 0xc8519f);
  const drips = kit.particles(ctx.quality === "low" ? 6 : 18, {
    colour: 0x9daeb8,
    size: 0.018,
    opacity: 0.3,
  });
  drips.userData.noReflect = true;
  ctx.zoneGroup(1).add(drips);
  d.finish();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dripSources = [
    [18.25, -50.26],
    [21.75, -56.46],
    [18.25, -63.26],
  ];
  return {
    update(time) {
      drips.visible = !reduced;
      const positions = drips.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const p = (time * 0.65 + i * 0.618) % 1,
          source = dripSources[i % 3];
        positions.setXYZ(i, source[0], 5.35 * (1 - p * p), source[1]);
      }
      positions.needsUpdate = true;
      amber.emissiveIntensity = reduced
        ? 1.1
        : 1.05 + 0.25 * Math.sin(time * 0.9);
    },
    dispose() {
      d.dispose();
      drips.geometry.dispose();
    },
  };
}

// Ground marks use one transparent atlas-sized sheet, aligned to the actual yard.
// Marks are sparse in the centre; oil and debris collect near storage and fences.
export function groundWear(d, x, z, width, depth, alley = false) {
  const mat = d.canvasMaterial(
    (c, s) => {
      let seed = 147;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 70; i++) {
        const px = random() * s,
          py = random() * s,
          r = 12 + random() * 65;
        const gradient = c.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(
          0,
          i % 4 ? "rgba(29,25,17,.32)" : "rgba(11,14,14,.66)",
        );
        gradient.addColorStop(1, "rgba(20,17,13,0)");
        c.fillStyle = gradient;
        c.fillRect(px - r, py - r, r * 2, r * 2);
      }
      for (let n = 0; n < 18; n++) {
        let px = random() * s,
          py = random() * s;
        c.strokeStyle = "rgba(15,18,16,.65)";
        c.lineWidth = 1 + random() * 2;
        c.beginPath();
        c.moveTo(px, py);
        for (let i = 0; i < 12; i++) {
          px += (random() - 0.5) * 28;
          py += 10 + random() * 9;
          c.lineTo(px, py);
        }
        c.stroke();
      }
      c.save();
      // Forklift tracks stay outdoors; the west-facing repair bay has its own
      // accumulated oil/dirt, not north-south tyres through the workbench.
      if (!alley) {
        const left = x - width / 2,
          north = z - depth / 2;
        c.beginPath();
        c.rect(0, 0, s, s);
        c.rect(
          ((21.4 - left) / width) * s,
          ((-94 - north) / depth) * s,
          (6.1 / width) * s,
          (8 / depth) * s,
        );
        c.clip("evenodd");
      }
      if (!alley)
        for (const start of [s * 0.28, s * 0.67])
          for (const offset of [-22, 22]) {
            c.strokeStyle = "rgba(23,22,18,.28)";
            c.lineWidth = 9;
            c.beginPath();
            c.moveTo(start + offset, 0);
            c.bezierCurveTo(
              start + offset + 30,
              s * 0.4,
              start + offset - 60,
              s * 0.75,
              start + offset - 50,
              s,
            );
            c.stroke();
            for (let y = 0; y < s; y += 8) {
              c.fillStyle = "rgba(17,18,14,.22)";
              c.fillRect(
                start + offset - 5 + Math.sin((y / s) * 5) * 20,
                y,
                13,
                2,
              );
            }
          }
      c.restore();
      for (let i = 0; i < 4800; i++) {
        const px = random() * s,
          py = random() * s;
        if (px > s * 0.12 && px < s * 0.88 && py > s * 0.15 && random() > 0.12)
          continue;
        c.fillStyle = i % 3 ? "rgba(95,88,64,.55)" : "rgba(16,20,17,.8)";
        c.fillRect(px, py, 0.6 + random() * 2, 0.6 + random() * 2);
      }
    },
    { transparent: true, depthWrite: false, roughness: 0.75, weather: true },
    1024,
  );
  d.plane(x, 0.006, z, width, depth, mat, [-Math.PI / 2, 0, 0]);
}

export function dressYard(ctx) {
  const { T, kit, sim } = ctx,
    d = dressing(ctx, 2);
  const steel = d.material("galvanized", { tint: 0x777d80 });
  const rust = d.material("rustedSteel", { scale: 0.8 });
  const paint = d.material("paintedMetal", { tint: 0x57665d });
  const rubber = d.material("rubber");
  const wood = d.material("wood", { scale: 1 });
  const tarp = d.material("plastic", { tint: 0x66756d });
  const orange = kit.material({
    color: 0xffcd8c,
    emissive: 0xff9f47,
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  groundWear(d, 20.05, -84.5, 15.7, 29);
  groundWear(d, 20, -104.5, 15.7, 12);
  for (const solid of sim.layout.filter(
    (b) =>
      b.kind.startsWith("yard-scrap") || b.kind.startsWith("garage-supply"),
  )) {
    const c = solid.max.map((v, i) => (v + solid.min[i]) / 2),
      size = solid.max.map((v, i) => v - solid.min[i]);
    if (solid.kind === "yard-scrap-skip") {
      const shell = new T.BoxGeometry(...size),
        positions = shell.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const taper = 0.72 + 0.28 * (positions.getY(i) / size[1] + 0.5);
        positions.setX(i, positions.getX(i) * taper);
        positions.setZ(
          i,
          positions.getZ(i) *
            (0.86 + 0.14 * (positions.getY(i) / size[1] + 0.5)),
        );
      }
      shell.computeVertexNormals();
      d.shape(shell, rust, c);
      for (const zz of [solid.min[2] - 0.01, solid.max[2] + 0.01]) {
        for (const x of [c[0] - 0.5, c[0] + 0.5])
          d.box(x, c[1], zz, 0.07, size[1], 0.055, steel);
        d.box(c[0], solid.max[1] - 0.06, zz, size[0] + 0.07, 0.12, 0.09, paint);
      }
      // Dense visible scrap stays below the rim; the solid top remains exact.
      d.box(
        c[0],
        solid.max[1] - 0.025,
        c[2],
        size[0] - 0.18,
        0.05,
        size[2] - 0.18,
        rubber,
      );
      for (let i = 0; i < 10; i++)
        d.box(
          c[0] + Math.sin(i * 3) * 0.55,
          solid.max[1] - 0.04,
          c[2] + Math.cos(i * 5) * 0.8,
          0.45,
          0.06,
          0.13,
          i % 2 ? wood : steel,
          0,
          [0, i * 0.7, 0.03],
        );
      d.label(
        "HALDEN / METAL ONLY",
        c[0],
        0.65,
        solid.max[2] + 0.032,
        1.1,
        0.27,
        [0, 0, 0],
        { font: 30, background: "#77745e", colour: "#262d2a", distress: true },
      );
    } else if (solid.kind === "yard-scrap-tarp") {
      d.box(...c, ...size, tarp, 0.02);
      const geo = new T.PlaneGeometry(size[0] + 0.06, size[2] + 0.08, 14, 18),
        p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getY(i);
        p.setZ(i, Math.sin(x * 22 + z * 3) * 0.024 + Math.sin(z * 13) * 0.012);
      }
      geo.computeVertexNormals();
      d.shape(
        geo,
        tarp,
        [c[0], solid.max[1] + 0.02, c[2]],
        [-Math.PI / 2, 0, 0],
      );
      for (const x of [solid.min[0] + 0.2, solid.max[0] - 0.2])
        d.rod(
          [x, solid.max[1] + 0.04, solid.min[2]],
          [x, solid.max[1] + 0.04, solid.max[2]],
          0.016,
          rubber,
        );
    } else if (solid.kind === "yard-scrap-reel") {
      d.shape(
        new T.CylinderGeometry(
          size[0] * 0.29,
          size[0] * 0.29,
          size[1] - 0.08,
          18,
        ),
        wood,
        c,
      );
      d.shape(
        new T.CylinderGeometry(size[0] * 0.48, size[0] * 0.48, 0.045, 20),
        wood,
        [c[0], solid.max[1] - 0.02, c[2]],
      );
      d.shape(
        new T.CylinderGeometry(size[0] * 0.48, size[0] * 0.48, 0.045, 20),
        wood,
        [c[0], 0.04, c[2]],
      );
      for (let y = 0.11; y < solid.max[1] - 0.05; y += 0.035)
        d.shape(
          new T.TorusGeometry(size[0] * 0.31, 0.019, 5, 24),
          rubber,
          [c[0], y, c[2]],
          [-Math.PI / 2, 0, 0],
        );
    } else if (solid.kind === "garage-supply-shelves") {
      // Cabinet backing fills collision bounds; shelf contents stay inside it.
      d.box(
        c[0] + size[0] / 2 - 0.035,
        c[1],
        c[2],
        0.07,
        size[1],
        size[2],
        paint,
      );
      for (const y of [0.12, 0.68, 1.24]) {
        d.box(c[0], y, c[2], size[0], 0.04, size[2], wood);
        for (let i = 0; i < 5; i++) {
          const z = solid.min[2] + 0.19 + i * 0.39;
          d.box(
            c[0] - 0.02,
            y + 0.15,
            z,
            0.29,
            0.26,
            0.31,
            i % 2 ? paint : wood,
            0.012,
          );
          for (let k = 0; k < 3; k++)
            d.box(
              c[0] - 0.174,
              y + 0.15,
              z - 0.09 + k * 0.07,
              0.012,
              0.1,
              0.012,
              steel,
            );
          d.box(c[0] - 0.18, y + 0.16, z, 0.012, 0.19, 0.27, steel);
          d.box(c[0] - 0.188, y + 0.18, z - 0.04, 0.008, 0.045, 0.11, rubber);
          d.shape(
            new T.CircleGeometry(0.009, 6),
            orange,
            [c[0] - 0.195, y + 0.12, z - 0.1],
            [0, -Math.PI / 2, 0],
          );
          d.shape(
            new T.CircleGeometry(0.024, 8),
            steel,
            [c[0] - 0.182, y + 0.14, z + 0.09],
            [0, -Math.PI / 2, 0],
          );
        }
      }
      for (const z of [solid.min[2], solid.max[2]])
        d.box(c[0], c[1], z, 0.045, size[1], 0.045, steel);
    } else if (solid.kind === "garage-supply-canopy") {
      d.box(...c, ...size, paint);
      for (const x of [solid.min[0] + 0.05, solid.max[0] - 0.05]) {
        for (const z of [solid.min[2] + 0.05, solid.max[2] - 0.05])
          d.rod([x, solid.max[1], z], [x, 3.18, z], 0.018, steel);
        d.box(x, c[1], c[2], 0.035, 0.16, size[2], rust);
      }
      for (let x = solid.min[0] + 0.15; x < solid.max[0]; x += 0.22)
        d.box(
          x,
          solid.min[1] - 0.003,
          c[2],
          0.025,
          0.006,
          size[2] - 0.08,
          steel,
        );
    } else if (solid.kind === "garage-supply-stool") {
      d.box(c[0], solid.max[1] - 0.05, c[2], size[0], 0.1, size[2], wood, 0.02);
      for (const dx of [-0.17, 0.17])
        for (const dz of [-0.17, 0.17])
          d.rod(
            [c[0] + dx, 0.02, c[2] + dz],
            [c[0] + dx, 0.52, c[2] + dz],
            0.025,
            steel,
          );
    }
  }
  // Garage structure: the existing collidable shell gets a corrugated skin,
  // rust band, rolled-door cassette, steel columns and exposed roof purlins.
  const corrugated = d.material("corrugated", { scale: 1, tint: 0x909b94 });
  d.box(21.392, 1.58, -93.2, 0.015, 3.14, 1.54, corrugated);
  d.box(21.392, 1.58, -86.8, 0.015, 3.14, 1.54, corrugated);
  d.box(24.4, 1.58, -85.992, 6.1, 3.14, 0.015, corrugated);
  d.box(24.4, 1.58, -94.008, 6.1, 3.14, 0.015, corrugated);
  d.box(27.508, 1.58, -90, 0.015, 3.14, 8, corrugated);
  for (const z of [-93.7, -92.4, -87.6, -86.3])
    d.box(21.39, 1.6, z, 0.02, 3.2, 0.08, rust);
  d.box(21.34, 3.05, -90, 0.2, 0.29, 4.85, paint, 0.02);
  for (const x of [22, 24.5, 27]) d.box(x, 3.16, -90, 0.08, 0.08, 7.4, rust);
  // Small articulated work lamp on the rear cabinet, clear of the PC sightline.
  d.rod([26.5, 1.6, -93.15], [26.28, 2.35, -93.05], 0.023, steel);
  d.rod([26.28, 2.35, -93.05], [25.85, 2.43, -92.9], 0.023, steel);
  d.shape(
    new T.ConeGeometry(0.15, 0.19, 14, 1, true),
    paint,
    [25.85, 2.37, -92.9],
    [0, 0, 0.25],
  );
  d.shape(new T.SphereGeometry(0.065, 9, 6), orange, [25.85, 2.29, -92.9]);
  d.fixture([25.8, 2.25, -92.8], 0xffb36c, 8);
  // Two strands of barbed wire above each fixed fence, with slack and tiny barbs.
  for (const x of [12.07, 28.07]) {
    for (let z = -70; z > -110; z -= 2.5) {
      d.rod([x, 2.02, z], [x, 2.35, z], 0.019, steel);
      for (const y of [2.12, 2.31]) {
        d.rod([x, y, z], [x, y - 0.045, z - 1.25], 0.009, rust, 4);
        d.rod([x, y - 0.045, z - 1.25], [x, y, z - 2.5], 0.009, rust, 4);
        for (let dz = 0.3; dz < 2.5; dz += 0.6)
          d.rod(
            [x - 0.04, y - 0.045, z - dz - 0.035],
            [x + 0.04, y + 0.025, z - dz + 0.035],
            0.007,
            rust,
            4,
          );
      }
    }
  }
  // The north gate is secured open against the existing fence; never across route.
  for (const x of [12.09, 28.09]) {
    d.box(x, 1, -106, 0.035, 1.82, 2.6, paint);
    d.rod([x - 0.03, 0.2, -107.3], [x - 0.03, 1.85, -104.7], 0.023, rust);
  }
  d.label(
    "PRIVATE YARD\nNO TIPPING",
    12.2,
    1.45,
    -95,
    1.05,
    0.5,
    [0, Math.PI / 2, 0],
    { font: 36, background: "#837e65", colour: "#252d29", distress: true },
  );
  // Uneven gravel and rubbish collect at the fence feet and under storage.
  const gravel = d.material("rock", { scale: 0.5, tint: 0x929184 });
  for (let i = 0; i < 220 * d.density; i++) {
    const x =
      i % 2 ? 12.35 + ((i * 7) % 15) * 0.06 : 27.65 - ((i * 11) % 14) * 0.06;
    const z = -71 - ((i * 31) % 390) * 0.1,
      size = 0.016 + (i % 7) * 0.008;
    d.box(x, 0.008, z, size * 1.7, 0.016, size, gravel, 0, [0, i * 1.7, 0]);
  }
  d.finish();
  return { dispose: () => d.dispose() };
}
