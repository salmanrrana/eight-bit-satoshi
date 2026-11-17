import { createStationKit } from "./stations-kit.js";
import { landscapeY } from "./land-terrain.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Only silhouettes beyond the playable banks: no far collision impostors. */
export function buildStationVistas(ctx, materials, resources) {
  const { T, scene, kit, sim } = ctx;
  const root = new T.Group();
  root.name = "STATIONS horizon infrastructure";
  scene.add(root);
  const box = new T.BoxGeometry(1, 1, 1),
    geometry = [],
    lines = [];
  resources.push(box);
  function block(x, y, z, w, h, d) {
    const g = box.clone();
    g.scale(w, h, d);
    g.translate(x, y + h / 2, z);
    geometry.push(g);
  }
  for (let i = 0; i < 9; i++) {
    const x = (i % 2 ? 1 : -1) * (42 + i * 3),
      z = -220 + i * 24;
    const y = landscapeY(sim, x, z) - 2,
      h = 21 + (i % 3) * 5;
    // Keeper station silhouette: plinth, wellhead, a stepped tapering spire
    // with a cap, and a bank of cooling fins beside it.
    block(x, y, z, 9, 2.6, 9);
    block(x + 2.5, y + 2.6, z - 2, 3.2, 3.5, 3.4);
    block(x, y + 2.6, z, 3.4, h * 0.45, 3.4);
    block(x, y + 2.6 + h * 0.45, z, 2.7, h * 0.35, 2.7);
    block(x, y + 2.6 + h * 0.8, z, 2.0, h * 0.2, 2.0);
    block(x, y + 2.6 + h, z, 3.0, 1.1, 3.0);
    for (let f = 0; f < 3; f++) block(x - 12, y, z - 3 + f * 3, 13, 2.8, 1.1);
    lines.push({ x, y, z, h, i });
  }
  const merged = mergeGeometries(geometry, false);
  geometry.forEach((g) => g.dispose());
  resources.push(merged);
  root.add(new T.Mesh(merged, materials.distant));
  const citadel = new T.Group();
  root.add(citadel);
  const gateKit = createStationKit(ctx, resources, (material) => material);
  const gate = sim.layout.find(
    (b) => b.stationPart?.node === "citadel_gate",
  )?.stationPart;
  if (gate && gateKit.place(gate, 4, citadel, true)) {
    gateKit.finish();
    citadel.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  }
  const matrix = new T.Object3D();
  const makeLines = (material) => {
    const mesh = new T.InstancedMesh(box, material, lines.length);
    root.add(mesh);
    return mesh;
  };
  const coldLines = makeLines(materials.farCold),
    warmLines = makeLines(materials.warm);
  // The Tether: about one pixel wide at 2 km, rising out of the far plane's
  // reach, with a warm climber crawling up it.
  const tetherGeometry = new T.CylinderGeometry(1.5, 1.5, 5200, 5);
  resources.push(tetherGeometry);
  const tether = new T.Mesh(tetherGeometry, materials.tether);
  tether.position.set(620, 2560, -1950);
  root.add(tether);
  const climber = kit.sphere(6, materials.warm);
  climber.position.set(620, 80, -1950);
  root.add(climber);
  return {
    root,
    update({ snapshot, time }) {
      citadel.visible = snapshot.zone < 3;
      for (const { x, y, z, h, i } of lines) {
        // Relays answer down the valley after the camera turns, 5–8 s.
        const seconds = (snapshot.ending * 9.5) / (sim.ENDING_SECONDS ?? 2.4);
        const on = Math.max(0, Math.min(1, (seconds - 5 - i * 0.36) / 0.65));
        matrix.position.set(x, y + h / 2 + 3, z);
        matrix.scale.set(0.42, on < 1 ? h - 2 : 0.00001, 3.5);
        matrix.updateMatrix();
        coldLines.setMatrixAt(i, matrix.matrix);
        matrix.scale.set(0.46, Math.max(0.00001, (h - 2) * on), 3.52);
        matrix.position.y = y + 4 + ((h - 2) * on) / 2;
        matrix.updateMatrix();
        warmLines.setMatrixAt(i, matrix.matrix);
      }
      coldLines.instanceMatrix.needsUpdate =
        warmLines.instanceMatrix.needsUpdate = true;
      climber.position.y = 60 + ((time * 22) % 4400);
    },
    dispose() {
      gateKit.dispose();
      coldLines.dispose();
      warmLines.dispose();
      root.removeFromParent();
    },
  };
}
