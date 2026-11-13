import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { surface } from "./surfaces.js";

// Detail is baked by material. A whole rack of fins is one draw, not sixty.
export function detailBuilder(T, kit, own, quality = "high") {
  const low = quality === "low";
  const parts = new Map();
  function put(geometry, material, position, rotation = [0, 0, 0]) {
    const transform = new T.Matrix4().compose(
      new T.Vector3(...position),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
      new T.Vector3(1, 1, 1),
    );
    const local = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    local.applyMatrix4(transform);
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(local);
  }
  function block(material, x, y, z, w, h, d, radius = 0.006, rotation) {
    // Microscopic bevels disappear below a pixel. Keep reeds/fins to 12 triangles.
    const geometry =
      radius <= 0.003
        ? own(new T.BoxGeometry(w, h, d))
        : low
          ? own(new T.BoxGeometry(w, h, d, 2, 2, 2))
          : kit.roundedBox(w, h, d, radius);
    if (low && radius > 0.003) {
      const p = geometry.attributes.position,
        normal = geometry.attributes.normal;
      const v = new T.Vector3(),
        centre = new T.Vector3();
      const r = Math.min(radius, w / 2, h / 2, d / 2);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        centre.set(
          T.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r),
          T.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r),
          T.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r),
        );
        v.sub(centre).normalize();
        normal.setXYZ(i, v.x, v.y, v.z);
        v.multiplyScalar(r).add(centre);
        p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    put(geometry, material, [x, y, z], rotation);
  }
  function disc(
    material,
    x,
    y,
    z,
    radius,
    depth,
    rotation = [Math.PI / 2, 0, 0],
    segments = 32,
  ) {
    const g = new T.CylinderGeometry(
      radius,
      radius,
      depth,
      low ? Math.min(segments, 16) : segments,
    );
    put(g, material, [x, y, z], rotation);
    g.dispose();
  }
  function torus(
    material,
    x,
    y,
    z,
    radius,
    thickness,
    rotation = [0, 0, 0],
    segments = 40,
  ) {
    const g = new T.TorusGeometry(
      radius,
      thickness,
      low ? 3 : 6,
      low ? Math.min(segments, 24) : segments,
    );
    put(g, material, [x, y, z], rotation);
    g.dispose();
  }
  function tube(material, points, radius, segments = 24) {
    const g = new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
      low ? Math.min(segments, Math.max(8, points.length * 2 - 4)) : segments,
      radius,
      low ? 4 : 6,
      false,
    );
    put(g, material, [0, 0, 0]);
    g.dispose();
  }
  function finish(parent, shadow = true) {
    for (const [material, geometries] of parts) {
      const mesh = new T.Mesh(own(mergeGeometries(geometries)), material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
    parts.clear();
  }
  return { put, block, disc, torus, tube, finish };
}

export function buildMachines(ctx, own, billMaterial) {
  const { T, kit, sim, zoneGroup, quality } = ctx;
  const low = quality === "low";
  const unregister = [];
  const mat = (name, options = {}) =>
    surface(kit, name, { space: "object", ...options });
  const steel = mat("galvanized", { scale: 0.23 });
  const brass = mat("brass", { scale: 0.15 });
  // Recolour the green enamel pigment to charcoal without amplifying red rust.
  const coatBase = mat("paintedMetal", {
    tint: new T.Color(1.25, 1.25, 1.25),
    scale: 0.28,
  });
  const dark = kit.material({
    color: coatBase.color.clone(),
    roughness: coatBase.roughness,
    metalness: coatBase.metalness,
  });
  const coatCompile = coatBase.onBeforeCompile,
    coatKey = coatBase.customProgramCacheKey();
  dark.onBeforeCompile = (shader, renderer) => {
    coatCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "diffuseColor.rgb*=flC.rgb*",
      `float intactCoat=1.-smoothstep(-.015,.015,flC.r-flC.g);
      flC.rgb=mix(flC.rgb,vec3(dot(flC.rgb,vec3(.2126,.7152,.0722))),intactCoat);
      diffuseColor.rgb*=flC.rgb*`,
    );
  };
  dark.customProgramCacheKey = () => coatKey + "|vault-charcoal-coat";
  const ink = mat("paintedMetal", { tint: 0x9bada3, scale: 0.18 });
  const rubber = mat("rubber", { scale: 0.12 });
  const copper = mat("brass", { tint: 0xb86a3e, scale: 0.12 });
  const wire = mat("plastic", { tint: 0x814b24, scale: 0.1 });
  const build = () => detailBuilder(T, kit, own, quality);
  const labels = new Map();
  const machines = sim.entities.enemies.map((entity, index) => {
    const root = new T.Group();
    root.userData.storyMachine = entity.kind;
    root.position.set(entity.x, entity.y, entity.z);
    zoneGroup(entity.zone).add(root);
    const chassis = new T.Group(),
      shell = new T.Group(),
      roof = new T.Group();
    root.add(chassis, shell, roof);
    shell.position.y = 0.29;
    roof.position.y = 0.72;
    const b = build();
    b.block(dark, 0, 0.205, 0, 0.68, 0.12, 0.72, 0.018);
    for (const z of [-0.26, 0.26]) {
      b.disc(steel, 0, 0.15, z, 0.024, 0.72, [0, 0, Math.PI / 2]);
      for (const x of [-0.27, 0.27]) {
        b.tube(
          steel,
          [
            [x, 0.15, z],
            [x * 0.8, 0.22, z - 0.03],
            [x, 0.3, z],
          ],
          0.014,
        );
        for (let n = 0; n < 5; n++)
          b.torus(steel, x, 0.2 + n * 0.014, z, 0.03, 0.004, [
            Math.PI / 2,
            0,
            0,
          ]);
      }
    }
    b.finish(chassis);
    const wheels = new T.InstancedMesh(
      own(new T.CylinderGeometry(0.123, 0.123, 0.085, low ? 12 : 28)),
      rubber,
      4,
    );
    wheels.castShadow = true;
    root.add(wheels);
    const hubs = new T.InstancedMesh(
      own(new T.CylinderGeometry(0.06, 0.06, 0.091, low ? 10 : 24)),
      steel,
      4,
    );
    root.add(hubs);
    const tread = build();
    for (let n = 0; n < (low ? 12 : 24); n++) {
      const a = (n * Math.PI) / (low ? 6 : 12);
      tread.block(
        dark,
        0,
        Math.sin(a) * 0.123,
        Math.cos(a) * 0.123,
        0.087,
        0.008,
        0.008,
        0.002,
        [a, 0, 0],
      );
    }
    const wheelTread = new T.Group();
    tread.finish(wheelTread, false);
    const treads = new T.InstancedMesh(
      wheelTread.children[0].geometry,
      dark,
      4,
    );
    root.add(treads);
    const rotors = [],
      panels = [],
      ribbons = [];
    const lampMaterial = kit.material({
      color: 0x802921,
      emissive: 0xff2111,
      emissiveIntensity: 3,
      roughness: 0.2,
    });
    const glowColour = new T.Color(0xffd59a);
    const workLamp = kit.material({
      color: 0xffe3b0,
      emissive: 0xffd38b,
      emissiveIntensity: 2.4,
      roughness: 0.16,
      metalness: 0.1,
    });
    const hot = kit.material({
      color: 0x6c2410,
      emissive: 0xff630e,
      emissiveIntensity: 1.6,
      roughness: 0.48,
      metalness: 0.5,
    });
    if (entity.kind === "banker") {
      b.block(dark, 0, 0.19, 0, 0.72, 0.43, 0.64, 0.033);
      // Closely spaced inlaid pinstripes break the enamel's broad planes.
      for (let x = -0.25; x <= 0.26; x += 0.044)
        b.block(steel, x, 0.19, 0.353, 0.003, 0.27, 0.0015, 0.0003);
      b.block(rubber, 0, 0.19, 0.326, 0.62, 0.36, 0.012, 0.025);
      b.block(dark, 0, 0.19, 0.339, 0.59, 0.33, 0.024, 0.022);
      b.disc(steel, 0, 0.22, 0.366, 0.205, 0.035);
      b.torus(brass, 0, 0.22, 0.4, 0.17, 0.019);
      for (let arm = 0; arm < 3; arm++) {
        const a = (arm * Math.PI * 2) / 3;
        b.tube(
          brass,
          [
            [0, 0.22, 0.43],
            [Math.sin(a) * 0.14, 0.22 + Math.cos(a) * 0.14, 0.43],
          ],
          0.012,
          4,
        );
      }
      b.disc(brass, -0.02, 0.22, 0.364, 0.111, 0.025);
      b.disc(dark, -0.02, 0.22, 0.38, 0.084, 0.016);
      b.disc(brass, -0.02, 0.22, 0.397, 0.046, 0.026);
      b.torus(brass, -0.02, 0.22, 0.382, 0.095, 0.0035);
      for (let n = 0; n < 40; n++) {
        const a = (n * Math.PI) / 20;
        b.block(
          brass,
          -0.02 + Math.sin(a) * 0.094,
          0.22 + Math.cos(a) * 0.094,
          0.386,
          0.002,
          n % 5 ? 0.007 : 0.015,
          0.002,
          0.0003,
          [0, 0, -a],
        );
      }
      b.block(steel, 0.217, 0.2, 0.372, 0.027, 0.16, 0.022);
      for (const y of [0.09, 0.31])
        b.disc(brass, -0.3, y, 0.349, 0.027, 0.07, [0, 0, 0]);
      b.block(brass, 0.23, 0.34, 0.36, 0.071, 0.06, 0.018);
      b.disc(lampMaterial, 0.23, 0.34, 0.378, 0.019, 0.012);
      for (const x of [-0.31, 0.31])
        for (const y of [0.04, 0.39])
          b.disc(steel, x, y, 0.33, 0.009, 0.01, undefined, 8);
      const dial = new T.Group();
      dial.position.set(-0.02, 0.22, 0.414);
      shell.add(dial);
      const pointer = build();
      pointer.block(brass, 0, 0.025, 0, 0.009, 0.033, 0.006, 0.002);
      pointer.finish(dial, false);
      rotors.push({ group: dial, axis: "z", speed: 0.35, tick: true });
      b.finish(shell);
      b.block(dark, 0, 0.04, 0, 0.76, 0.09, 0.68, 0.025);
      b.block(brass, 0, 0.088, 0.07, 0.2, 0.003, 0.07, 0.002);
      b.finish(roof);
    } else if (entity.kind === "printer") {
      b.disc(billMaterial, 0, 0.56, -0.19, 0.16, 0.5, [0, 0, Math.PI / 2]);
      b.block(steel, 0, 0.12, 0.4, 0.53, 0.035, 0.34, 0.006, [-0.2, 0, 0]);
      for (const x of [-0.3, 0.3]) {
        b.block(ink, x, 0.16, 0, 0.09, 0.4, 0.59, 0.025);
        b.block(steel, x, 0.36, 0, 0.105, 0.034, 0.59);
        for (const z of [-0.23, 0.23])
          b.disc(brass, x, 0.17, z, 0.043, 0.11, [0, 0, Math.PI / 2]);
      }
      b.block(steel, 0, 0.02, 0, 0.5, 0.035, 0.56);
      b.block(dark, 0, 0.07, -0.2, 0.47, 0.04, 0.15);
      b.block(lampMaterial, 0.3, 0.32, 0.3, 0.03, 0.025, 0.015);
      b.finish(shell);
      for (const z of [-0.19, 0.09]) {
        const roller = new T.Group();
        roller.position.set(0, 0.4, z);
        shell.add(roller);
        b.disc(rubber, 0, 0, 0, 0.101, 0.49, [0, 0, Math.PI / 2]);
        for (const x of [-0.26, 0.26])
          b.disc(brass, x, 0, 0, 0.119, 0.021, [0, 0, Math.PI / 2]);
        for (let n = 0; n < 10; n++) {
          const a = (n * Math.PI) / 5;
          b.block(
            steel,
            0,
            Math.cos(a) * 0.101,
            Math.sin(a) * 0.101,
            0.46,
            0.005,
            0.005,
            0.001,
          );
        }
        b.finish(roller);
        rotors.push({ group: roller, axis: "x", speed: 3 });
      }
      b.block(ink, 0, 0.02, 0.11, 0.56, 0.045, 0.28, 0.015);
      b.finish(roof);
      for (let n = 0; n < 4; n++) {
        const page = new T.Mesh(
          own(new T.PlaneGeometry(0.31, 0.17, 6, 4)),
          billMaterial,
        );
        page.position.set(0, 0.6 - n * 0.08, -0.13 - n * 0.065);
        page.rotation.set(-0.5 - n * 0.15, 0, 0.04);
        root.add(page);
        ribbons.push(page);
      }
    } else {
      for (const x of [-0.32, 0.32])
        for (const z of [-0.3, 0.3]) {
          b.block(steel, x, 0.23, z, 0.024, 0.48, 0.024);
          b.block(brass, x, 0.05, z, 0.045, 0.05, 0.045);
        }
      b.block(dark, 0, 0.03, 0, 0.65, 0.035, 0.62);
      for (const z of [-0.27, 0.27])
        b.block(steel, 0, 0.47, z, 0.66, 0.028, 0.028);
      for (const x of [-0.32, 0.32])
        b.block(steel, x, 0.47, 0, 0.028, 0.028, 0.62);
      for (let n = 0; n < 3; n++) {
        const x = -0.21 + n * 0.21;
        b.block(ink, x, 0.22, -0.03, 0.04, 0.3, 0.43);
        for (let fin = 0; fin < 12; fin++)
          b.block(
            fin % 4 === 0 ? hot : steel,
            x + 0.023,
            0.25,
            -0.23 + fin * 0.035,
            0.09,
            0.22,
            0.006,
            0.001,
          );
        b.tube(
          wire,
          [
            [x, 0.08, 0.21],
            [x + 0.05, 0.02, 0.27],
            [x + 0.07, 0.38, 0.26],
            [x, 0.39, 0.15],
          ],
          0.009,
        );
      }
      b.tube(
        copper,
        [
          [-0.3, 0.16, -0.22],
          [-0.28, 0.4, -0.22],
          [0.26, 0.43, -0.22],
          [0.28, 0.16, -0.22],
        ],
        0.015,
      );
      b.block(dark, 0, 0.23, 0.27, 0.6, 0.37, 0.035);
      b.disc(lampMaterial, 0.26, 0.39, 0.294, 0.012, 0.008);
      b.finish(shell);
      for (const x of [-0.155, 0.155]) {
        const fan = new T.Group();
        fan.position.set(x, 0.23, 0.303);
        shell.add(fan);
        b.disc(dark, 0, 0, 0, 0.031, 0.026);
        for (let n = 0; n < 7; n++) {
          const a = (n * Math.PI * 2) / 7;
          b.block(
            rubber,
            Math.cos(a) * 0.058,
            Math.sin(a) * 0.058,
            0,
            0.087,
            0.032,
            0.008,
            0.009,
            [0, 0, a + 0.4],
          );
        }
        b.finish(fan, false);
        rotors.push({ group: fan, axis: "z", speed: 15 });
        b.torus(steel, x, 0.23, 0.325, 0.125, 0.007);
        for (const r of [0.05, 0.078, 0.103])
          b.torus(steel, x, 0.23, 0.33, r, 0.002);
        for (const a of [0, Math.PI / 3, -Math.PI / 3])
          b.block(steel, x, 0.23, 0.334, 0.25, 0.004, 0.004, 0.001, [0, 0, a]);
        b.finish(shell, false);
      }
      b.finish(shell, false);
      b.block(dark, 0, 0.037, -0.2, 0.59, 0.07, 0.12);
      b.finish(roof);
    }
    // A recessed ribbed glass lens and bright rim remain legible in a wet night.
    b.disc(brass, -0.235, 0.34, 0.328, 0.049, 0.025);
    const lens = new T.SphereGeometry(
      0.037,
      low ? 12 : 24,
      low ? 4 : 8,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    lens.rotateX(Math.PI / 2);
    lens.scale(1, 1, 0.35);
    b.put(lens, workLamp, [-0.235, 0.34, 0.345]);
    lens.dispose();
    b.torus(steel, -0.235, 0.34, 0.356, 0.039, 0.004);
    for (let n = -2; n <= 2; n++)
      b.block(
        steel,
        -0.235 + n * 0.011,
        0.34,
        0.357,
        0.002,
        0.055,
        0.002,
        0.0005,
      );
    b.finish(shell, false);
    for (const x of [-0.32, 0.32])
      b.block(brass, x, 0.045, 0.27, 0.016, 0.025, 0.13, 0.003);
    b.finish(roof, false);
    if (index === 0 || index === 1 || index === 4)
      unregister.push(
        kit.addLightFixture({
          position: [entity.x, entity.y + 0.7, entity.z + 0.5],
          colour: glowColour,
          intensity: 2.8,
          kind: "patrol-worklamp",
        }),
      );
    if (!labels.has(entity.kind)) {
      const names = {
        banker: "CIVIC / VAULT 04",
        printer: "ROTARY PRESS / 12",
        miner: "HASH ARRAY / 09",
      };
      labels.set(
        entity.kind,
        kit.material({
          map: kit.text(names[entity.kind], {
            width: 512,
            height: 96,
            background: "#b3aa8c",
            colour: "#292d2c",
            font: 34,
          }),
          roughness: 0.52,
          metalness: 0.4,
        }),
      );
    }
    const label = new T.Mesh(
      own(new T.PlaneGeometry(0.235, 0.044)),
      labels.get(entity.kind),
    );
    label.position.set(
      0,
      entity.kind === "banker" ? 0.036 : 0.03,
      entity.kind === "banker" ? 0.355 : 0.32,
    );
    shell.add(label);
    // Hinged side panels deform independently of the compressed inner mechanism.
    for (const side of [-1, 1]) {
      const panel = new T.Group();
      panel.position.set(side * 0.35, 0.25, -0.02);
      root.add(panel);
      b.block(
        entity.kind === "printer" ? ink : dark,
        0,
        0.18,
        0,
        0.016,
        0.35,
        0.51,
      );
      if (entity.kind !== "miner") {
        for (let n = 0; n < 9; n++)
          b.block(
            steel,
            side * 0.011,
            0.21,
            -0.18 + n * 0.044,
            0.003,
            0.095,
            0.008,
            0.001,
          );
        if (entity.kind === "banker")
          for (let n = 0; n < 14; n++)
            b.block(
              steel,
              side * 0.0095,
              0.18,
              -0.24 + n * 0.036,
              0.0025,
              0.29,
              0.0012,
              0.0003,
            );
      }
      b.finish(panel);
      panel.visible = entity.kind !== "miner";
      panels.push({ panel, side });
    }
    if (low) {
      // Hulls, rollers, frames and tyres carry the silhouette. Inlaid hardware
      // adds redundant shadow draws inside the hull's own shadow on low.
      const hardware = new Set([
        brass,
        copper,
        wire,
        lampMaterial,
        workLamp,
        hot,
      ]);
      if (entity.kind !== "miner") hardware.add(steel);
      if (entity.kind === "banker") hardware.add(rubber);
      root.traverse((object) => {
        if (
          object.isMesh &&
          !object.isInstancedMesh &&
          hardware.has(object.material)
        )
          object.castShadow = false;
      });
    }
    return {
      root,
      chassis,
      shell,
      roof,
      wheels,
      hubs,
      treads,
      rotors,
      panels,
      ribbons,
      lampMaterial,
      glowColour,
      workLamp,
      hot,
      entity,
      index,
      wheelAngle: 0,
      previousX: entity.x,
      previousZ: entity.z,
    };
  });
  const transform = new T.Object3D();
  return {
    machines,
    dispose() {
      unregister.forEach((remove) => remove());
    },
    update(snapshot, time, dt, reduced) {
      for (const bot of machines) {
        const e = snapshot.enemies[bot.index];
        const distance = Math.hypot(e.x - bot.previousX, e.z - bot.previousZ);
        bot.previousX = e.x;
        bot.previousZ = e.z;
        bot.wheelAngle += Math.min(distance, 0.15) / 0.123;
        const q = e.squash;
        const bob =
          reduced || !e.alive ? 0 : Math.sin(time * 10 + bot.index) * 0.006;
        bot.root.position.set(e.x, e.y, e.z);
        bot.root.rotation.y = e.heading;
        bot.chassis.scale.y = 1 - q * 0.3;
        bot.chassis.position.y = bob;
        bot.shell.position.y = 0.29 - q * 0.17 + bob;
        bot.shell.scale.set(1 + q * 0.03, 1 - q * 0.72, 1);
        bot.shell.rotation.z = q * 0.09;
        bot.roof.position.y = 0.72 - q * 0.49 + bob;
        bot.roof.rotation.set(q * 0.18, 0, q * -0.17);
        bot.panels.forEach(({ panel, side }) => {
          panel.rotation.z = side * q * -0.46;
          panel.position.x = side * (0.35 - q * 0.12);
          panel.position.y = 0.25 + bob;
          panel.scale.y = 1 - q * 0.58;
        });
        bot.rotors.forEach(({ group, axis, speed, tick }) => {
          if (e.alive && !reduced)
            group.rotation[axis] = tick
              ? Math.floor(time * 0.65) * 0.31
              : time * speed;
          group.scale.y = 1 - q * 0.8;
        });
        bot.ribbons.forEach((r, n) => {
          const feed = (n / 4 + (reduced || !e.alive ? 0 : time * 0.16)) % 1;
          // Notes ride over the rollers, then curl down over the delivery apron.
          r.position.y =
            (0.825 - Math.max(0, feed - 0.65) * 0.1) * (1 - q * 0.7) + bob;
          r.position.z = -0.22 + feed * 0.48;
          r.rotation.x = -Math.PI / 2 + Math.max(0, feed - 0.65) * 0.9;
          r.rotation.z = reduced ? 0.04 : Math.sin(time * 1.7 + n) * 0.045;
        });
        bot.lampMaterial.emissiveIntensity = e.alive ? 3 : 0;
        bot.workLamp.emissiveIntensity = e.alive ? 2.4 : 0;
        bot.glowColour.set(e.alive ? 0xffd59a : 0);
        bot.hot.emissiveIntensity = e.alive ? 1.6 : 0;
        for (let n = 0; n < 4; n++) {
          transform.position.set(
            n % 2 ? 0.37 : -0.37,
            0.128,
            n < 2 ? -0.26 : 0.26,
          );
          transform.rotation.set(bot.wheelAngle, 0, Math.PI / 2);
          transform.scale.setScalar(1);
          transform.updateMatrix();
          bot.wheels.setMatrixAt(n, transform.matrix);
          bot.hubs.setMatrixAt(n, transform.matrix);
          transform.rotation.set(bot.wheelAngle, 0, 0);
          transform.updateMatrix();
          bot.treads.setMatrixAt(n, transform.matrix);
        }
        bot.wheels.instanceMatrix.needsUpdate =
          bot.hubs.instanceMatrix.needsUpdate =
          bot.treads.instanceMatrix.needsUpdate =
            true;
      }
    },
  };
}
