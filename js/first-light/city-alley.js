import { details } from "./city-alley-detail.js";
import { ageWalls, dressAlley, groundWear } from "./city-alley-dressing.js";

// CYPHERPUNKS: the route runs east at z=-45, then north through x=18..22.
// All platform skins derive from layout; nothing narrows the walking jumps.
export async function build(ctx) {
  const { T, kit, sim, scene, zoneGroup } = ctx;
  const group = zoneGroup(1),
    d = details(ctx, group);
  const brick = d.material("brick", { scale: 0.9, tint: 0xfffefd });
  ageWalls(brick);
  const paleBrick = d.material("brick", { scale: 1.2, tint: 0xa6aaa9 });
  const concrete = d.material("concrete", { scale: 3 });
  const repair = d.material("plaster", { scale: 0.8, tint: 0x807c78 });
  const steel = d.material("galvanized", { scale: 1.2, tint: 0x888c92 });
  const dishSteel = d.material("galvanized", { scale: 0.7, tint: 0xa3a9ad });
  dishSteel.side = T.DoubleSide;
  const darkSteel = d.material("paintedMetal", { tint: 0x57666e });
  const rust = d.material("rustedSteel", { scale: 0.8 });
  const timber = d.material("plywood", { scale: 0.65, tint: 0x7a8b75 });
  const glass = d.material("glass");
  const boards = d.material("wood", { scale: 1, tint: 0x8f9388 });

  const warm = d.canvasMaterial(
    (c, s) => {
      c.fillStyle = "#342f29";
      c.fillRect(0, 0, s, s);
      c.fillStyle = "#b6a17b";
      c.fillRect(s * 0.17, s * 0.13, s * 0.66, s * 0.58);
      c.fillStyle = "#706551";
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(s * 0.17, s * 0.13);
      c.lineTo(s * 0.17, s * 0.71);
      c.lineTo(0, s);
      c.fill();
      c.fillStyle = "#514a3d";
      c.beginPath();
      c.moveTo(s, 0);
      c.lineTo(s * 0.83, s * 0.13);
      c.lineTo(s * 0.83, s * 0.71);
      c.lineTo(s, s);
      c.fill();
      c.fillStyle = "#3e3930";
      c.fillRect(s * 0.26, s * 0.55, s * 0.48, s * 0.1);
      c.fillStyle = "#827155";
      for (let x = 0.04; x < 0.15; x += 0.025)
        c.fillRect(s * x, 0, s * 0.018, s);
      for (let x = 0.86; x < 0.98; x += 0.025)
        c.fillRect(s * x, 0, s * 0.018, s);
    },
    {
      color: 0xffdfb0,
      emissive: 0xffb575,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    },
  );
  warm.emissiveMap = warm.map;
  const dark = d.material("rubber");
  const netting = d.canvasMaterial(
    (c, s) => {
      c.strokeStyle = "#41534a";
      c.lineWidth = 2;
      for (let i = 0; i < s; i += 9) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + Math.sin(i) * 3, s);
        c.stroke();
        c.beginPath();
        c.moveTo(0, i);
        c.lineTo(s, i + Math.sin(i) * 3);
        c.stroke();
      }
      c.fillStyle = "#667367";
      for (let x = 0; x < s; x += 128) c.fillRect(x, 0, 6, s);
      c.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.ellipse(i * 79, (i * 137) % s, 7, 23, i, 0, Math.PI * 2);
        c.fill();
      }
    },
    { alphaTest: 0.35, side: T.DoubleSide, roughness: 0.95 },
  );
  const caution = d.canvasMaterial(
    (c, s) => {
      c.fillStyle = "#a59a58";
      c.fillRect(0, 0, s, s);
      c.fillStyle = "#343b37";
      for (let x = -s; x < s * 2; x += 96) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + 40, 0);
        c.lineTo(x + s + 40, s);
        c.lineTo(x + s, s);
        c.fill();
      }
    },
    { roughness: 0.8, weather: true },
  );
  // Continuous ground under both bends, stopping at the yard boundary.
  d.box(8, -0.08, -56.4, 56, 0.14, 27.2, d.material("asphalt", { scale: 1 }));
  groundWear(d, 10, -45, 15, 4, true);
  for (const b of sim.layout.filter(
    (b) => b.zone === 1 && b.owner !== "story",
  )) {
    const size = b.max.map((v, i) => v - b.min[i]),
      c = b.max.map((v, i) => (v + b.min[i]) / 2);
    if (b.kind === "fence") {
      d.fence([c[0], b.min[2]], [c[0], b.max[2]]);
      continue;
    }
    if (b.kind.startsWith("alley-")) continue;
    const mat =
      b.kind === "building"
        ? brick
        : b.kind === "deck" || b.kind === "barrier"
          ? timber
          : b.kind === "dumpster"
            ? darkSteel
            : b.kind === "stairs"
              ? steel
              : concrete;
    if (b.kind === "deck") {
      // The six-centimetre boards supply the original y=2.4 top. Keep the
      // hoarding cap underneath them, not coplanar with their exposed faces.
      d.box(
        c[0],
        c[1] - 0.03,
        c[2],
        size[0],
        size[1] - 0.06,
        size[2],
        mat,
        0.018,
      );
    } else d.box(...c, ...size, mat, b.kind === "building" ? 0 : 0.018);
    if (b.kind === "building") {
      // Stone plinth and corbel courses seal the thin collision wall into a mass.
      d.box(c[0], 0.32, c[2], size[0] + 0.025, 0.64, size[2] + 0.025, concrete);
      d.box(
        c[0],
        b.max[1] - 0.12,
        c[2],
        size[0] + 0.22,
        0.24,
        size[2] + 0.22,
        concrete,
      );
    }
    if (b.kind === "deck") {
      for (const x of [b.min[0] + 0.045, b.max[0] - 0.045]) {
        for (const z of [b.min[2] + 0.045, b.max[2] - 0.045])
          d.box(x, 1.2, z, 0.09, 2.4, 0.09, steel);
        for (let z = b.min[2] + 0.42; z < b.max[2]; z += 0.46)
          d.box(x, 1.15, z, 0.04, 2.25, 0.025, rust);
        d.rod(
          [x, 0.15, b.min[2] + 0.1],
          [x, 2.23, b.max[2] - 0.1],
          0.025,
          steel,
        );
        d.rod(
          [x, 2.23, b.min[2] + 0.1],
          [x, 0.15, b.max[2] - 0.1],
          0.025,
          steel,
        );
      }
      // Deck top remains exactly y=2.4; edge strips and bolts are flush.
      // Individual scaffold boards finish exactly at the collision top.
      for (let x = b.min[0] + 0.12; x < b.max[0]; x += 0.235)
        d.box(x, 2.37, c[2], 0.228, 0.06, size[2] - 0.025, boards);
      for (const z of [b.min[2] + 0.018, b.max[2] - 0.018])
        d.box(c[0], 2.31, z, 3.72, 0.17, 0.025, timber);
      for (const y of [0.18, 1.2, 2.22])
        d.box(c[0], y, b.max[2] + 0.005, 3.72, 0.09, 0.018, darkSteel);
      for (let x = 18.2; x < 21.9; x += 1.22)
        d.box(x, 1.2, b.max[2] + 0.007, 0.045, 2.4, 0.018, darkSteel);
      // Netting rises only along the wall; no rail closes a required jump.
      for (const x of [18.025, 21.975]) {
        d.plane(x, 4.4, c[2], size[2], 1.7, netting, [
          0,
          x < 20 ? Math.PI / 2 : -Math.PI / 2,
          0,
        ]);
        for (const z of [b.min[2] + 0.12, b.max[2] - 0.12]) {
          d.rod([x, 3.55, z], [x, 5.55, z], 0.024, steel);
          d.box(x, 4.3, z, 0.075, 0.065, 0.075, rust);
        }
      }
      d.label(
        "PERMIT / 0921\nINSPECTED 02 JAN\nSECURE ALL BOARDS",
        19.1,
        1.25,
        b.max[2] + 0.031,
        0.36,
        0.48,
        [0, 0, 0],
        { font: 30, background: "#bbb6a3", colour: "#343d37", distress: true },
      );
      for (const z of [b.min[2] + 0.05, b.max[2] - 0.05]) {
        d.box(c[0], 2.399, z, 3.7, 0.002, 0.08, boards);
        for (let x = 18.23; x < 21.8; x += 0.3)
          d.box(x, 2.4, z, 0.1, 0.002, 0.08, timber);
        d.plane(c[0], 2.403, z, 3.68, 0.095, caution, [-Math.PI / 2, 0, 0]);
      }
      d.plane(c[0], 1.02, b.max[2] + 0.028, 3.6, 1.85, netting);
      for (let x = 18.3; x < 21.8; x += 0.46)
        d.box(x, 1.16, b.max[2] + 0.003, 0.016, 2.26, 0.018, darkSteel);
      d.label(
        "WORKS / 08\nNO UNAUTHORISED ACCESS",
        c[0],
        1.35,
        b.max[2] + 0.045,
        1.35,
        0.64,
        [0, 0, 0],
        { background: "#c5b58b", colour: "#272820", font: 30 },
      );
    }
    if (b.kind === "stairs")
      d.box(c[0], b.max[1] - 0.012, b.max[2] - 0.035, 3.72, 0.024, 0.07, rust);
    if (b.kind === "dumpster") {
      for (const z of [-49.91, -48.09]) {
        d.box(20, 0.64, z, 3.62, 0.09, 0.055, rust);
        for (let x = 18.4; x < 21.8; x += 0.6)
          d.box(x, 0.64, z, 0.055, 0.9, 0.035, steel);
      }
      d.box(20, 1.17, -49, 3.66, 0.06, 1.96, dark);
      for (let x = 18.5; x < 21.8; x += 0.35)
        d.box(x, 1.198, -49, 0.025, 0.004, 1.8, darkSteel);
      d.label("CITY SALVAGE\n08–421", 20, 0.7, -47.993, 1.08, 0.43, [0, 0, 0], {
        background: "#9b9b7d",
        colour: "#272e29",
      });
    }
  }
  // Real roof masses behind the street barricade; never expose the world's edge.
  const backdrop = new T.Group();
  scene.add(backdrop);
  const back = details(ctx, backdrop);
  for (const [x, z, w, h, depth] of [
    [-3, -57, 17, 19, 16],
    [10, -60, 15, 16, 21],
    [27, -57, 9, 18, 25],
    [2, -79, 16, 13, 15],
  ]) {
    back.box(x, h / 2, z, w, h, depth, paleBrick);
    back.box(x, h + 0.15, z, w + 0.3, 0.3, depth + 0.3, concrete);
    for (let xx = x - w / 2 + 1; xx < x + w / 2; xx += 2.4)
      for (let y = 5; y < h - 1; y += 3) {
        back.box(xx, y, z + depth / 2 + 0.08, 1.1, 1.55, 0.012, glass);
        back.box(xx, y - 0.82, z + depth / 2 + 0.1, 1.3, 0.1, 0.2, concrete);
        back.box(xx, y, z + depth / 2 + 0.095, 0.045, 1.5, 0.03, darkSteel);
        if (Math.round(xx * 3 + y) % 5 === 0)
          back.box(xx, y, z + depth / 2 + 0.04, 0.92, 1.4, 0.025, warm);
      }
    back.box(x + 1, h + 0.65, z + 1, 2.4, 1.3, 2, steel);
    for (const dx of [-2, 3]) {
      back.rod([x + dx, h, z], [x + dx, h + 3.8, z], 0.045, darkSteel);
      for (let y = h + 2; y < h + 3.7; y += 0.5)
        back.rod([x + dx - 0.8, y, z], [x + dx + 0.8, y, z], 0.018, steel);
    }
  }
  back.finish();
  d.label(
    "SITE CLOSED\nPEDESTRIAN ACCESS →",
    10.8,
    2.25,
    -46.975,
    3.1,
    0.7,
    [0, 0, 0],
    { background: "#a89b71", colour: "#292d2c", font: 36 },
  );
  for (const y of [0.18, 1.75, 3.38])
    d.box(5.4, y, -46.97, 24.8, 0.12, 0.035, darkSteel);
  for (let x = -5; x < 17.5; x += 2.3)
    d.box(x, 1.75, -46.98, 0.085, 3.45, 0.04, rust);
  // Horizontal service court: basement terminal room, exits and a shutter.
  for (let x = 3.4; x < 17; x += 2.2) {
    d.box(x, 3.25, -42.82, 1.45, 2.05, 0.035, glass);
    d.box(x, 2.17, -42.87, 1.65, 0.14, 0.14, concrete);
    d.box(x, 3.25, -42.846, 0.045, 2.04, 0.025, steel);
  }
  d.box(5.1, 1.05, -42.813, 1.25, 2.1, 0.025, darkSteel);
  d.label(
    "SERVICE\nKEEP CLEAR",
    5.1,
    1.65,
    -42.838,
    0.6,
    0.35,
    [0, Math.PI, 0],
    { font: 30, background: "#323b3c", colour: "#d9d7bf" },
  );
  const cipher = d.canvasMaterial(
    (c, s) => {
      c.fillStyle = "#071310";
      c.fillRect(0, 0, s, s);
      c.font = "16px monospace";
      for (let row = 0; row < 48; row++) {
        c.fillStyle = row % 7 ? "#81bda9" : "#b4e6bd";
        let line = "";
        for (let i = 0; i < 42; i++)
          line += "0123456789abcdef"[
            (row * 13 + i * 7 + ((i * row) % 11)) % 16
          ];
        c.fillText(line, 12, row * 22 + 18);
      }
      c.fillStyle = "rgba(0,0,0,.33)";
      for (let y = 0; y < s; y += 4) c.fillRect(0, y, s, 1);
    },
    { emissive: 0x6ac79e, emissiveIntensity: 0.6, roughness: 0.2 },
  );
  cipher.emissiveMap = cipher.map;
  cipher.map.wrapS = cipher.map.wrapT = T.RepeatWrapping;
  function relayScreen(x, y, z, w, h, angles, phase) {
    const geo = new T.PlaneGeometry(w, h),
      uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) + phase * 0.3, uv.getY(i) + phase);
    d.shape(geo, cipher, [x, y, z], angles);
  }
  // The deep black surround and six separate bevelled bezels read as CRTs
  // behind basement glass, without adding a walk-through room to the layout.
  d.box(11.2, 0.8, -42.823, 3.9, 1.48, 0.035, dark);
  for (let i = 0; i < 6; i++) {
    const x = 9.62 + (i % 3) * 1.55,
      y = 0.45 + Math.floor(i / 3) * 0.7;
    d.box(x, y, -42.85, 1.2, 0.62, 0.045, darkSteel, 0.025);
    relayScreen(x, y + 0.02, -42.878, 1.04, 0.46, [0, Math.PI, 0], i * 0.137);
  }
  d.fixture([11.2, 0.8, -42.95], 0x6cbaaf, 2.4, "screen");
  d.fixture([16, 4.3, -43.5], 0x8d6de8, 14, "neon");
  d.lightPool(15.8, -44.8, 3.4, 2.8, 0x8d6de8);
  // Long alley elevations: windows, rusted services and interrupted fire escapes.
  for (const side of [-1, 1]) {
    const x = side < 0 ? 18.015 : 21.985;
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    // Old render patches, conduit bundles and meter covers break the corridor's
    // symmetry. All reachable surfaces stay flush with the structural shell.
    for (const [z, w, y, h] of side < 0
      ? [
          [-51.4, 1.8, 2.9, 0.7],
          [-60.5, 2.1, 1.2, 2.1],
          [-68, 2, 3.3, 1],
        ]
      : [
          [-53.7, 2.4, 1.5, 2.8],
          [-64.5, 1.3, 3.7, 1.1],
        ]) {
      const shape = new T.Shape();
      const points = [
        [-0.5, -0.5],
        [-0.21, -0.5],
        [-0.18, -0.46],
        [0.5, -0.49],
        [0.48, -0.12],
        [0.5, 0.12],
        [0.46, 0.5],
        [0.14, 0.47],
        [-0.12, 0.5],
        [-0.49, 0.45],
        [-0.47, 0.15],
        [-0.5, -0.2],
      ];
      points.forEach(([px, py], i) =>
        i ? shape.lineTo(px * w, py * h) : shape.moveTo(px * w, py * h),
      );
      shape.closePath();
      d.shape(
        new T.ShapeGeometry(shape),
        repair,
        [x - side * 0.008, y, z],
        [0, face, 0],
      );
    }
    for (const z of side < 0 ? [-50.5, -59.8] : [-55, -65.8]) {
      d.box(x - side * 0.025, 3.2, z, 0.05, 0.7, 0.48, darkSteel, 0.01);
      for (let dz = -0.14; dz < 0.2; dz += 0.1)
        d.rod(
          [x - side * 0.025, 2.65, z + dz],
          [x - side * 0.025, 0.35, z + dz],
          0.012,
          steel,
          5,
        );
      d.label("240 V", x - side * 0.056, 3.22, z, 0.33, 0.14, [0, face, 0], {
        background: "#9b9e8a",
        colour: "#252c2b",
        font: 44,
      });
    }
    for (let z = -49; z > -70; z -= 3.7) {
      for (const y of [6.4, 9.4]) {
        d.box(x, y, z, 0.045, 1.55, 1.25, glass);
        d.box(x - side * 0.07, y - 0.84, z, 0.18, 0.14, 1.45, concrete);
        d.box(x - side * 0.025, y, z, 0.065, 1.54, 0.04, steel);
        d.box(x - side * 0.025, y, z, 0.065, 0.04, 1.25, steel);
      }
      d.rod([x, 0.3, z + 1.5], [x, 11.8, z + 1.5], 0.063, rust, 10);
      for (let y = 0.5; y < 11.8; y += 1.9)
        d.box(x - side * 0.04, y, z + 1.5, 0.15, 0.065, 0.18, steel);
      if (z < -51) {
        d.box(x, 1.14, z, 0.035, 2.25, 1.04, darkSteel);
        d.label(
          "DANGER\nHIGH VOLTAGE",
          x - side * 0.025,
          1.7,
          z,
          0.55,
          0.3,
          [0, face, 0],
          { background: "#bdb58b", colour: "#292b26", font: 31 },
        );
      }
    }
    for (const z of [-52.2, -62.8]) {
      // Kept well above the player's head even from the raised platforms.
      d.box(x - side * 0.45, 7.1, z, 0.9, 0.13, 2.8, darkSteel);
      for (const dz of [-1.3, 1.3]) {
        d.rod([x, 6, z + dz], [x - side * 0.85, 7, z + dz], 0.035, rust);
        d.rod(
          [x - side * 0.83, 7.1, z + dz],
          [x - side * 0.83, 8.15, z + dz],
          0.026,
          steel,
        );
      }
      d.rod(
        [x - side * 0.83, 8.15, z - 1.3],
        [x - side * 0.83, 8.15, z + 1.3],
        0.028,
        steel,
      );
      for (let zz = z - 1.2; zz < z + 1.3; zz += 0.17)
        d.box(x - side * 0.43, 7.18, zz, 0.85, 0.025, 0.035, steel);
      for (let y = 7.2; y < 11.9; y += 0.28)
        d.rod(
          [x - side * 0.15, y, z + 1],
          [x - side * 0.15, y, z + 1.45],
          0.018,
          steel,
        );
      for (const dz of [1, 1.45])
        d.rod(
          [x - side * 0.15, 7.1, z + dz],
          [x - side * 0.15, 12, z + dz],
          0.025,
          steel,
        );
    }
    // Ventilation runs and louvres use depth and small discontinuities.
    d.box(x - side * 0.18, 10.9, -58.3, 0.36, 0.4, 18.5, steel);
    for (const z of [-50.9, -58.4, -67.2]) {
      d.box(x - side * 0.12, 5.4, z, 0.24, 0.75, 1.15, darkSteel, 0.03);
      for (let y = 5.12; y < 5.7; y += 0.09)
        d.box(x - side * 0.25, y, z, 0.025, 0.032, 1.03, steel);
    }
    // Shallow satellite bowls sit above the playable envelope, with offset feed
    // arms and wall brackets rather than disks pasted onto the facade.
    const bowl = new T.SphereGeometry(
      0.48,
      18,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    d.shape(
      bowl,
      dishSteel,
      [x - side * 0.18, 11.3, side < 0 ? -54.5 : -64],
      [0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2],
    );
    const dishZ = side < 0 ? -54.5 : -64;
    d.rod([x, 10.8, dishZ], [x - side * 0.28, 11.3, dishZ], 0.035, rust);
    d.rod(
      [x - side * 0.18, 10.97, dishZ],
      [x - side * 0.58, 11.32, dishZ],
      0.022,
      steel,
    );
  }
  // Upper relay window over the hoarding, with a warm-purple light balance.
  d.box(18.035, 4.2, -56.5, 0.055, 1.35, 3.5, darkSteel);
  for (let z = -55.3; z > -58; z -= 1.15)
    relayScreen(
      18.07,
      4.2,
      z,
      0.94,
      0.92,
      [0, Math.PI / 2, 0],
      (z + 55.3) * 0.21,
    );
  for (const y of [4.86, 4.94, 5.02])
    d.rod([21.965, y, -49], [21.965, y, -69.1], 0.012, dark);
  for (const z of [-52.8, -58.9, -65.3]) {
    d.box(22.015, 4.94, z, 0.075, 0.4, 0.5, darkSteel, 0.01);
    for (const dz of [-0.21, 0.21])
      d.box(21.97, 4.94, z + dz, 0.025, 0.32, 0.025, steel);
  }
  // Catenary cables have sag, not perfectly straight floating strings.
  for (const [z, drop] of [
    [-49.5, 0.7],
    [-57.4, 0.45],
    [-66, 0.8],
  ]) {
    for (let i = 0; i < 12; i++) {
      const x1 = 18 + i / 3,
        x2 = x1 + 1 / 3;
      const y = (x) => 9 - drop * Math.sin(((x - 18) / 4) * Math.PI);
      d.rod([x1, y(x1), z], [x2, y(x2), z + 0.015], 0.018, dark);
    }
  }
  for (const [z, text, colour] of [
    [-51, "PRIVACY\nIS A RIGHT", "#aca394"],
    [-61, "DO NOT\nTRUST. VERIFY.", "#8f889c"],
    [-68.6, "PEER TO PEER\n03 / 01 / 09", "#9fa49b"],
  ]) {
    d.label(text, 21.96, 3.9, z, 0.68, 0.91, [0, -Math.PI / 2, -0.04], {
      background: colour,
      colour: "#232b2d",
      font: 36,
      distress: true,
    });
  }
  // Faded ink directly on the render, distinct from the pasted paper notices.
  d.label(
    "END TO END / NO MASTER KEY",
    18.026,
    3.22,
    -67.8,
    1.72,
    0.22,
    [0, Math.PI / 2, 0],
    {
      background: "rgba(0,0,0,0)",
      colour: "#9fa49b",
      font: 38,
      distress: true,
    },
  );
  // Individual drain slots and litter sit flush; no unregistered obstacle props.
  for (const z of [-46.4, -69.2]) {
    d.box(20.8, -0.002, z, 0.7, 0.006, 0.8, dark);
    for (let zz = z - 0.35; zz < z + 0.4; zz += 0.09)
      d.box(20.8, 0.003, zz, 0.67, 0.004, 0.025, steel);
  }
  const paper = d.material("paper", { tint: 0xa7a08b });
  paper.userData.noReflect = true;
  for (let i = 0; i < 18 * d.density; i++) {
    const x = 18.1 + ((i * 73) % 37) / 10,
      z = -68.6 - ((i * 13) % 11) / 10;
    d.box(x, 0.007, z, 0.1 + (i % 3) * 0.03, 0.004, 0.17, paper, 0, [
      0,
      i * 2.3,
      0,
    ]);
  }
  // Light-catching rain belongs to this bent court, rather than a large rain
  // volume over the entire world. It is one instanced draw, animated on the GPU.
  const rainMaterial = kit.material({
    side: T.DoubleSide,
    color: 0x8e9bac,
    emissive: 0x61718f,
    emissiveIntensity: 0.14,
    roughness: 0.35,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const rainBase = rainMaterial.onBeforeCompile;
  rainMaterial.onBeforeCompile = (shader) => {
    rainBase(shader);
    shader.vertexShader =
      "uniform float time;varying vec2 dropUV;varying float alleyRainTip;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
alleyRainTip=position.y/.38;dropUV=uv;
float dropDistance=length(cameraPosition-(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz);
transformed.xz*=max(1.,dropDistance*.0015/0.006);
transformed.y+=mod(instanceMatrix[3].y-time*6.5,12.)-instanceMatrix[3].y;
transformed.x+=position.y*.12;`,
    );
    shader.fragmentShader =
      "varying vec2 dropUV;varying float alleyRainTip;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      "diffuseColor.a*=smoothstep(0.,.35,dropUV.x)*(1.-smoothstep(.65,1.,dropUV.x))*rain*(1.-smoothstep(.12,.5,abs(alleyRainTip)));\n#include <alphatest_fragment>",
    );
  };
  rainMaterial.customProgramCacheKey = () => "alley-rain-v1";
  const rainGeometry = new T.PlaneGeometry(0.006, 0.49400000000000005);
  const rainMatrices = [],
    random = (i) => {
      const n = Math.sin(i * 73.19 + 51.4) * 43758.5;
      return n - Math.floor(n);
    };
  const count =
    ctx.quality === "low" ? 220 : ctx.quality === "ultra" ? 1500 : 800;
  for (let i = 0; i < count; i++) {
    const horizontal = i < count * 0.35;
    rainMatrices.push(
      new T.Matrix4().makeTranslation(
        horizontal ? random(i) * 20 : 18.08 + random(i) * 3.84,
        random(i + 500) * 12,
        horizontal ? -43.1 - random(i + 800) * 3.5 : -47 - random(i + 800) * 23,
      ),
    );
  }
  const rainMesh = kit.instances(rainGeometry, rainMaterial, rainMatrices);
  rainMesh.frustumCulled = false;
  group.add(rainMesh);
  // Two distinct pools guide the turn, then rake the deck undersides.
  d.flood(7, 2.8, -43.05, 42);
  d.flood(21.65, 3.25, -48.8, 46);
  // Standard 1.22 x 2.44 m sheets with exposed screw heads at the turn.
  for (let x = 1.85; x < 17.2; x += 1.22) {
    d.box(x, 1.22, -46.97, 1.208, 2.432, 0.025, timber, 0.003);
    for (const dx of [-0.55, 0.55])
      for (const y of [0.12, 1.22, 2.32])
        d.shape(new T.SphereGeometry(0.009, 6, 4), steel, [x + dx, y, -46.946]);
  }
  const dressing = dressAlley(ctx);
  rainMesh.userData.noReflect = true;
  d.finish();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    update({ snapshot, time }) {
      dressing.update(time);
      backdrop.visible = snapshot.zone <= 3;
      rainMesh.visible = !reduced;
      // Smooth scroll only: no flicker, no update-time shader/material creation.
      if (!reduced) cipher.map.offset.y = (time * 0.012) % 1;
    },
    dispose() {
      dressing.dispose();
      d.dispose();
      back.dispose();
      rainGeometry.dispose();
      scene.remove(backdrop);
    },
  };
}
