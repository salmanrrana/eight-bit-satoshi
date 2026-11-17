/** Fixed rotor pools: the authored hub stays inside its collision housing.
 * Power ramps with the station's existing relight state; no objects spawn. */
export function buildStationFans({ T, sim, quality }, library, groups, states) {
  const pieces = library.source("station.glb", "fin_fan", quality === "low");
  const batches = [];
  const dummy = new T.Object3D();
  for (let station = 0; station < 3; station++) {
    const sites = sim.layout
      .filter(
        (b) =>
          b.stationPart?.station === station &&
          b.stationPart.node.startsWith("fin_row"),
      )
      .map((b) => b.stationPart);
    const hubs = sites.flatMap((p) =>
      [-1.8, 1.8].map((x) => ({
        x: p.x + Math.cos(p.yaw || 0) * x,
        y: p.y + 2.95 * (p.scale?.[1] ?? 1),
        z: p.z - Math.sin(p.yaw || 0) * x,
      })),
    );
    if (!hubs.length || !pieces) continue;
    for (const { geometry, material } of pieces) {
      const mesh = new T.InstancedMesh(geometry, material, hubs.length);
      mesh.name = `STATIONS cooling rotors ${station + 1}`;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      groups[sim.entities.stations[station].zone].root.add(mesh);
      batches.push({ mesh, hubs, station, angle: 0 });
    }
  }
  let previousTime = -1;
  return {
    update({ snapshot, dt }) {
      const reset = snapshot.time < previousTime;
      previousTime = snapshot.time;
      for (const b of batches) {
        if (reset) b.angle = 0;
        b.angle =
          (b.angle + dt * states[b.station].power ** 2 * 13) % (Math.PI * 2);
        for (let i = 0; i < b.hubs.length; i++) {
          const h = b.hubs[i];
          dummy.position.set(h.x, h.y, h.z);
          dummy.rotation.y = b.angle + i * 0.71;
          dummy.updateMatrix();
          b.mesh.setMatrixAt(i, dummy.matrix);
        }
        b.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh } of batches) {
        mesh.dispose();
        mesh.removeFromParent();
      }
    },
  };
}
