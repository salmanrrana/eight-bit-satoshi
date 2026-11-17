/** Pages, coins, navigation and finale. All visible effects use fixed pools. */
export function relics(ctx, mat, own, motion) {
  const { T, sim, scene } = ctx,
    geometry = [];
  const sheetGeometry = new T.PlaneGeometry(0.34, 0.47, 8, 12);
  geometry.push(sheetGeometry);
  const v = sheetGeometry.attributes.position;
  for (let i = 0; i < v.count; i++)
    v.setZ(
      i,
      0.008 * Math.cos(v.getX(i) * 15) + 0.012 * (v.getY(i) / 0.47) ** 2,
    );
  sheetGeometry.computeVertexNormals();
  const backGeometry = sheetGeometry.clone();
  geometry.push(backGeometry);
  const indices = backGeometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const b = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = b;
  }
  const backUV = backGeometry.attributes.uv,
    backNormal = backGeometry.attributes.normal;
  for (let i = 0; i < backUV.count; i++) {
    backUV.setX(i, 1 - backUV.getX(i));
    backNormal.setXYZ(
      i,
      -backNormal.getX(i),
      -backNormal.getY(i),
      -backNormal.getZ(i),
    );
  }

  const glowGeometry = new T.PlaneGeometry(0.8, 0.8);
  geometry.push(glowGeometry);
  const glintGeometry = new T.PlaneGeometry(0.75, 0.75);
  geometry.push(glintGeometry);
  const pages = sim.entities.pages.map((e, i) => {
    const group = own(new T.Group(), scene),
      sheet = new T.Mesh(sheetGeometry, mat.page);
    const back = new T.Mesh(backGeometry, mat.page);
    back.position.z = -0.0005;
    sheet.add(back);
    sheet.rotation.set(-0.08, 0, 0.06);
    group.name = `story-page-${i}`;
    sheet.userData.noSkyVis = true;
    group.add(sheet);
    const halo = new T.Mesh(glowGeometry, mat.soft);
    halo.position.z = -0.012;
    group.add(halo);
    const marker = new T.Mesh(glintGeometry, mat.soft);
    marker.position.set(0, -0.88, 0);
    marker.rotation.x = -Math.PI / 2;
    group.add(marker);
    const flourish = own(new T.Group(), scene);
    for (let j = 0; j < 8; j++) {
      const mote = new T.Mesh(glowGeometry, mat.soft);
      mote.scale.setScalar(0.15);
      flourish.add(mote);
    }
    flourish.visible = false;
    return {
      group,
      sheet,
      halo,
      marker,
      flourish,
      e,
      i,
      taken: false,
      age: 10,
    };
  });
  const coinGeometry = new T.CylinderGeometry(
    0.055,
    0.055,
    0.018,
    ctx.quality === "low" ? 16 : 24,
  );
  coinGeometry.rotateX(Math.PI / 2);
  const colours = new Float32Array(coinGeometry.attributes.position.count * 4);
  colours.fill(1);
  coinGeometry.setAttribute("color", new T.BufferAttribute(colours, 4));
  geometry.push(coinGeometry);
  // Cylinder cap UVs carry the authored B; its edge samples the same gold atlas.
  const maxDrops = 128,
    perDrop = 3,
    capacity = maxDrops * perDrop + sim.entities.stashes.length * 3;
  const coins = own(
    new T.InstancedMesh(coinGeometry, mat.coin, capacity),
    scene,
  );
  coins.userData.noSkyVis = true;
  coins.name = "story-coins";
  coins.frustumCulled = false;
  coins.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const states = Array.from({ length: maxDrops }, () => ({
    id: -1,
    age: 0,
    ground: 0,
    seen: -2,
  }));
  let sequence = 0;
  const dummy = new T.Object3D();
  const objective = {
    x: 0,
    y: 0,
    z: 0,
    type: "station",
    label: "",
    visible: false,
  };
  const nav = own(new T.Group(), scene);
  nav.name = "story-objective";
  nav.userData.objective = objective;
  const navMat = mat.effect(undefined, 0.6);
  const white = mat.canvas(8, 8);
  white.context.fillStyle = "#fff1d0";
  white.context.fillRect(0, 0, 8, 8);
  white.texture.needsUpdate = true;
  navMat.map = white.texture;
  const shape = new T.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-0.18, 0.25);
  shape.lineTo(-0.13, 0.29);
  shape.lineTo(0, 0.11);
  shape.lineTo(0.13, 0.29);
  shape.lineTo(0.18, 0.25);
  shape.closePath();
  const navGeo = new T.ShapeGeometry(shape);
  geometry.push(navGeo);
  const arrow = new T.Mesh(navGeo, navMat);
  nav.add(arrow);
  const beacon = sim.entities.beacon;
  const beaconPart = sim.layout.find(
    (s) => s.stationPart?.node === "summit_beacon",
  )?.stationPart;
  const beamBase = beaconPart ? beaconPart.y + 7.48 : beacon.y + 1;
  const monument = sim.layout.find((s) => s.kind === "monument");
  const monumentPart = sim.layout.find(
    (s) => s.stationPart?.node === "whitepaper_monument",
  )?.stationPart;
  const destination = monumentPart
    ? { x: monumentPart.x, y: monumentPart.y + 3.15, z: monumentPart.z + 1.3 }
    : monument
      ? {
          x: (monument.min[0] + monument.max[0]) / 2,
          y: monument.max[1] + 0.15,
          z: monument.max[2] + 0.1,
        }
      : { x: beacon.x, y: beacon.y + 2.2, z: beacon.z };
  const stationBeam = !!scene.getObjectByName("STATIONS zone 5");
  const beamGeo = new T.CylinderGeometry(0.14, 0.2, 180, 16, 1, true);
  geometry.push(beamGeo);
  const beamMat = mat.effect(undefined, 0);
  const beam = own(new T.Mesh(beamGeo, beamMat), scene);
  beam.position.set(beacon.x, beamBase + 90, beacon.z);
  beam.visible = false;
  const beamHaloGeo = new T.CylinderGeometry(0.7, 1.1, 180, 16, 1, true);
  geometry.push(beamHaloGeo);
  const beamHaloMat = mat.effect(undefined, 0);
  const beamHalo = own(new T.Mesh(beamHaloGeo, beamHaloMat), scene);
  beamHalo.position.copy(beam.position);
  beamHalo.visible = false;
  const frustum = new T.Frustum(),
    projection = new T.Matrix4(),
    coinBounds = new T.Sphere(new T.Vector3(), 0.07);
  let lastTime = -1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function putCoin(index, x, y, z, rx, ry, rz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    coins.setMatrixAt(index, dummy.matrix);
  }
  return {
    objective,
    counts: {
      pages: pages.length,
      coinInstances: capacity,
      flourishMotes: pages.length * 8,
      objectiveMarkers: 1,
    },
    update({ snapshot: s, dt, time, camera }) {
      const reduced = motion.matches;
      const reset = s.time < lastTime;
      lastTime = s.time;
      sequence++;
      for (const p of pages) {
        if (reset) {
          p.taken = !!s.pagesTaken[p.i];
          p.age = 10;
        }
        if (!p.taken && s.pagesTaken[p.i]) {
          p.taken = true;
          p.age = 0;
        }
        if (!s.pagesTaken[p.i]) p.taken = false;
        p.age += dt;
        const distance = Math.hypot(s.player.x - p.e.x, s.player.z - p.e.z);
        p.group.visible =
          (!p.taken && distance < 100) || (!!s.ending && p.taken);
        p.group.position.set(p.e.x, p.e.y + 0.95, p.e.z);
        p.group.rotation.y = 0;
        p.sheet.rotation.y = reduced ? 0.25 : time * 0.18 + p.i * 0.8;
        p.halo.quaternion.copy(camera.quaternion);
        if (s.ending && p.taken) {
          const t = clamp((s.ending - 0.5 - p.i * 0.08) / 2.4, 0, 1),
            u = t * t * (3 - 2 * t);
          p.group.position.set(
            p.e.x + (destination.x + (p.i - 4) * 0.22 - p.e.x) * u,
            p.e.y +
              0.95 +
              (destination.y + Math.sin(p.i) * 0.08 - p.e.y - 0.95) * u +
              Math.sin(t * Math.PI) * 12,
            p.e.z + (destination.z + p.i * 0.015 - p.e.z) * u,
          );
          p.group.scale.setScalar(1 - 0.65 * u);
          p.group.rotation.y = reduced
            ? 0.25
            : (time * 0.4 + p.i) * (1 - u) + u * 0.2;
          p.marker.visible = false;
          p.halo.visible = t < 0.95;
        } else {
          p.group.scale.setScalar(1);
          p.marker.visible = true;
          p.halo.visible = true;
        }
        p.flourish.visible = !reduced && p.age < 0.8 && !s.ending;
        if (p.flourish.visible) {
          p.flourish.position.set(p.e.x, p.e.y + 1, p.e.z);
          for (let j = 0; j < 8; j++) {
            const a = (j * Math.PI) / 4,
              m = p.flourish.children[j];
            m.position.set(
              Math.cos(a) * p.age * 0.5,
              p.age * 0.7,
              Math.sin(a) * p.age * 0.5,
            );
            m.scale.setScalar(0.16 * (1 - p.age / 0.8));
            m.quaternion.copy(camera.quaternion);
          }
        }
      }
      let count = 0;
      for (let i = 0; i < Math.min(maxDrops, s.drops.length); i++) {
        const e = s.drops[i],
          state = states[e.id % maxDrops];
        if (state.id !== e.id || reset || state.seen !== sequence - 1) {
          state.id = e.id;
          state.age = 0;
          state.ground = e.y - 0.5;
        }
        state.seen = sequence;
        state.age += dt;
        if (Math.abs(e.z - s.player.z) > 100) continue;
        const attract = clamp(
          1 - Math.hypot(e.x - s.player.x, e.z - s.player.z) / 2.5,
          0,
          1,
        );
        for (let j = 0; j < 3; j++) {
          const angle = e.id * 1.7 + j * 2.094,
            age = state.age,
            settle = reduced ? 1 : clamp(age / 1.2, 0, 1);
          const spread = (0.15 + 0.18 * settle) * (1 - attract);
          const bounce = reduced
            ? 0
            : Math.abs(Math.sin(age * 7 + j * 0.35)) *
              Math.max(0, 1 - age / 1.3) *
              0.65;
          const y = state.ground + 0.022 + j * 0.012 + bounce + attract * 0.5;
          putCoin(
            count++,
            e.x + Math.cos(angle) * spread,
            y,
            e.z + Math.sin(angle) * spread,
            -Math.PI / 2 + (1 - settle) * 1.7,
            (1 - settle) * angle,
            angle + (reduced ? 0 : (1 - settle) * age * 4),
          );
        }
      }
      for (let i = 0; i < sim.entities.stashes.length; i++) {
        const e = sim.entities.stashes[i];
        if (s.stashesTaken?.[i] || Math.abs(e.z - s.player.z) > 100) continue;
        for (let j = 0; j < 3; j++)
          putCoin(
            count++,
            e.x + (j - 1) * 0.13,
            e.y + 0.035 + j * 0.018,
            e.z + (j % 2) * 0.1,
            -Math.PI / 2,
            0,
            j * 0.8,
          );
      }
      // Compact the existing matrices; retain every visible coin and its motion.
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      const matrices = coins.instanceMatrix.array;
      let visible = 0;
      for (let i = 0; i < count; i++) {
        coinBounds.center.set(
          matrices[i * 16 + 12],
          matrices[i * 16 + 13],
          matrices[i * 16 + 14],
        );
        if (!frustum.intersectsSphere(coinBounds)) continue;
        if (visible !== i)
          matrices.copyWithin(visible * 16, i * 16, (i + 1) * 16);
        visible++;
      }
      coins.count = visible;
      coins.instanceMatrix.needsUpdate = true;
      let target = sim.entities.beacon,
        type = "beacon",
        label = "LIGHT THE BEACON";
      const next = s.stations.findIndex(
        (station) => station.state !== "keeper",
      );
      if (next >= 0) {
        target = sim.entities.stations[next];
        type = "station";
        label = `STATION ${next + 1}`;
      }
      if (next === 2 && s.boss.alive) {
        const i = s.boss.clamps.findIndex((c) => c.alive);
        if (i >= 0) {
          target = sim.entities.clamps[i];
          type = "clamp";
          label = `BREAK CLAMP ${i + 1}`;
        }
      }
      objective.x = target.x;
      objective.y =
        type === "beacon" && beaconPart
          ? beaconPart.y + 8.2
          : target.y + (type === "clamp" ? 2 : 3);
      objective.z = target.z;
      objective.type = type;
      objective.label = label;
      objective.visible = !s.ending;
      nav.position.set(objective.x, objective.y, objective.z);
      nav.quaternion.copy(camera.quaternion);
      const distance = Math.hypot(s.player.x - target.x, s.player.z - target.z);
      nav.visible = objective.visible;
      navMat.opacity = 0.65 * clamp((distance - 4) / 12, 0, 1);
      nav.scale.setScalar(clamp(distance / 25, 1, 3));
      beam.visible = !!s.ending && !stationBeam;
      beamHalo.visible = !!s.ending;
      beamMat.opacity = clamp(s.ending - 0.3, 0, 0.85);
      beamHaloMat.opacity = clamp((s.ending - 0.4) * 0.15, 0, 0.15);
      beam.scale.y = beamHalo.scale.y = clamp(s.ending * 0.8, 0.001, 1);
      beam.position.y = beamBase + 90 * beam.scale.y;
      beamHalo.position.y = beam.position.y;
    },
    dispose() {
      coins.dispose();
      geometry.forEach((g) => g.dispose());
      navMat.dispose();
      beamMat.dispose();
      beamHaloMat.dispose();
    },
  };
}
