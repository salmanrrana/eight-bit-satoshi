import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Low and high retain the visible equipment meshes, but casts one cheap silhouette
 * per site from its authored solids (including route supports). No fin bolts or lettering enter the sun
 * pass. The invisible carrier writes neither colour nor camera depth. */
export function buildStationShadows(
  { T, sim, quality },
  groups,
  dressed,
  resources,
  ownedMaterials,
) {
  if (quality === "ultra") return;
  const batches = new Map();
  const material = new T.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  ownedMaterials.push(material);
  for (const solid of sim.layout) {
    const part = solid.stationPart ?? solid.stationAssembly;
    if (
      !dressed.has(part) ||
      !(
        part?.file === "route.glb" ||
        part?.node === "citadel_gate" ||
        (part?.file === "station.glb" && part.station >= 0 && part.station < 3)
      ) ||
      part.node.startsWith("pipe_run") ||
      part.node === "lamp_mast"
    )
      continue;
    let geometry;
    if (solid.shape === "box") {
      const size = solid.max.map((v, i) => v - solid.min[i]);
      geometry = new T.BoxGeometry(...size);
      geometry.translate(...solid.min.map((v, i) => v + size[i] / 2));
    } else if (solid.shape === "cyl") {
      geometry = new T.CylinderGeometry(
        solid.r,
        solid.r,
        solid.y1 - solid.y0,
        8,
      );
      geometry.translate(solid.x, (solid.y0 + solid.y1) / 2, solid.z);
    } else continue;
    if (!batches.has(solid.zone)) batches.set(solid.zone, []);
    batches.get(solid.zone).push(geometry);
  }
  for (const [zone, pieces] of batches) {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((g) => g.dispose());
    resources.push(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `STATIONS shadow silhouettes ${zone}`;
    mesh.castShadow = true;
    groups[zone].root.add(mesh);
  }
}
