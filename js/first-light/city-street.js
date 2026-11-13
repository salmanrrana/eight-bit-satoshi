/** BROKEN WORLD: authored street shell, furnishings and rain. No gameplay actors.
 * Static detail is instanced by material; the shared kit owns PBR resources.
 */
import { surface } from "./surfaces.js";
import { weatherMasonry, roomMaterial } from "./city-street-facades.js";
import { streetWater, wearRoadPaint } from "./city-street-water.js";
import { streetDetails } from "./city-street-details.js";
import { Reflector } from "three/addons/objects/Reflector.js";

export async function build(ctx) {
  const { T, kit, quality, sim, scene, zoneGroup } = ctx;
  const group = zoneGroup(0),
    low = quality === "low";
  const extras = [],
    unregister = [],
    instances = [],
    batches = new Map();
  const matrix = new T.Matrix4(),
    rotation = new T.Quaternion();
  const euler = new T.Euler(),
    position = new T.Vector3(),
    scale = new T.Vector3();
  const unit = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(1, 1, 1, low ? 16 : 32);
  const plane = new T.PlaneGeometry(1, 1),
    round = kit.roundedBox(1, 1, 1, 0.045);
  extras.push(unit, cylinder, plane);
  const mats = {
    asphalt: surface(kit, "asphalt", { scale: 0.85 }),
    paving: surface(kit, "paving", { scale: 1.2 }),
    kerb: surface(kit, "kerbstone", { scale: 0.7 }),
    stone: weatherMasonry(surface(kit, "cutStone", { scale: 1 }), extras),
    column: surface(kit, "rock", {
      scale: 0.65,
      space: "object",
      tint: 0xd4c9ae,
    }),
    concrete: surface(kit, "concrete", { scale: 2 }),
    brick: surface(kit, "brick", { scale: 1 }),
    steel: surface(kit, "paintedMetal", { scale: 0.8, tint: 0x71818b }),
    rust: surface(kit, "rustedSteel", { scale: 0.6 }),
    brass: surface(kit, "brass", { scale: 0.5 }),
    wood: weatherMasonry(
      surface(kit, "plywood", { scale: 1.3, tint: 0x9a9985 }),
      extras,
    ),
    glass: surface(kit, "glass"),
    black: surface(kit, "rubber"),
    paper: surface(kit, "paper", { tint: 0xb4b1a3 }),
    paint: kit.material({ color: 0xbcb59b, roughness: 0.5, weather: true }),
    yellow: kit.material({ color: 0xc6a743, roughness: 0.48, weather: true }),
    orange: kit.material({ color: 0xb9581e, roughness: 0.55, weather: true }),
    sodium: kit.material({
      color: 0xffd497,
      emissive: 0xffb65c,
      emissiveIntensity: 3.5,
      roughness: 0.3,
    }),
    cold: kit.material({
      color: 0xb9d8dc,
      emissive: 0xa4d3de,
      emissiveIntensity: 1.4,
    }),
    red: surface(kit, "paintedMetal", { scale: 0.45, tint: 0x8c3225 }),
  };
  wearRoadPaint(mats.paint, kit);
  wearRoadPaint(mats.yellow, kit);
  const chipped = round.clone();
  extras.push(chipped);
  const chippedPosition = chipped.attributes.position;
  for (let i = 0; i < chippedPosition.count; i++) {
    const x = chippedPosition.getX(i),
      y = chippedPosition.getY(i),
      z = chippedPosition.getZ(i);
    const cut = Math.max(0, (x - 0.2) * (z - 0.15) * (-y + 0.15)) * 0.7;
    chippedPosition.setXYZ(i, x - cut, y + cut * 0.6, z - cut * 0.4);
  }
  chipped.computeVertexNormals();
  const facadeStone = [0xd8d0bd, 0xbcc6c1, 0x929c9d, 0xc1b4a5].map((tint, i) =>
    weatherMasonry(
      surface(kit, i === 2 ? "plaster" : "cutStone", { scale: 1, tint }),
      extras,
    ),
  );
  const facadeBrick = [0xffffff, 0xc3b69f, 0x9c8e88, 0xc9c5bd].map((tint, i) =>
    weatherMasonry(
      surface(kit, i === 3 ? "plaster" : "brick", { scale: 1, tint }),
      extras,
      true,
    ),
  );
  // All dimensions are world metres. Decorative boxes share unit geometry.
  function batch(
    geometry,
    material,
    x,
    y,
    z,
    w,
    h,
    d,
    rx = 0,
    ry = 0,
    rz = 0,
    shadow = false,
    parent = group,
  ) {
    const key = `${geometry.id}:${material.id}:${shadow}:${parent.id}`;
    if (!batches.has(key))
      batches.set(key, { geometry, material, matrices: [], shadow, parent });
    position.set(x, y, z);
    scale.set(w, h, d);
    rotation.setFromEuler(euler.set(rx, ry, rz));
    batches
      .get(key)
      .matrices.push(new T.Matrix4().compose(position, rotation, scale));
  }
  const box = (m, x, y, z, w, h, d, shadow = false, bevel = false) =>
    batch(
      bevel ? (m === mats.stone ? chipped : round) : unit,
      m,
      x,
      y,
      z,
      w,
      h,
      d,
      0,
      0,
      0,
      shadow,
    );
  const pole = (m, x, y, z, r, h, shadow = false) =>
    batch(cylinder, m, x, y, z, r, h, r, 0, 0, 0, shadow);
  function beam(m, a, b, radius = 0.04) {
    const mid = new T.Vector3(...a)
      .add(new T.Vector3(...b))
      .multiplyScalar(0.5);
    const delta = new T.Vector3(...b).sub(new T.Vector3(...a));
    rotation.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    const key = `${cylinder.id}:${m.id}:false:${group.id}`;
    if (!batches.has(key))
      batches.set(key, {
        geometry: cylinder,
        material: m,
        matrices: [],
        parent: group,
      });
    batches
      .get(key)
      .matrices.push(
        matrix
          .compose(mid, rotation, scale.set(radius, delta.length(), radius))
          .clone(),
      );
  }
  function fixture(x, y, z, colour, intensity, kind = "lamp") {
    unregister.push(
      kit.addLightFixture({ position: [x, y, z], colour, intensity, kind }),
    );
  }
  function sign(text, x, y, z, w, h, side = 0, options = {}) {
    const texture = kit.text(text, {
      width: 1024,
      height: Math.max(128, Math.round((1024 * h) / w)),
      font: 46,
      ...options,
    });
    const m = kit.material({
      map: texture,
      roughness: 0.6,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: options.glow ?? 0,
    });
    const mesh = new T.Mesh(plane, m);
    if (options.face) {
      const c = texture.image,
        painter = c.getContext("2d");
      painter.fillStyle = options.background ?? "#17202b";
      painter.fillRect(0, 0, c.width, c.height);
      painter.fillStyle = options.colour ?? "#eee";
      painter.font = `${options.font ?? 46}px ${options.face}`;
      painter.textAlign = "center";
      painter.textBaseline = "middle";
      const lines = text.split("\n");
      lines.forEach((line, i) =>
        painter.fillText(
          line,
          c.width / 2,
          c.height / 2 +
            (i - (lines.length - 1) / 2) * (options.font ?? 46) * 1.3,
          c.width * 0.94,
        ),
      );
      texture.needsUpdate = true;
    }
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    mesh.rotation.y = side;
    mesh.userData.noReflect = w < 1;
    group.add(mesh);
    return mesh;
  }
  function notice(side, z, title = "REPOSSESSED") {
    sign(
      `${title}\nBY ORDER OF THE RECEIVER\nNO ADMITTANCE\nREF: 2008 / 0147`,
      side * 6.495,
      1.7,
      z,
      0.3,
      0.42,
      (-side * Math.PI) / 2,
      { colour: "#422d24", background: "#d0bd92", font: 47 },
    );
  }

  // The collision shell is authoritative, including the start closure.
  for (const b of sim.layout.filter(
    (b) => b.zone === 0 && b.kind === "building",
  )) {
    const s = b.max.map((v, i) => v - b.min[i]);
    const front = (b.min[0] < 0 ? facadeStone : facadeBrick)[
      Math.round(-b.max[2] / 10)
    ];
    if (b.min[0] < 0 && b.max[2] === -10) {
      box(mats.stone, -13, s[1] / 2, -14.9, 8, s[1], 9.8, true);
      box(mats.stone, -8, (s[1] + 3.5) / 2, -14.9, 2, s[1] - 3.5, 9.8, true);
      for (const z of [-10.5, -19.3])
        box(mats.stone, -8, 1.75, z, 2, 3.5, 1, true);
    } else box(front, ...b.max.map((v, i) => (v + b.min[i]) / 2), ...s, true);
  }
  box(mats.asphalt, 0, -0.12, -22.5, 42, 0.22, 50, false);
  for (const side of [-1, 1]) {
    box(mats.paving, side * 5.5, 0.095, -19.5, 3, 0.19, 39);
    // This 20 cm kerb remains an automatic step, matching the existing right slab.
    box(mats.kerb, side * 4.06, 0.105, -19.5, 0.18, 0.21, 39);
    for (let z = -0.5; z > -39; z -= 0.75)
      box(mats.concrete, side * 4.065, 0.213, z, 0.19, 0.006, 0.014);
    for (let z = -4; z > -39; z -= 8) {
      box(mats.black, side * 3.82, 0.005, z, 0.32, 0.02, 0.6);
      for (let i = 0; i < 7; i++)
        box(
          mats.steel,
          side * 3.82,
          0.019,
          z - 0.25 + i * 0.08,
          0.3,
          0.018,
          0.023,
        );
    }
    for (let z = -1; z > -39; z -= 3.2)
      box(mats.yellow, side * 3.55, 0.006, z, 0.085, 0.008, 2.4);
  }
  for (let z = -2; z > -40; z -= 6)
    box(mats.paint, 0, 0.008, z, 0.12, 0.009, 2.5);
  // Bevelled bank courses catch raking light at walking distance.
  for (const z0 of [-10.5, -19.3])
    for (let y = 0.32; y < 3.3; y += 0.26)
      box(mats.stone, -6.985, y, z0, 0.05, 0.25, 0.98, true, true);
  // A scored, cast iron cover with raised rings, not a grey cylinder.
  batch(cylinder, mats.steel, -1.5, 0.01, -8.3, 0.56, 0.028, 0.56);
  for (let i = -4; i <= 4; i++)
    box(
      mats.black,
      -1.5,
      0.028,
      -8.3 + i * 0.09,
      Math.sqrt(0.27 - (i * 0.09) ** 2) * 2,
      0.009,
      0.022,
    );
  const manholeRim = new T.TorusGeometry(0.525, 0.016, 6, 48);
  extras.push(manholeRim);
  batch(manholeRim, mats.rust, -1.5, 0.034, -8.3, 1, 1, 1, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    pole(
      mats.rust,
      -1.5 + Math.cos(a) * 0.45,
      0.038,
      -8.3 + Math.sin(a) * 0.45,
      0.026,
      0.014,
    );
  }

  // Facades: four distinct addresses on each side, not repeated tower boxes.
  for (const side of [-1, 1])
    for (let building = 0; building < 4; building++) {
      const start = -building * 10,
        center = start - 4.9;
      const height = 13 + ((building * 10) % 7),
        bank = side === -1 && building === 1;
      const wall = side === -1 ? facadeStone[building] : facadeBrick[building];
      // Raised basement, pilasters, belt courses and projecting roof silhouettes.
      box(mats.stone, side * 6.92, 0.48, center, 0.2, 0.56, 9.8);
      for (const z of [start - 0.18, start - 9.65]) {
        box(wall, side * 6.84, height * 0.5, z, 0.32, height, 0.4, true);
        box(mats.stone, side * 6.7, 3.95, z, 0.54, 0.24, 0.58);
      }
      for (const y of [3.65, 6.8, height - 0.45, height])
        box(
          mats.stone,
          side * 6.77,
          y,
          center,
          0.49,
          y === height ? 0.3 : 0.17,
          9.95,
        );
      box(wall, side * 7.18, height + 0.45, center, 0.45, 0.75, 9.8);
      box(mats.stone, side * 7.06, height + 0.85, center, 0.8, 0.16, 10.05);
      box(mats.rust, side * 9.0, height + 1.4, center - 2, 0.8, 1.2, 1.1);
      // Layered cornice, dentils and chimney pots break the perfectly square roof.
      for (const [dy, depth] of [
        [-0.26, 0.6],
        [-0.12, 0.72],
        [0.1, 0.84],
      ])
        box(wall, side * 6.8, height + dy, center, depth, 0.1, 10);
      for (let z = start - 0.3; z > start - 9.7; z -= 0.45)
        box(mats.stone, side * 6.64, height - 0.36, z, 0.23, 0.18, 0.16);
      box(wall, side * 8.2, height + 0.65, center + 2.3, 0.9, 1.3, 1.3);
      for (const dz of [-0.35, 0.35])
        pole(
          mats.rust,
          side * 8.2,
          height + 1.48,
          center + 2.3 + dz,
          0.16,
          0.45,
        );
      pole(mats.steel, side * 8, height + 2.1, center - 1, 0.018, 2.6);
      for (let j = 0; j < 4; j++)
        beam(
          mats.steel,
          [side * 8 - 0.5, height + 2 + j * 0.18, center - 1],
          [side * 8 + 0.5, height + 2 + j * 0.18, center - 1],
          0.012,
        );
      for (let y = 0.85; y < 3.3; y += 0.38)
        for (const z of [start - 0.18, start - 9.65])
          box(mats.stone, side * 6.7, y, z, 0.4, 0.34, 0.52);
      for (let y = 5; y < height - 0.5; y += 2.9)
        for (let col = 0; col < 4; col++) {
          const z = start - 1.4 - col * 2.32;
          box(mats.black, side * 6.94, y, z, 0.16, 2.02, 1.52);
          // Four-sided frame and separate drip sill / lintel. The room shader sits inside.
          for (const dz of [-0.72, 0.72])
            box(mats.stone, side * 6.79, y, z + dz, 0.21, 2.1, 0.075);
          box(mats.stone, side * 6.68, y - 1.02, z, 0.46, 0.12, 1.59);
          box(mats.stone, side * 6.77, y + 1.05, z, 0.25, 0.12, 1.6);
          box(mats.steel, side * 6.73, y, z, 0.05, 1.92, 0.045);
          box(mats.steel, side * 6.73, y + 0.14, z, 0.05, 0.05, 1.36);
        }
      // Gutters and crooked downpipes break the perfect architectural grid.
      const pipeZ = start - 9.36;
      pole(mats.rust, side * 6.59, height / 2, pipeZ, 0.07, height);
      for (let y = 1; y < height; y += 2.5)
        box(mats.steel, side * 6.7, y, pipeZ, 0.25, 0.07, 0.26);
      if (!bank) {
        for (const z of [center - 2.2, center + 2.2]) {
          box(mats.steel, side * 6.81, 1.85, z, 0.24, 2.7, 3.8);
          // Corrugated shutter slats are geometry, catching raking sodium light.
          for (let y = 0.6; y < 3.1; y += 0.14)
            box(mats.steel, side * 6.63, y, z, 0.08, 0.042, 3.65);
          if ((building + Math.round(z * 10)) % 3 !== 0) {
            for (let sheet = 0; sheet < 3; sheet++) {
              const sz = z - 1.17 + sheet * 1.17;
              box(mats.wood, side * 6.54, 1.7, sz, 0.065, 2.36, 1.15);
              for (const y of [0.63, 2.76])
                for (const dz of [-0.49, 0.49])
                  batch(
                    cylinder,
                    mats.steel,
                    side * 6.502,
                    y,
                    sz + dz,
                    0.014,
                    0.012,
                    0.014,
                    0,
                    0,
                    Math.PI / 2,
                  );
            }
            for (const y of [0.6, 2.79])
              box(mats.wood, side * 6.53, y, z, 0.06, 0.07, 3.55);
          }
        }
        sign(
          (side < 0
            ? [
                "MERCER & SONS\nTAILORS • EST. 1926",
                "",
                "TO LET\nALL ENQUIRIES TO AGENT",
                "BELL STREET PHARMACY\nPRESCRIPTIONS",
              ]
            : [
                "LONDON ASSURANCE\nCLAIMS OFFICE",
                "HARTWELL EXCHANGE\nCURRENCY • TRAVEL",
                "FENWICK STATIONERS\nPAPER • PRINT • COPY",
                "KINGSWAY HOUSE\nOFFICES TO LET",
              ])[building],
          side * 6.52,
          3.27,
          center,
          7.6,
          0.61,
          (-side * Math.PI) / 2,
          {
            background: building === 0 ? "#203934" : "#232a2f",
            colour: "#b8b7a1",
            font: 44,
            face: building === 0 ? "Georgia, serif" : "Arial, sans-serif",
          },
        );
        notice(side, center + 1.25, building % 2 ? "FORECLOSURE" : "CLOSED");
      }
    }

  // Each side is one instanced glazing batch; room variation is address-based.
  for (const side of [-1, 1]) {
    const glazing = roomMaterial(kit, side);
    for (let building = 0; building < 4; building++) {
      const height = 13 + ((building * 10) % 7);
      for (let y = 5; y < height - 0.5; y += 2.9)
        for (let col = 0; col < 4; col++)
          batch(
            plane,
            glazing,
            side * 6.755,
            y,
            -building * 10 - 1.4 - col * 2.32,
            1.32,
            1.88,
            1,
            0,
            (-side * Math.PI) / 2,
          );
    }
  }

  // The bank. Locked grille makes the existing collision at x=-7 legible.
  box(mats.black, -8.9, 1.95, -14.9, 0.2, 3.05, 7.8);
  box(mats.stone, -6.36, 3.55, -14.9, 1.4, 0.4, 9.1, true, true);
  box(mats.stone, -6.1, 3.88, -14.9, 1.7, 0.18, 9.6, true);
  for (const z of [-18.7, -11.1]) {
    pole(mats.column, -6.1, 1.9, z, 0.28, 3.15, true);
    box(mats.stone, -6.1, 0.38, z, 0.79, 0.38, 0.79, true, true);
    box(mats.stone, -6.1, 3.36, z, 0.82, 0.25, 0.82, true, true);
    for (let a = 0; a < 10; a++) {
      const angle = (a / 10) * Math.PI * 2;
      pole(
        mats.stone,
        -6.1 + Math.cos(angle) * 0.27,
        1.96,
        z + Math.sin(angle) * 0.27,
        0.022,
        2.6,
      );
    }
  }
  sign("CROWNHAVEN BANK", -5.645, 3.59, -14.9, 8, 0.34, Math.PI / 2, {
    colour: "#d0ba7d",
    background: "#292c2b",
    font: 72,
    face: "Georgia, serif",
  });
  sign(
    "PUBLIC TRUST • PRIVATE LOSSES",
    -6.75,
    2.95,
    -14.9,
    6.3,
    0.27,
    Math.PI / 2,
    { colour: "#bcb29b", background: "#171f22", font: 42 },
  );
  // Genuine side returns, ceiling and rear wall enclose the recessed room.
  // Machinery remains beyond the locked front and the collision shell.
  box(mats.stone, -7.7, 0.28, -14.9, 2.6, 0.17, 7.3);
  box(mats.concrete, -7.7, 2.73, -14.9, 2.6, 0.12, 7.4);
  sign(
    "EMERGENCY LIQUIDITY FACILITY\nAUTHORISED PERSONNEL ONLY",
    -8.75,
    2.53,
    -15,
    4.3,
    0.3,
    Math.PI / 2,
    { colour: "#c9d9cd", background: "#172821", glow: 0.6 },
  );
  for (let z = -18.25; z < -11.5; z += 0.48)
    pole(mats.rust, -6.52, 1.6, z, 0.015, 2.4);
  for (const y of [0.8, 2.55])
    box(mats.rust, -6.52, y, -14.9, 0.04, 0.045, 7.3);
  // Broken glazing shards (triangular planes) cling to the top and jambs.
  const shardGeo = new T.BufferGeometry();
  shardGeo.setAttribute(
    "position",
    new T.Float32BufferAttribute([0, 0, 0, 0, -0.65, 0.15, 0, -0.1, 0.43], 3),
  );
  shardGeo.computeVertexNormals();
  extras.push(shardGeo);
  const shardMat = surface(kit, "glass", { scale: 0.7, tint: 0xb9ced0 });
  shardMat.side = T.DoubleSide;
  for (let i = 0; i < 13; i++)
    batch(
      shardGeo,
      shardMat,
      -6.48,
      2.68,
      -18.25 + i * 0.51,
      1,
      0.5 + (i % 3) * 0.3,
      1,
    );
  const rollers = [];
  for (const z of [-16.5, -13]) {
    box(mats.steel, -7.65, 0.82, z, 1.1, 1.0, 1.45, true, true);
    box(mats.black, -7.45, 1.26, z, 1.15, 0.2, 1.2);
    for (const end of [-0.57, 0.57])
      box(mats.rust, -7.45, 1.45, z + end, 1.1, 0.65, 0.14);
    const roller = new T.Mesh(cylinder, mats.brass);
    roller.position.set(-7.35, 1.48, z);
    roller.rotation.x = Math.PI / 2;
    roller.scale.set(0.15, 1.03, 0.15);
    group.add(roller);
    rollers.push(roller);
    const rollerSeam = new T.Mesh(unit, mats.black);
    rollerSeam.position.set(0.98, 0, 0);
    rollerSeam.scale.set(0.08, 0.96, 0.08);
    roller.add(rollerSeam);
    box(mats.paper, -6.95, 1.23, z, 0.8, 0.016, 0.9);
    const wheelGeo = new T.TorusGeometry(0.32, 0.045, 6, 24);
    extras.push(wheelGeo);
    batch(wheelGeo, mats.steel, -7.02, 0.88, z + 0.31, 1, 1, 1, 0, Math.PI / 2);
    for (let spoke = 0; spoke < 6; spoke++) {
      const a = (spoke / 6) * Math.PI * 2;
      beam(
        mats.brass,
        [-6.99, 0.88, z + 0.31],
        [-6.99, 0.88 + Math.sin(a) * 0.3, z + 0.31 + Math.cos(a) * 0.3],
        0.018,
      );
    }
    box(mats.steel, -7.025, 1.05, z - 0.47, 0.12, 0.35, 0.25, false, true);
    sign("RUN\n008528", -6.958, 1.12, z - 0.47, 0.18, 0.16, Math.PI / 2, {
      background: "#102019",
      colour: "#95b893",
      font: 94,
      glow: 0.3,
    });
    batch(
      cylinder,
      mats.orange,
      -6.95,
      0.96,
      z - 0.5,
      0.035,
      0.035,
      0.035,
      0,
      0,
      Math.PI / 2,
    );
    sign(
      "CH / RESERVE PRESS\nSERIES 2008 • 02",
      -7.075,
      0.56,
      z - 0.3,
      0.52,
      0.2,
      Math.PI / 2,
      { background: "#253028", colour: "#a7ae92", font: 68 },
    );
    box(mats.sodium, -7.0, 1.83, z + 0.5, 0.05, 0.06, 0.06);
  }
  fixture(-7.35, 2.3, -15, 0xc8dcb9, 14, "sign");
  notice(-1, -18.4, "INSOLVENT");
  // Dead ATM with recessed screen, keypad, cash slot and weathered warning.
  box(mats.steel, -6.55, 1.15, -8.3, 0.72, 1.85, 0.9, true, true);
  box(mats.black, -6.17, 1.48, -8.3, 0.025, 0.55, 0.65);
  // A paper notice over the dead screen stays readable without making it glow.
  sign("OUT OF\nSERVICE", -6.15, 1.48, -8.3, 0.42, 0.3, Math.PI / 2, {
    colour: "#262922",
    background: "#c6bfa7",
    font: 160,
  });
  box(mats.brass, -6.12, 0.98, -8.3, 0.1, 0.08, 0.48);
  for (let i = 0; i < 12; i++)
    box(
      mats.steel,
      -6.055,
      1.08 + Math.floor(i / 3) * 0.055,
      -8.42 + (i % 3) * 0.1,
      0.025,
      0.034,
      0.07,
    );
  sign("CASH", -6.15, 2.18, -8.3, 0.85, 0.25, Math.PI / 2, {
    background: "#183c3b",
    colour: "#8d9f8e",
    font: 180,
  });
  // Stuck red ticker, no animation or rapid flash.
  box(mats.black, 6.6, 3.9, -12.8, 0.35, 0.58, 7.9, true, true);
  sign(
    "FTSE −8.85%   BANKS −17.2%   CREDIT FROZEN",
    6.39,
    3.9,
    -12.8,
    7.5,
    0.35,
    -Math.PI / 2,
    { colour: "#ff452f", background: "#0b0808", font: 88, glow: 0.8 },
  );
  fixture(6.05, 3.5, -12.8, 0xff4830, 12, "sign");

  // Fire escape: platforms, open railings and diagonal stair runs.
  for (const y of [6.7, 9.6, 12.5]) {
    box(mats.rust, 6.18, y, -26.7, 1.2, 0.13, 4.5, true);
    for (const z of [-28.8, -27.4, -25.9, -24.6])
      pole(mats.rust, 5.62, y + 0.53, z, 0.025, 1.1);
    beam(mats.rust, [5.62, y + 1.1, -28.9], [5.62, y + 1.1, -24.5]);
    for (let i = 0; i < 11; i++)
      box(mats.rust, 5.95, y - i * 0.25, -28.7 + i * 0.33, 0.78, 0.055, 0.26);
    beam(mats.rust, [5.5, y + 0.9, -28.7], [5.5, y - 1.7, -25.1]);
  }

  const lampPositions = [];
  for (const [side, z] of [
    [-1, -3],
    [1, -10],
    [-1, -22],
    [1, -32],
    [-1, -38],
  ]) {
    const x = side * 4.85;
    pole(mats.steel, x, 2.65, z, 0.075, 5.05);
    pole(mats.steel, x, 0.48, z, 0.16, 0.6);
    box(mats.steel, x, 0.26, z, 0.5, 0.15, 0.5, false, true);
    beam(mats.steel, [x, 4.95, z], [x - side * 1.1, 5.25, z], 0.055);
    box(mats.steel, x - side * 1.14, 5.22, z, 0.8, 0.17, 0.4, false, true);
    box(mats.sodium, x - side * 1.14, 5.11, z, 0.63, 0.035, 0.29);
    fixture(x - side * 1.14, 4.95, z, 0xffbd7b, 38);
    lampPositions.push([x - side * 1.14, z]);
  }
  // Bus shelter frame, glass return, bench and backlit municipal poster.
  for (const z of [-23.5, -27.4])
    for (const x of [-6.55, -5.05]) pole(mats.steel, x, 1.38, z, 0.045, 2.35);
  box(mats.steel, -5.8, 2.61, -25.45, 1.9, 0.16, 4.45, true, true);
  box(mats.steel, -6.1, 0.67, -25.5, 0.55, 0.11, 2.7, true, true);
  for (const z of [-26.5, -24.5]) box(mats.steel, -6.1, 0.42, z, 0.1, 0.5, 0.1);
  const shelterGlass = kit.material({
    color: 0x81969a,
    roughness: 0.17,
    metalness: 0.2,
    transparent: true,
    opacity: 0.17,
    side: T.DoubleSide,
    depthWrite: false,
  });
  batch(
    plane,
    shelterGlass,
    -6.56,
    1.48,
    -25.45,
    3.85,
    2.05,
    1,
    0,
    Math.PI / 2,
  );
  box(mats.steel, -5.8, 1.45, -27.38, 1.43, 2.05, 0.12, true, true);
  sign(
    "A BETTER\nTOMORROW.\n\nSAVE WITH CONFIDENCE\nCROWNHAVEN / SINCE 1891",
    -5.8,
    1.46,
    -27.3,
    1.27,
    1.85,
    0,
    {
      colour: "#183842",
      background: "#b6c5af",
      font: 130,
      glow: 0.4,
      face: "Arial, sans-serif",
    },
  );
  box(mats.cold, -5.8, 2.47, -27.29, 1.28, 0.028, 0.025);
  fixture(-5.7, 1.85, -26.95, 0xa5d4df, 16, "sign");
  sign("24 / BELL STREET", -4.96, 2.3, -23.5, 1.2, 0.32, Math.PI / 2, {
    colour: "#c6d6d5",
    background: "#21303c",
  });

  // Newspaper vending box and a typeset edition, legible at arm's length.
  box(mats.steel, 5.25, 0.73, -5.6, 0.7, 1.06, 0.55, true, true);
  box(mats.red, 5.25, 1.31, -5.6, 0.73, 0.19, 0.59, false, true);
  sign(
    "THE MORNING LEDGER\nChancellor on brink of\nsecond bailout for banks\n\nSATURDAY 3 JANUARY 2009\n50p / CITY EDITION",
    5.25,
    0.94,
    -5.309,
    0.57,
    0.56,
    0,
    {
      colour: "#252923",
      background: "#c2bda5",
      font: 98,
      glow: 0,
      face: "Georgia, serif",
    },
  );
  sign("NEWS", 5.25, 1.32, -5.298, 0.65, 0.12, 0, {
    colour: "#e6d6b8",
    background: "#7e2921",
    font: 100,
  });

  // Refuse and roadside small props stay on the pavements, away from actors.
  for (const [x, z] of [
    [6, -19.1],
    [-6.2, -31.5],
    [5.8, -34.3],
  ]) {
    pole(mats.steel, x, 0.68, z, 0.32, 0.92);
    pole(mats.black, x, 1.16, z, 0.35, 0.07);
    for (let i = 0; i < 3; i++) {
      const bag = kit.sphere(0.28 + i * 0.015, mats.black);
      bag.userData.noReflect = true;
      bag.position.set(x - 0.5, 0.43, z + i * 0.4);
      bag.scale.set(1, 1.2, 0.8);
      group.add(bag);
      pole(mats.black, x - 0.5, 0.77, z + i * 0.4, 0.06, 0.12);
    }
  }
  for (const [x, z] of [
    [-4.55, -35],
    [-4.6, -36.6],
    [3.8, -41.4],
  ]) {
    box(mats.black, x, 0.12, z, 0.43, 0.12, 0.43, false, true);
    const geo = new T.CylinderGeometry(0.035, 0.16, 0.6, 12);
    extras.push(geo);
    batch(geo, mats.orange, x, 0.46, z, 1, 1, 1);
    pole(mats.paint, x, 0.47, z, 0.105, 0.11);
  }
  // Slow amber signal at the turn. Reduced motion leaves it steadily lit.
  pole(mats.steel, -4.8, 2.75, -40.4, 0.085, 5.1);
  box(mats.black, -4.8, 4.64, -40.35, 0.44, 1.24, 0.28, false, true);
  for (const y of [4.25, 4.65, 5.05]) {
    batch(cylinder, mats.black, -4.8, y, -40.18, 0.15, 0.1, 0.15, Math.PI / 2);
    box(mats.black, -4.8, y + 0.13, -40.08, 0.34, 0.06, 0.31);
  }
  const amberMat = kit.material({
    color: 0xb87b19,
    emissive: 0xffa12a,
    emissiveIntensity: 1.2,
  });
  batch(
    cylinder,
    amberMat,
    -4.8,
    4.65,
    -40.112,
    0.117,
    0.012,
    0.117,
    Math.PI / 2,
  );

  // The short return fences close the two corners behind the starting pose.
  for (const x of [-6.925, 7.075]) {
    for (const z of [0.05, 1.95]) pole(mats.steel, x, 1, z, 0.055, 2);
    for (const y of [0.25, 1.9]) box(mats.steel, x, y, 1, 0.07, 0.06, 2);
    for (let z = 0.1; z < 2; z += 0.14) pole(mats.rust, x, 1, z, 0.012, 1.8);
  }
  // Start closure: heavy flood / construction barrier with a continuing city.
  box(mats.concrete, 0, 0.89, 1.75, 14, 1.78, 0.5, true, true);
  for (let x = -6.7; x < 7; x += 0.72)
    batch(unit, mats.yellow, x, 1.44, 1.47, 0.4, 0.32, 0.015, 0, 0, -0.4);
  box(mats.steel, 0, 1.95, 1.75, 14, 0.1, 0.5);
  sign("FINANCIAL DISTRICT / ROAD CLOSED", 0, 1.02, 1.478, 4, 0.5, Math.PI, {
    colour: "#292c2c",
    background: "#b2ac94",
    font: 60,
  });
  // End obstruction is owned by ALLEY; a readable turn sign bridges the sightline.
  sign("ROAD CLOSED\nFOLLOW DIVERSION →", -3, 1.7, -46.8, 3.2, 0.95, 0, {
    colour: "#d6c8a8",
    background: "#752b1f",
    font: 65,
  });

  // Far street behind the start gate: non-reachable city, never a sky void.
  const backdrop = new T.Group();
  scene.add(backdrop);
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const z = 9 + i * 11,
        h = 15 + ((i * 7) % 17);
      batch(
        unit,
        i % 2 ? mats.brick : mats.concrete,
        side * 12,
        h / 2,
        z,
        10,
        h,
        10,
        0,
        0,
        0,
        false,
        backdrop,
      );
      for (let y = 5; y < h; y += 3)
        for (let j = 0; j < 3; j++)
          batch(
            unit,
            (i + j + y) % 5 < 1 ? mats.cold : mats.black,
            side * 6.98,
            y,
            z - 3 + j * 3,
            0.03,
            1.4,
            1.1,
            0,
            0,
            0,
            false,
            backdrop,
          );
    }
  batch(
    unit,
    mats.asphalt,
    0,
    -0.13,
    30,
    18,
    0.2,
    65,
    0,
    0,
    0,
    false,
    backdrop,
  );

  // Procedural engraved bills: stationary wet sheets and a few airborne notes.
  const billTexture = kit.text(
    "10       CROWNHAVEN       10\n   TEN POUNDS STERLING\n  ░  BANK RESERVE NOTE  ░\n10   PROMISE TO THE BEARER   10",
    {
      width: 512,
      height: 256,
      font: 25,
      background: "#a6b19a",
      colour: "#364b3e",
    },
  );
  const billMat = kit.material({
    map: billTexture,
    roughness: 0.71,
    side: T.DoubleSide,
  });
  for (const z of [-16.5, -13])
    for (let i = 0; i < 3; i++)
      batch(
        plane,
        billMat,
        -6.85 - i * 0.23,
        1.245,
        z,
        0.22,
        0.12,
        1,
        -Math.PI / 2,
      );
  for (let i = 0; i < 36; i++) {
    const z = -10 - random(i + 2) * 23,
      x = -5.9 + random(i + 91) * 8;
    batch(
      plane,
      billMat,
      x,
      x < -4 ? 0.203 : 0.018,
      z,
      0.24,
      0.115,
      1,
      -Math.PI / 2,
      0,
      random(i) * 5,
    );
  }
  // Wet paper accumulates where the gutter current meets each drain.
  for (let i = 0; i < (low ? 35 : 85); i++) {
    const side = i % 2 ? -1 : 1,
      z = -4 - (i % 5) * 8 + random(i + 61) * 0.85;
    batch(
      plane,
      i % 3 ? billMat : mats.paper,
      side * (3.64 + random(i + 95) * 0.28),
      0.032 + (i % 3) * 0.001,
      z,
      0.09 + random(i) * 0.13,
      0.07,
      1,
      -Math.PI / 2,
      0,
      random(i + 7) * 6,
    );
  }
  const bills = Array.from({ length: low ? 7 : 15 }, () => new T.Object3D());
  const curledBill = new T.PlaneGeometry(1, 1, 4, 2);
  extras.push(curledBill);
  const billVertices = curledBill.attributes.position;
  for (let i = 0; i < billVertices.count; i++)
    billVertices.setZ(
      i,
      0.022 * Math.sin(billVertices.getX(i) * 4) * (0.7 + billVertices.getY(i)),
    );
  curledBill.computeVertexNormals();
  const billCloud = new T.InstancedMesh(curledBill, billMat, bills.length);
  billCloud.frustumCulled = false;
  billCloud.userData.noReflect = true;
  instances.push(billCloud);
  group.add(billCloud);
  bills.forEach((mesh) => mesh.scale.set(0.24, 0.115, 1));

  // One reduced-resolution reflection pass, with irregular but sharp puddle
  // boundaries. Asphalt and road paint remain visible between the pools.
  let reflector;
  if (!low) {
    const shader = {
      uniforms: T.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
      vertexShader: Reflector.ReflectorShader.vertexShader
        .replace("varying vec4 vUv;", "varying vec4 vUv;varying vec3 wetWorld;")
        .replace(
          "vUv = textureMatrix",
          "wetWorld=(modelMatrix*vec4(position,1.)).xyz;vUv = textureMatrix",
        ),
      fragmentShader: Reflector.ReflectorShader.fragmentShader
        .replace(
          "varying vec4 vUv;",
          `varying vec4 vUv;varying vec3 wetWorld;uniform float streetTime;${kit.noiseGLSL}`,
        )
        .replace(
          "vec4 base = texture2DProj( tDiffuse, vUv );",
          `
float pool=noise3(vec3(wetWorld.x*.65,0.,wetWorld.z*.23))*.72+noise3(vec3(wetWorld.x*2.1,1.,wetWorld.z*.9))*.28;
float edgeThreshold=.55-.065*smoothstep(1.7,3.9,abs(wetWorld.x));
if(pool<edgeThreshold||abs(wetWorld.x)>3.9)discard;
vec4 projected=vUv;
float rings=sin(length(fract(wetWorld.xz*1.4)-.5)*45.-streetTime*4.);
projected.xy+=vec2(sin(wetWorld.z*26.+streetTime),rings)*.00065*projected.w;
vec4 base = texture2DProj(tDiffuse,projected)*.5;
vec4 blurOffset=vec4(.0016,.0011,0.,0.)*projected.w;
base+=texture2DProj(tDiffuse,projected+blurOffset)*.25;
base+=texture2DProj(tDiffuse,projected-blurOffset)*.25;`,
        )
        .replace(
          "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
          `vec3 viewToEye=cameraPosition-wetWorld;float grazing=1.-clamp(viewToEye.y/length(viewToEye),0.,1.);
float waterAlpha=.18+.68*pow(grazing,4.);
gl_FragColor=vec4(base.rgb*.54+vec3(.008,.012,.016),waterAlpha);`,
        ),
    };
    shader.uniforms.streetTime = kit.uniforms.time;
    const geo = new T.PlaneGeometry(8, 46);
    extras.push(geo);
    reflector = new Reflector(geo, {
      textureWidth: Math.min(
        quality === "ultra" ? 768 : 384,
        Math.max(64, Math.ceil(window.innerWidth / 2)),
      ),
      textureHeight: Math.min(
        quality === "ultra" ? 512 : 256,
        Math.max(64, Math.ceil(window.innerHeight / 2)),
      ),
      clipBias: 0.003,
      multisample: 0,
      shader,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.016, -21.5);
    reflector.material.transparent = true;
    // Reflector clones its input uniforms, so reconnect the live shared clock.
    reflector.material.uniforms.streetTime = kit.uniforms.time;
    // Respect exclusions from every package, including restored hidden state on errors.
    const reflect = reflector.onBeforeRender;
    let excluded;
    const hidden = [];
    reflector.onBeforeRender = function (...args) {
      hidden.length = 0;
      excluded ??= (() => {
        const list = [];
        scene.traverse((o) => {
          if (o !== reflector && o.userData.noReflect) list.push(o);
        });
        return list;
      })();
      excluded.forEach((object) => {
        if (
          object !== reflector &&
          object.visible &&
          object.userData.noReflect
        ) {
          hidden.push(object);
          object.visible = false;
        }
      });
      try {
        reflect.apply(this, args);
      } finally {
        for (const object of hidden) object.visible = true;
      }
    };
    group.add(reflector);
  }
  if (low) {
    const water = kit.material({
      color: 0x394349,
      roughness: 0.13,
      metalness: 0,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      weather: true,
    });
    const outlines = [];
    for (let i = 0; i < 12; i++) {
      const outline = new T.Shape();
      const x = random(i + 501) * 5.5 - 2.75,
        z = -2 - random(i + 301) * 38;
      const width = 0.5 + random(i) * 0.8,
        length = 1.1 + random(i + 7) * 2.1;
      const points = Array.from({ length: 17 }, (_, j) => {
        const a = (j / 16) * Math.PI * 2,
          r = 0.8 + random(i * 19 + (j % 16)) * 0.2;
        return new T.Vector2(
          x + Math.cos(a) * r * width,
          -z + Math.sin(a) * r * length,
        );
      });
      outline.moveTo(points[0].x, points[0].y);
      for (let j = 1; j < points.length; j++)
        outline.lineTo(points[j].x, points[j].y);
      outlines.push(outline);
    }
    // Identical coplanar water shares one draw; all twelve outlines are retained.
    const geo = new T.ShapeGeometry(outlines);
    extras.push(geo);
    batch(geo, water, 0, 0.015, 0, 1, 1, 1, -Math.PI / 2);
  }
  // Small sodium reflections are retained on low, where the planar pass is off.
  const poolMat = kit.material({
    color: 0xa0773f,
    emissive: 0xb87b35,
    emissiveIntensity: 0.16,
    transparent: true,
    opacity: low ? 0.24 : 0.09,
    depthWrite: false,
    roughness: 0.18,
  });
  poolMat.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 poolUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\npoolUV=uv;",
    );
    shader.fragmentShader = "varying vec2 poolUV;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      "diffuseColor.a*=pow(max(0.,1.-length((poolUV-.5)*2.)),2.);\n#include <alphatest_fragment>",
    );
  };
  poolMat.customProgramCacheKey = () => "street-sodium-pool";
  for (const [x, z] of lampPositions)
    batch(plane, poolMat, x * 0.7, 0.025, z + 1.2, 2.4, 5, 1, -Math.PI / 2);

  // Light-sensitive rain streaks. Animation is in the vertex shader, no per-drop
  // JavaScript work; the shared rain uniform shuts them off as weather clears.
  const rainMat = kit.material({
    side: T.DoubleSide,
    color: 0x879eae,
    emissive: 0x718898,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
    roughness: 0.4,
  });
  const rainBase = rainMat.onBeforeCompile;
  rainMat.onBeforeCompile = (shader) => {
    rainBase(shader);
    shader.vertexShader =
      "uniform float time;varying vec2 dropUV;varying float rainHeight;varying vec3 streetRainWorld;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
transformed.y+=mod(float(gl_InstanceID)*.713-time*13.,18.)-9.;
transformed.x+=sin(time*.3+float(gl_InstanceID))*.12;
rainHeight=position.y;dropUV=uv;
float dropDistance=length(cameraPosition-(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz);
transformed.xz*=max(1.,dropDistance*.0015/0.009);
vec4 rainP=vec4(transformed,1.);
#ifdef USE_INSTANCING
rainP=instanceMatrix*rainP;
#endif
streetRainWorld=(modelMatrix*rainP).xyz;`,
    );
    shader.fragmentShader =
      "varying vec2 dropUV;varying float rainHeight;varying vec3 streetRainWorld;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `// Clip tilted drops after world transformation, including the bank canopy.
if(streetRainWorld.x < -5.25 && streetRainWorld.z > -19.7 && streetRainWorld.z < -10.1 && streetRainWorld.y < 3.97)discard;
if(streetRainWorld.x < -4.85 && streetRainWorld.x > -6.75 && streetRainWorld.z > -27.675 && streetRainWorld.z < -23.225 && streetRainWorld.y < 2.69)discard;
diffuseColor.a*=smoothstep(0.,.35,dropUV.x)*(1.-smoothstep(.65,1.,dropUV.x))*rain*(1.-smoothstep(.1,.5,abs(rainHeight)));
#include <alphatest_fragment>`,
    );
  };
  rainMat.customProgramCacheKey = () => "street-rain-v1";
  // Shader displacement uses geometry-local metres, so streaks are pre-sized.
  const rainGeo = new T.PlaneGeometry(0.009, 0.8840000000000001);
  extras.push(rainGeo);
  for (let i = 0; i < (low ? 420 : quality === "ultra" ? 2400 : 1300); i++)
    batch(
      rainGeo,
      rainMat,
      random(i + 92) * 12.6 - 6.3,
      9,
      -random(i + 718) * 46,
      1,
      1,
      1,
      0,
      0,
      -0.1,
    );
  const drips = kit.particles(low ? 40 : 100, {
    colour: 0xaec4ce,
    size: 0.028,
    opacity: 0.45,
  });
  group.add(drips);
  const splashes = kit.particles(low ? 60 : 160, {
    colour: 0xa6bfca,
    size: 0.028,
    opacity: 0.24,
  });
  group.add(splashes);
  const steam = kit.particles(low ? 18 : 38, {
    colour: 0x889da9,
    size: 0.85,
    opacity: 0.1,
  });
  group.add(steam);
  for (const particles of [drips, splashes, steam])
    particles.frustumCulled = false;

  streetWater({ T, kit, group, batch, plane, extras, lampPositions, low });
  const details = streetDetails({
    T,
    kit,
    group,
    mats,
    box,
    pole,
    beam,
    batch,
    plane,
    extras,
    sign,
    low,
  });
  for (const object of [drips, splashes, steam])
    object.userData.noReflect = true;
  // Submit all static batches once, after authoring is complete.
  for (const b of batches.values()) {
    const mesh = kit.instances(b.geometry, b.material, b.matrices);
    instances.push(mesh);
    mesh.castShadow = !!b.shadow;
    mesh.receiveShadow = true;
    // Rain has up to nine metres of vertex displacement.
    if (b.material === rainMat) mesh.frustumCulled = false;
    // Mixed trim batches include keypads, meter housings and small box parts.
    // Large casings have separate shadow batches and remain in the mirror.
    mesh.userData.noReflect =
      b.material === rainMat ||
      b.material === billMat ||
      b.material === mats.paper ||
      b.material.userData.noReflect ||
      (!b.shadow &&
        [mats.steel, mats.brass, mats.black, mats.red].includes(b.material)) ||
      (!b.shadow &&
        b.geometry !== unit &&
        b.geometry !== plane &&
        b.geometry !== round);
    b.parent.add(mesh);
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    update({ time, snapshot, env }) {
      const t = reduced ? 0 : time,
        rain = env.rain ?? snapshot.rain;
      backdrop.visible = snapshot.zone < 3;
      if (!group.visible) return;
      details.update(t);
      // Keep the owned mirror below display resolution, including after resize.
      if (reflector) {
        const w = Math.min(
          quality === "ultra" ? 768 : 384,
          Math.max(64, Math.ceil(window.innerWidth / 2)),
        );
        const h = Math.min(
          quality === "ultra" ? 512 : 256,
          Math.max(64, Math.ceil(window.innerHeight / 2)),
        );
        const target = reflector.getRenderTarget();
        if (target.width !== w || target.height !== h) target.setSize(w, h);
      }
      amberMat.emissiveIntensity = reduced
        ? 1.2
        : 0.75 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.15));
      for (const roller of rollers) roller.rotation.y = t * 1.6;
      bills.forEach((mesh, i) => {
        const phase = (t * 0.14 + i / bills.length) % 1;
        mesh.position.set(
          -6.25 + phase * 8.1,
          0.45 + Math.sin(phase * Math.PI) * 1.2 + Math.sin(t + i) * 0.15,
          -12.4 - (i % 4) * 1.2 - phase * 6,
        );
        mesh.rotation.set(t * 0.7 + i, t * 0.3 + i, Math.sin(t + i));
        mesh.updateMatrix();
        billCloud.setMatrixAt(i, mesh.matrix);
      });
      billCloud.instanceMatrix.needsUpdate = true;
      drips.material.opacity = rain * 0.42;
      splashes.material.opacity = rain * 0.22;
      for (const [particles, kind] of [
        [drips, 0],
        [splashes, 1],
        [steam, 2],
      ]) {
        const p = particles.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (kind === 0) {
            const z = -random(i + 123) * 39;
            const x = i % 2 ? (z < -10.1 && z > -19.7 ? -5.22 : -6.3) : 6.3;
            p.setXYZ(i, x, 3.6 - ((t * 4 + random(i) * 4) % 3.4), z);
          }
          if (kind === 1)
            p.setXYZ(
              i,
              random(i + 4) * 7.8 - 3.9,
              0.03 + Math.sin(((t * 2 + random(i)) % 1) * Math.PI) * 0.1,
              -random(i + 331) * 43,
            );
          if (kind === 2) {
            const life = (t * 0.17 + i / p.count) % 1;
            p.setXYZ(
              i,
              -1.5 + Math.sin(i * 9 + t * 0.4) * life * 0.65,
              0.1 + life * 2.5,
              -8.3 + Math.cos(i * 3 + t * 0.5) * life * 0.8,
            );
          }
        }
        p.needsUpdate = true;
      }
    },
    dispose() {
      unregister.forEach((fn) => fn());
      reflector?.dispose();
      extras.forEach((r) => r.dispose());
      instances.forEach((mesh) => mesh.dispose());
      scene.remove(backdrop);
    },
  };
}
function random(n) {
  const f = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return f - Math.floor(f);
}
