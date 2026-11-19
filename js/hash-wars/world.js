import * as T from "three";

// Three updates hidden descendants by default. The color and shadow passes
// both skip them; gameplay queries can still update their own ancestor chains.
export function updateVisibleMatrices(object, force = false) {
  if (!object.visible) {
    if (force) object.matrixWorldNeedsUpdate = true;
    return;
  }
  // Skinned meshes and other Three subclasses can have work beyond transforms.
  if (object.updateMatrixWorld !== T.Object3D.prototype.updateMatrixWorld) {
    object.updateMatrixWorld(force);
    return;
  }
  const changed =
    force || object.matrixAutoUpdate || object.matrixWorldNeedsUpdate;
  object.updateWorldMatrix(false, false, force);
  for (const child of object.children) updateVisibleMatrices(child, changed);
}

/** Content modules have stable zone ownership; distant land belongs to scene. */
export async function buildWorld(ctx) {
  const groups = ctx.sim.ZONES.map((z) => {
    const g = new T.Group();
    g.name = z.name;
    g.matrixAutoUpdate = false;
    ctx.scene.add(g);
    return g;
  });
  const zoneGroup = (n) => groups[n];
  const dressed = new Set(),
    built = new Set();
  const claimSolid = (solid) => dressed.add(solid);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname),
    filter = local ? new URLSearchParams(location.search).get("mods") : null,
    modules = [];
  for (const name of [
    "land",
    "flora",
    "water",
    "stations",
    "arms",
    "machines",
    "story",
  ]) {
    if (filter !== null && !filter.split(",").includes(name)) continue;
    await ctx.progress(`Building ${name}…`);
    try {
      const module = await import(`./${name}.js`);
      modules.push(await module.build({ ...ctx, zoneGroup, claimSolid }));
      built.add(name);
    } catch (error) {
      if (!local) throw error;
      console.error(`HASH WARS ${name} failed`, error);
    }
  }
  // LAND's delivered basalt kit dresses every cover solid. Retain a fallback
  // if that package is absent, and the siege hull until Wave 2 claims it.
  if (built.has("land") && ctx.assets.get("/assets/hash-wars/rocks/basalt.glb"))
    ctx.sim.layout.filter((s) => s.kind === "cover").forEach(claimSolid);
  const proxies = [];
  const proxyMaterial = ctx.kit.material({ color: 0x818b8e, roughness: 0.75 });
  for (const solid of ctx.sim.layout) {
    if (dressed.has(solid) || !["cover", "siege-hull"].includes(solid.kind))
      continue;
    const size = solid.max.map((v, i) => v - solid.min[i]);
    const mesh = ctx.kit.box(...size, proxyMaterial, 0.04);
    mesh.position.set(...solid.min.map((v, i) => (v + solid.max[i]) / 2));
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = true;
    zoneGroup(solid.zone).add(mesh);
    if (solid.dynamic === "boss") proxies.push(mesh);
  }
  let visibleZone;
  return {
    groups,
    update(frame) {
      const { zone, boss } = frame.snapshot;
      if (visibleZone !== zone) {
        groups.forEach((g, i) => (g.visible = Math.abs(i - zone) <= 1));
        visibleZone = zone;
      }
      modules.forEach((m) => m.update(frame));
      for (const mesh of proxies) mesh.visible = boss.alive;
    },
    showAll() {
      groups.forEach((g) => (g.visible = true));
      visibleZone = undefined;
    },
    dispose() {
      modules.forEach((m) => m.dispose());
      groups.forEach((g) => {
        g.traverse((o) => {
          if (o.isInstancedMesh) o.dispose();
        });
        g.removeFromParent();
      });
    },
  };
}
