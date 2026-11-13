// City dispatcher. Each part of the city has its own module and owner:
// zone 0 city-street.js, zone 1 city-alley.js, zone 2 city-yard.js, each
// exporting the standard `build(ctx)`. On loopback a missing or failing part
// falls back to the Phase A grey box for its zone so the others keep working.
const PARTS = [
  ["./city-street.js", 0],
  ["./city-alley.js", 1],
  ["./city-yard.js", 2],
];
export async function build(ctx) {
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:";
  const built = [];
  for (const [path, zone] of PARTS) {
    try {
      built.push(await (await import(path)).build(ctx));
    } catch (error) {
      if (!local) throw error;
      console.warn(`First Light ${path} unavailable, using grey box`, error);
      built.push(greyBox(ctx, zone));
    }
  }
  return {
    update: (frame) => built.forEach((part) => part.update(frame)),
    dispose: () => built.forEach((part) => part.dispose()),
  };
}
// Phase A grey box for one city zone, built from the authoritative solids.
function greyBox({ T, sim, kit, zoneGroup }, only) {
  const material = kit.material({
    color: 0x737b82,
    roughness: 0.65,
    weather: true,
  });
  for (const b of sim.layout.filter(
    (b) => b.zone === only && b.owner !== "story",
  )) {
    const size = b.max.map((v, i) => v - b.min[i]);
    const mesh = kit.box(...size, material, 0.025);
    mesh.position.set(...b.max.map((v, i) => (v + b.min[i]) / 2));
    mesh.castShadow = mesh.receiveShadow = true;
    zoneGroup(b.zone).add(mesh);
  }
  // Tile the actual bank surface without holes at the two route bends.
  for (const [zone, x, z, w, d] of [
    [0, 0, -21.5, 80, 47],
    [1, 10, -57.5, 50, 25],
    [2, 20, -90.5, 80, 41],
  ]) {
    if (zone !== only) continue;
    const geo = new T.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(
      geo,
      kit.material({ color: 0x363e45, roughness: 0.5, weather: true }),
    );
    mesh.position.set(x, -0.015, z);
    mesh.receiveShadow = true;
    zoneGroup(zone).add(mesh);
  }
  for (let s = 5; s < 130; s += 10) {
    const p = sim.at(s, s < 45 ? 5 : 1.65),
      zone = sim.ZONES.findIndex((z) => s >= z.s0 && s < z.s1),
      colour = zone === 1 ? 0x8d6de8 : 0xffb36b;
    if (zone !== only) continue;
    const lamp = kit.box(
      0.35,
      0.15,
      0.6,
      kit.material({ color: colour, emissive: colour, emissiveIntensity: 1 }),
    );
    lamp.position.set(p.x, 4, p.z);
    zoneGroup(zone).add(lamp);
    kit.addLightFixture({
      position: [p.x, 3.8, p.z],
      colour,
      intensity: 32,
      kind: "lamp",
    });
  }
  return { update() {}, dispose() {} };
}
