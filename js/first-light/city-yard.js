import { details } from "./city-alley-detail.js";
import { dressYard, yardConcrete } from "./city-alley-dressing.js";

// GENESIS: the walls and clutter retreat to the fences, opening a long view
// to the river. The garage looks west across the route; the bench is exposed.
export async function build(ctx) {
  const { T, kit, sim, zoneGroup } = ctx;
  const group = zoneGroup(2),
    d = details(ctx, group);
  const concrete = d.material("concrete", { scale: 1, tint: 0xc0bdb1 });
  yardConcrete(concrete);
  const metal = d.material("corrugated", { scale: 2, tint: 0x819098 });
  const steel = d.material("galvanized", { scale: 1, tint: 0x9f9f95 });
  const rust = d.material("rustedSteel", { scale: 1.1 });
  const paint = d.material("paintedMetal", { scale: 1.5, tint: 0x778b87 });
  const wood = d.material("wood", { scale: 1.2 });
  const rubber = d.material("rubber");
  const orange = kit.material({
    color: 0xffcd91,
    emissive: 0xffb464,
    emissiveIntensity: 1.25,
    roughness: 0.38,
  });
  const cool = kit.material({
    color: 0xbdccc6,
    emissive: 0xa7d2dc,
    emissiveIntensity: 0.8,
    roughness: 0.38,
  });
  // No surface crosses z=-111: the river owns the channel beyond this bank.
  d.box(
    20,
    -0.075,
    -90.5,
    180,
    0.12,
    41,
    d.material("soil", { scale: 3.5, tint: 0xb0ada4 }),
  );
  d.box(20.05, -0.025, -84.5, 15.7, 0.04, 29, concrete);
  d.box(24.4, -0.01, -90, 6.3, 0.02, 7.7, concrete);
  d.box(20.05, -0.025, -104.9, 15.7, 0.04, 11.8, concrete);
  for (const z of [-101.7, -108.5])
    d.box(20.05, 0.001, z, 15.7, 0.002, 0.022, rubber);
  d.box(16.8, 0.001, -104.9, 0.02, 0.002, 11.8, rubber);
  // Expansion joints and occasional inset drains interrupt the broad wet slab.
  for (const z of [-75.8, -82.9, -89.1, -98.9])
    d.box(20.05, -0.001, z, 15.7, 0.002, 0.026, rubber);
  for (const x of [16.2, 25.2])
    d.box(x, -0.001, -84.5, 0.026, 0.002, 29, rubber);
  for (const z of [-73, -96.6]) {
    d.box(26.6, 0.001, z, 0.6, 0.003, 1.2, rubber);
    for (let zz = z - 0.55; zz < z + 0.6; zz += 0.09)
      d.box(26.6, 0.004, zz, 0.56, 0.004, 0.035, steel);
  }
  for (const b of sim.layout.filter(
    (b) => b.zone === 2 && b.owner !== "story",
  )) {
    const size = b.max.map((v, i) => v - b.min[i]),
      c = b.max.map((v, i) => (v + b.min[i]) / 2);
    if (b.kind === "fence") {
      const alongZ = size[2] > size[0];
      d.fence(
        alongZ ? [c[0], b.min[2]] : [b.min[0], c[2]],
        alongZ ? [c[0], b.max[2]] : [b.max[0], c[2]],
        size[1],
      );
    } else if (b.kind === "yard-pallets") {
      // Bounds are filled by the stack, not an apparently empty scaffold.
      d.box(...c, ...size, wood, 0.015);
      for (const y of [0.12, 0.32, 0.52]) {
        for (let x = b.min[0] + 0.08; x < b.max[0]; x += 0.19)
          d.box(x, y, c[2], 0.14, 0.09, 1.18, wood, 0.006);
        for (const z of [b.min[2] + 0.1, b.max[2] - 0.1])
          d.box(c[0], y - 0.06, z, 1.16, 0.06, 0.1, rust);
      }
    } else if (b.kind === "yard-drums") {
      // A pallet and sheeted spill tray contain two drums within this solid.
      d.box(c[0], 0.09, c[2], size[0], 0.18, size[2], wood, 0.012);
      d.box(c[0], 0.22, c[2], size[0], 0.13, size[2], rust, 0.012);
      const drumZ = c[2] + 0.01;
      for (const x of [c[0] - 0.45, c[0] + 0.43]) {
        d.rod([x, 0.28, drumZ], [x, 0.95, drumZ], 0.34, paint, 18);
        for (const y of [0.3, 0.59, 0.92]) {
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2,
              b = ((i + 1) / 18) * Math.PI * 2;
            d.rod(
              [x + Math.cos(a) * 0.344, y, drumZ + Math.sin(a) * 0.344],
              [x + Math.cos(b) * 0.344, y, drumZ + Math.sin(b) * 0.344],
              0.018,
              rust,
              4,
            );
          }
        }
      }
    } else if (
      b.kind.startsWith("yard-scrap") ||
      b.kind.startsWith("garage-supply") ||
      b.kind === "alley-sign"
    ) {
      // Dressed by the merged salvage/workshop module below.
      continue;
    } else {
      const mat =
        b.kind === "workbench"
          ? wood
          : b.kind === "garage-wall"
            ? metal
            : b.kind === "garage-roof"
              ? metal
              : b.kind === "yard-container"
                ? paint
                : metal;
      d.box(...c, ...size, mat, 0.018);
    }
  }
  // Solid workbench is a cabinet base, with an end-grain top and drawer fronts.
  // Nothing is placed on it: the story-landmarks owner supplies the PC at 22,-90.
  d.box(23, 0.88, -90, 2, 0.04, 2, wood, 0.012);
  for (const z of [-89.48, -90.5]) {
    d.box(21.982, 0.46, z, 0.035, 0.69, 0.9, paint, 0.012);
    d.box(21.96, 0.7, z, 0.024, 0.032, 0.26, steel);
  }
  // The roller curtain is gathered above a genuinely open 4.8m door.
  for (let y = 2.51; y < 3.17; y += 0.085)
    d.box(21.37, y, -90, 0.07, 0.024, 4.75, steel);
  for (const z of [-92.4, -87.6]) d.box(21.36, 1.3, z, 0.08, 2.6, 0.09, rust);
  d.box(24.4, 3.07, -93.65, 6, 0.16, 0.13, wood);
  d.box(24.4, 3.07, -86.35, 6, 0.16, 0.13, wood);
  for (let x = 21.9; x < 27.2; x += 1.15)
    d.box(x, 3.13, -90, 0.065, 0.13, 7.3, steel);
  // Fascia, gutters and fluorescent batten housings give the shell a thickness.
  d.box(21.28, 3.28, -90, 0.15, 0.23, 8.3, paint);
  d.rod([21.25, 3.21, -93.9], [21.25, 3.21, -86.1], 0.065, steel, 10);
  d.rod([21.38, 0.1, -93.85], [21.38, 3.2, -93.85], 0.054, rust, 10);
  d.box(22.1, 2.555, -90, 0.2, 0.01, 2.2, rubber);
  d.box(22.1, 2.548, -90, 0.14, 0.004, 2.05, orange);
  d.fixture([21.65, 2.35, -90], 0xffb363, 11);
  d.lightPool(20.9, -90, 3.5, 5, 0xe9a563);
  d.box(25.9, 2.95, -90, 0.14, 0.065, 1.7, cool);
  d.fixture([25.3, 2.6, -90.8], 0xb9c7cf, 4);
  d.label(
    "HALDEN / ELECTRICAL\nREPAIRS • RADIO • SALVAGE",
    21.225,
    2.96,
    -90,
    3.7,
    0.36,
    [0, -Math.PI / 2, 0],
    {
      width: 1024,
      height: 128,
      font: 38,
      background: "#303c3a",
      colour: "#c2c4ad",
    },
  );
  d.label(
    "03\nJAN 2009",
    21.247,
    1.56,
    -93.05,
    0.48,
    0.65,
    [0, -Math.PI / 2, 0],
    { colour: "#cdc6b5", background: "#4d5753" },
  );
  d.label(
    "DISTRIBUTION\n230 V",
    27.18,
    1.35,
    -88,
    0.7,
    0.42,
    [0, -Math.PI / 2, 0],
    { font: 36, background: "#b8ac8c", colour: "#2f3531" },
  );
  // Rear pegboard and hand tools live behind the bench, outside the approach.
  d.box(27.16, 1.75, -90, 0.05, 1.25, 2.6, wood);
  for (let i = 0; i < 9; i++) {
    const z = -91.1 + i * 0.26,
      low = 1.46 + (i % 3) * 0.04,
      high = low + 0.25 + (i % 4) * 0.065;
    if (i % 4 === 0) {
      d.rod([27.16, low, z], [27.16, high, z], 0.018, wood);
      d.box(27.15, high, z, 0.06, 0.065, 0.18, steel, 0.006);
    } else {
      d.rod([27.16, low, z], [27.16, high, z + 0.025], 0.012, steel);
      d.shape(
        new T.TorusGeometry(0.045, 0.011, 5, 12, Math.PI * 1.45),
        steel,
        [27.16, high + 0.02, z + 0.025],
        [0, Math.PI / 2, 0],
      );
      if (i % 3 === 0)
        d.rod([27.16, low, z + 0.055], [27.16, high, z + 0.025], 0.014, rubber);
    }
  }
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 17; col++)
      d.shape(
        new T.CircleGeometry(0.005, 6),
        rubber,
        [27.13, 1.2 + row * 0.16, -91.2 + col * 0.15],
        [0, -Math.PI / 2, 0],
      );
  d.label(
    "ISOLATE SUPPLY\nBEFORE TESTING",
    24.25,
    2.08,
    -93.674,
    1.25,
    0.46,
    [0, 0, 0],
    { background: "#c3b58c", colour: "#3b3c33", font: 36, distress: true },
  );
  for (let i = 0; i < 3; i++) {
    d.shape(new T.TorusGeometry(0.25 + i * 0.014, 0.012, 5, 28), rubber, [
      25.7,
      1.65,
      -93.65 + i * 0.014,
    ]);
  }
  d.rod([25.7, 1.4, -93.61], [25.83, 0.8, -93.61], 0.013, rubber);
  d.rod([26.5, 2.65, -93.65], [22, 2.65, -93.65], 0.018, steel);
  for (let z = -93.5; z < -86.4; z += 0.18) {
    if (z < -92.4 || z > -87.6) d.box(21.34, 1.3, z, 0.055, 2.5, 0.045, steel);
  }
  // Corrugation battens and latch bars are close-up geometry, not flat stripes.
  for (let z = -84.35; z < -77.5; z += 0.22)
    d.box(15.615, 1.3, z, 0.03, 2.47, 0.038, steel);
  d.box(14.3, 2.56, -81, 2.6, 0.08, 7, rust);
  for (const x of [13.2, 15.4]) d.box(x, 1.3, -77.48, 0.085, 2.55, 0.06, rust);
  for (const x of [13.7, 14.9]) {
    d.rod([x, 0.25, -77.46], [x, 2.3, -77.46], 0.025, steel);
    d.box(x, 1.05, -77.42, 0.25, 0.055, 0.05, steel);
  }
  d.label(
    "HLD / 0038\nRETURN TO DEPOT",
    15.64,
    1.75,
    -80,
    1.5,
    0.55,
    [0, Math.PI / 2, 0],
    { background: "#394941", colour: "#c7c6ae", font: 33 },
  );
  d.label(
    "RIVER ACCESS\nKEEP CLEAR →",
    12.14,
    1.38,
    -100,
    1.6,
    0.54,
    [0, Math.PI / 2, 0],
    { background: "#686f63", colour: "#d9dac5", font: 36 },
  );
  for (const [x, z] of [
    [27.65, -74.5],
    [12.3, -87],
    [27.65, -102],
  ])
    d.flood(x, 3.8, z, 40);
  // Organic silhouettes cling to fence roots and cracks. No repeating grass grid.
  const weed = d.canvasMaterial(
    (c, s) => {
      for (let i = 0; i < 15; i++) {
        const x = s * (0.15 + ((i * 37) % 70) / 100),
          top = s * (0.06 + ((i * 17) % 49) / 100);
        c.strokeStyle = i % 3 ? "#525d39" : "#7e7950";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(s * 0.5, s);
        c.quadraticCurveTo(x, s * 0.55, x, top);
        c.stroke();
        for (let y = top + 30; y < s * 0.85; y += 50) {
          c.fillStyle = i % 2 ? "#5f6944" : "#7c8052";
          c.beginPath();
          c.ellipse(x + 10, y, 28, 5, -0.45, 0, Math.PI * 2);
          c.fill();
        }
      }
    },
    { alphaTest: 0.4, side: T.DoubleSide, roughness: 0.95 },
  );
  for (let i = 0; i < 80 * d.density; i++) {
    const side = i % 2 ? -1 : 1,
      x = 20 + side * (7.3 + ((i * 23) % 9) * 0.1);
    const z = -70.6 - ((i * 17) % 393) * 0.1,
      h = 0.18 + ((i * 29) % 40) * 0.013;
    d.plane(x, h / 2, z, 0.35 + h * 0.3, h, weed, [0, i * 2.4, 0]);
  }
  // Small colonising tufts follow every expansion joint, with gaps where feet
  // and tyres pass. Their alpha-tested silhouettes share the fence-root draw.
  for (const z of [-75.8, -82.9, -89.1, -98.9, -101.7, -108.5])
    for (let i = 0; i < 24 * d.density; i++) {
      const x = 12.4 + ((i * 37) % 153) * 0.1;
      if (Math.abs(x - 20) < 1.1 || (x > 21.3 && z < -86 && z > -94)) continue;
      const h = 0.07 + ((i * 19) % 13) * 0.009;
      d.plane(x, h / 2, z, 0.13, h, weed, [0, i * 1.7, 0]);
    }
  // Sparse aggregate toward the bank and slab edge, with a worn central path.
  const stone = d.material("rock", { scale: 0.5, tint: 0x9a9b91 });
  stone.userData.noReflect = true;
  for (let i = 0; i < 100 * d.density; i++) {
    const x = 12.5 + ((i * 73) % 151) * 0.1,
      z = -99.3 - ((i * 37) % 110) * 0.1;
    if (Math.abs(x - 20) < 1.5) continue;
    const size = 0.025 + (i % 5) * 0.012;
    d.box(x, size * 0.15, z, size * 1.6, size * 0.35, size, stone, 0, [
      0,
      i * 0.7,
      0.14,
    ]);
  }
  // A few hairline cracks develop branches rather than endlessly tiled decals.
  for (const [x, z, angle] of [
    [17, -76, 0.4],
    [23.9, -84, -0.8],
    [15.5, -94, 0.2],
  ]) {
    d.plane(x, 0.1, z - 0.6, 0.25, 0.2, weed, [0, angle, 0]);
    d.plane(x + 0.02, 0.08, z - 0.64, 0.21, 0.16, weed, [0, angle + 1.5, 0]);
    for (let i = 0; i < 8; i++) {
      const xx = x + Math.sin(i * 2.7) * 0.07 + i * Math.sin(angle) * 0.14;
      const zz = z - i * 0.17;
      d.box(xx, 0.001, zz, 0.012, 0.002, 0.24, rubber, 0, [
        0,
        angle + Math.sin(i) * 0.6,
        0,
      ]);
    }
  }
  // Gutters continue to drip after the rain eases. Points are soft and subdued.
  const drips = kit.particles(ctx.quality === "low" ? 18 : 36, {
    colour: 0xaab9c2,
    size: 0.025,
    opacity: 0.24,
  });
  group.add(drips);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  drips.userData.noReflect = true;
  const dressing = dressYard(ctx);
  d.finish();
  return {
    update({ time }) {
      const positions = drips.geometry.attributes.position;
      drips.visible = !reduced;
      for (let i = 0; i < positions.count; i++) {
        const phase = (time * 0.6 + i * 0.618) % 1;
        positions.setXYZ(
          i,
          21.22,
          3.2 * (1 - phase * phase),
          -93.7 + ((i * 23) % 76) * 0.1,
        );
      }
      positions.needsUpdate = true;
    },
    dispose() {
      dressing.dispose();
      d.dispose();
    },
  };
}
