import { renderGroundY, random } from "./land-terrain.js";

/** Thin disturbed earth under boulders, sampled from the visible terrain skin.
 * Soft vertex alpha makes irregular soil margins meet grass without a hard disc. */
export function buildRockSoil(ctx) {
  const { T, sim, kit, zoneGroup } = ctx;
  const byZone = new Map(),
    meshes = [],
    geometry = [];
  const rng = random(29071),
    segments = 16;
  const material = kit.material({
    color: 0x65563d,
    roughness: 0.98,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  for (const b of sim.layout) {
    if (
      b.shape !== "box" ||
      !(
        b.kind === "cover" ||
        (b.owner === "land" && ["boulder", "talus"].includes(b.landRole))
      )
    )
      continue;
    const x = (b.min[0] + b.max[0]) / 2,
      z = (b.min[2] + b.max[2]) / 2;
    if (b.min[1] - sim.groundY(x, z) > 2) continue; // Decks stay paved.
    if (!byZone.has(b.zone))
      byZone.set(b.zone, { positions: [], colours: [], indices: [] });
    const batch = byZone.get(b.zone),
      start = batch.positions.length / 3;
    const rx = (b.max[0] - b.min[0]) / 2,
      rz = (b.max[2] - b.min[2]) / 2;
    batch.positions.push(x, renderGroundY(sim, x, z) + 0.025, z);
    batch.colours.push(0.8, 0.8, 0.8, 0.85);
    const turns = Array.from({ length: segments }, () => 0.92 + rng() * 0.16);
    for (const [radius, alpha] of [
      [0.5, 0.85],
      [0.9, 0.65],
      [1.25, 0],
    ]) {
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const px = x + Math.cos(angle) * rx * radius * turns[i];
        const pz = z + Math.sin(angle) * rz * radius * turns[i];
        batch.positions.push(px, renderGroundY(sim, px, pz) + 0.025, pz);
        const shade = 0.7 + rng() * 0.3;
        batch.colours.push(shade, shade, shade, alpha);
      }
    }
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      batch.indices.push(start, start + 1 + next, start + 1 + i);
      for (let ring = 0; ring < 2; ring++) {
        const a = start + 1 + ring * segments + i;
        const b = start + 1 + (ring + 1) * segments + i;
        const c = start + 1 + (ring + 1) * segments + next;
        const d = start + 1 + ring * segments + next;
        batch.indices.push(a, c, b, a, d, c);
      }
    }
  }
  for (const [zone, batch] of byZone) {
    const g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.Float32BufferAttribute(batch.positions, 3),
    );
    g.setAttribute("color", new T.Float32BufferAttribute(batch.colours, 4));
    g.setIndex(batch.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, material);
    mesh.name = "LAND-ROCK buried boulder soil";
    mesh.receiveShadow = true;
    mesh.userData.noSkyVis = true;
    zoneGroup(zone).add(mesh);
    meshes.push(mesh);
    geometry.push(g);
  }
  return {
    stats: {
      draws: meshes.length,
      triangles: geometry.reduce((sum, g) => sum + g.index.count / 3, 0),
    },
    dispose() {
      meshes.forEach((m) => m.removeFromParent());
      geometry.forEach((g) => g.dispose());
      material.dispose();
    },
  };
}
