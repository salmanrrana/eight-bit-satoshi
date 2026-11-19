import { batchMachines } from "./machines-batch.js";
import { createRigs } from "./machines-rig.js";
import { createEffects } from "./machines-fx.js";
import { createCableBatch } from "./machines-cables.js";

/** Snapshot-only presentation: the sim owns every actor, projectile and fire decision. */
export async function build(ctx) {
  const { T, scene, sim, assets, quality, kit } = ctx;
  let manifest = {};
  try {
    const r = await fetch("/assets/hash-wars/machines/manifest.json");
    if (r.ok) manifest = await r.json();
  } catch {
    /* Missing art keeps a scale-correct proxy. */
  }
  for (const def of Object.values(manifest.machines ?? {}))
    await assets.load("/assets/hash-wars/machines/" + def.file);
  const armsActive = !!scene.getObjectByName("Keeper pulse charge");
  const rigs = createRigs(ctx, manifest),
    fx = createEffects({ ...ctx, armsActive }, rigs.ground),
    root = new T.Group();
  root.name = "MACHINES";
  scene.add(root);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shieldGeo = new T.SphereGeometry(1, 24, 16),
    materials = [];
  const shieldBase = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
    uniforms: {
      impact: { value: new T.Vector3(0, 0, 1) },
      pulse: { value: 0 },
      broken: { value: 0 },
    },
    vertexShader: `varying vec3 vLocal;varying vec3 vNormal;varying vec3 vView;void main(){vLocal=normalize(position);vec4 p=modelViewMatrix*vec4(position,1.);vView=normalize(-p.xyz);vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 impact;uniform float pulse,broken;varying vec3 vLocal,vNormal,vView;
void main(){float d=length(vLocal-normalize(impact));float flarePatch=exp(-d*d*13.);float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),3.);float ring=exp(-pow((d-(1.-pulse)*1.7)*16.,2.));float a=pulse*(flarePatch*.52+rim*.12+ring*.3+broken*.15);gl_FragColor=vec4(.22,.8,1.,a);}`,
  });
  function shield(parent, r, height, centre) {
    const mat = shieldBase.clone();
    materials.push(mat);
    const mesh = new T.Mesh(shieldGeo, mat);
    mesh.scale.set(r * 1.35, height * 0.52, r * 1.65);
    mesh.position.y = centre;
    mesh.visible = false;
    parent.add(mesh);
    return { mesh, mat, age: 0, broken: 0 };
  }
  const pools = {},
    actors = [];
  for (const [kind, count] of Object.entries({
    gnat: 12,
    strider: 12,
    watcher: 6,
    bulwark: 4,
    turret: 2,
  })) {
    pools[kind] = [];
    for (let i = 0; i < count; i++) {
      const anchor = new T.Group(),
        near = rigs.make(kind),
        far = rigs.make(kind, true),
        spec = sim.MACHINES[kind];
      anchor.add(near.root, far.root);
      root.add(anchor);
      anchor.visible = false;
      const a = {
        kind,
        id: -1,
        anchor,
        near,
        far,
        rig: near,
        shield: shield(
          anchor,
          spec.r,
          spec.height,
          kind === "gnat" ? 0 : spec.centre,
        ),
        x: 0,
        z: 0,
        yaw: 0,
        turnVelocity: 0,
        vx: 0,
        vz: 0,
        speed: 0,
        ride: 0,
        roll: 0,
        pitch: 0,
        hit: 0,
        hp: spec.hp,
        shieldHP: spec.shield,
        dead: false,
        justDied: false,
        seen: false,
        step: 0,
        stepClock: 0,
        deathDelay: -1,
      };
      if (kind === "strider") {
        a.shield.mesh.scale.set(0.92, 0.68, 1.4);
        a.shield.mesh.position.y = 1.82;
      }
      actors.push(a);
      pools[kind].push(a);
    }
  }
  // Persistent break-aparts, flattened to independently simulated rigid meshes.
  const wrecks = [],
    supportCache = new Map();
  // Cache actual surface extremes: an empty bounding-box corner must not float a curved hull.
  function supports(geometry) {
    if (supportCache.has(geometry)) return supportCache.get(geometry);
    const p = geometry.attributes.position,
      points = new Float32Array(26 * 3);
    let cursor = 0;
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!(x || y || z)) continue;
          let best = -Infinity,
            index = 0;
          for (let i = 0; i < p.count; i++) {
            const dot = p.getX(i) * x + p.getY(i) * y + p.getZ(i) * z;
            if (dot > best) {
              best = dot;
              index = i;
            }
          }
          points[cursor++] = p.getX(index);
          points[cursor++] = p.getY(index);
          points[cursor++] = p.getZ(index);
        }
    supportCache.set(geometry, points);
    return points;
  }
  for (const kind of [...Object.keys(pools), "clamp"])
    for (
      let i = 0;
      i < (kind === "clamp" ? 3 : ["strider", "gnat"].includes(kind) ? 6 : 2);
      i++
    ) {
      const model = rigs.make(kind, true, i),
        group = new T.Group(),
        localMats = new Map();
      root.add(group);
      group.visible = false;
      const pieces = model.meshes.map((source) => {
        let sourceMat = Array.isArray(source.material)
          ? source.material[0]
          : source.material;
        if (!localMats.has(sourceMat)) {
          const m = sourceMat.clone();
          m.color.multiplyScalar(0.25);
          m.emissive?.set(0x140800);
          m.emissiveIntensity = 0.35;
          m.transparent = true;
          m.forceSinglePass = true;
          materials.push(m);
          localMats.set(sourceMat, m);
        }
        const mesh = new T.Mesh(source.geometry, localMats.get(sourceMat));
        group.add(mesh);
        mesh.castShadow =
          kind !== "gnat" &&
          (quality !== "low" || source.name.startsWith("body"));

        return {
          mesh,
          sourceName: source.name.replace(/_lod1(?=_|$)/g, ""),
          supports: supports(source.geometry),
          v: new T.Vector3(),
          spin: new T.Vector3(),
          rest: false,
        };
      });
      wrecks.push({
        kind,
        variant: i,
        group,
        pieces,
        materials: [...localMats.values()],
        age: 99,
        zone: 0,
        emission: 0,
        x: 0,
        y: 0,
        z: 0,
      });
    }
  let rng = 731;
  function random() {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  }
  const temp = new T.Vector3(),
    target = new T.Vector3(),
    rotation = new T.Matrix4(),
    up = new T.Vector3(0, 1, 0),
    direction = new T.Vector3();
  function explodeActor(a, e) {
    let w = null;
    for (const candidate of wrecks)
      if (
        candidate.kind === a.kind &&
        (a.kind !== "clamp" || candidate.variant === a.variant) &&
        (!w || candidate.age > w.age)
      )
        w = candidate;
    if (!w) return;
    w.age = 0;
    w.zone = e.zone;
    w.x = e.x;
    w.y = e.y + (a.kind === "gnat" ? sim.MACHINES.gnat.centre : 0.8);
    w.z = e.z;
    w.emission = 0;
    a.rig.root.updateMatrixWorld(true);
    for (const p of w.pieces) {
      const source = a.rig.nodes[p.sourceName];
      if (!source) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;
      source.matrixWorld.decompose(
        p.mesh.position,
        p.mesh.quaternion,
        p.mesh.scale,
      );
      p.v.set((random() - 0.5) * 4, 1.5 + random() * 3, (random() - 0.5) * 4);
      p.spin.set(
        (random() - 0.5) * 4,
        (random() - 0.5) * 4,
        (random() - 0.5) * 4,
      );
      p.rest = false;
    }
    for (const m of w.materials) m.opacity = 1;
    w.group.visible = true;
    fx.burst(
      w.x,
      w.y,
      w.z,
      a.kind === "bulwark" ? 2.3 : a.kind === "gnat" ? 0.45 : 1.1,
    );
  }
  function updateWrecks(frame) {
    const dt = frame.dt;
    for (const w of wrecks) {
      w.age += dt;
      w.group.visible =
        w.age < 24 &&
        !frame.snapshot.quiet &&
        Math.abs(w.zone - frame.snapshot.zone) <= 1;
      if (!w.group.visible) continue;
      for (const m of w.materials) m.opacity = Math.min(1, (24 - w.age) / 3);
      for (const p of w.pieces) {
        if (!p.mesh.visible || p.rest) continue;
        const m = p.mesh;
        p.v.y -= 9.8 * dt;
        m.position.addScaledVector(p.v, dt);
        m.rotateX(p.spin.x * dt);
        m.rotateY(p.spin.y * dt);
        m.rotateZ(p.spin.z * dt);
        rotation.makeRotationFromQuaternion(m.quaternion);
        const v = rotation.elements;
        let bottom = Infinity,
          touchX = 0,
          touchZ = 0;
        for (let i = 0; i < p.supports.length; i += 3) {
          const x = p.supports[i] * m.scale.x,
            y = p.supports[i + 1] * m.scale.y,
            z = p.supports[i + 2] * m.scale.z,
            py = v[1] * x + v[5] * y + v[9] * z;
          if (py < bottom) {
            bottom = py;
            touchX = v[0] * x + v[4] * y + v[8] * z;
            touchZ = v[2] * x + v[6] * y + v[10] * z;
          }
        }
        const floor = rigs.ground(
          m.position.x + touchX,
          m.position.z + touchZ,
          m.position.y + 1,
        );
        if (m.position.y + bottom < floor + 0.015) {
          m.position.y = floor - bottom + 0.015;
          p.v.y = Math.abs(p.v.y) * 0.22;
          p.v.x *= 0.6;
          p.v.z *= 0.6;
          p.spin.multiplyScalar(0.45);
          if (p.v.lengthSq() < 0.08 && p.spin.lengthSq() < 0.1) {
            p.rest = true;
            p.v.set(0, 0, 0);
          }
        }
      }
      w.emission += dt;
      if (w.age < 4 && w.emission > 0.09) {
        w.emission = 0;
        fx.emit(
          w.x,
          w.y + w.age * 0.15,
          w.z,
          1,
          0.65 + w.age * 0.15,
          2.2,
          0x424641,
          0.1,
          0.65,
          -0.08,
        );
        if (w.age < 1.5) {
          fx.emit(w.x, w.y, w.z, 0, 0.45, 0.3, 0xff9c35, 0, 0.8, 0);
          fx.emit(
            w.x,
            w.y,
            w.z,
            0,
            0.045,
            1,
            0xffba60,
            random() - 0.5,
            1.8,
            random() - 0.5,
            0.6,
          );
        }
      }
    }
  }
  function flare(s, at, broken = false) {
    s.age = 0.55;
    s.broken = broken ? 1 : 0;
    if (at) {
      temp.fromArray(at);
      s.mesh.updateWorldMatrix(true, false);
      s.mesh.worldToLocal(temp);
      s.mat.uniforms.impact.value.copy(temp).normalize();
    }
    if (broken) {
      s.mesh.getWorldPosition(temp);
      fx.emit(temp.x, temp.y, temp.z, 2, s.mesh.scale.y * 3, 0.65, 0x73eaff);
    }
  }
  function updateShield(s, dt, visible) {
    s.age = Math.max(0, s.age - dt);
    s.mesh.visible = visible && s.age > 0;
    s.mat.uniforms.pulse.value = s.age / 0.55;
    s.mat.uniforms.broken.value = s.broken;
  }
  function initActor(a, e) {
    a.id = e.id;
    a.x = e.x;
    a.z = e.z;
    a.yaw = e.yaw;
    a.vx = a.vz = a.speed = a.ride = a.roll = a.pitch = a.hit = 0;
    a.dead = e.hp <= 0;
    a.hp = e.hp;
    a.shieldHP = e.shield;
    a.step = 0;
    a.stepClock = 0.3;
    a.deathDelay = -1;
    a.shield.age = 0;
    a.shield.broken = 0;
    a.anchor.position.set(
      e.x,
      e.y + (a.kind === "gnat" ? sim.MACHINES.gnat.centre : 0),
      e.z,
    );
    a.anchor.rotation.set(0, e.yaw, 0);
    a.anchor.updateWorldMatrix(true, false);
    for (const rig of [a.near, a.far])
      for (const leg of rig.legs) {
        leg.planted.copy(leg.ankle).applyMatrix4(a.anchor.matrixWorld);
        leg.planted.y =
          rigs.ground(leg.planted.x, leg.planted.z, e.y + 0.4) + leg.sole;
        leg.target.copy(leg.planted);
        leg.progress = 1;
      }
  }
  function moveActor(a, e, frame) {
    const { dt, time, snapshot: s, camera } = frame,
      blend = 1 - Math.exp(-dt * 7),
      spec = sim.MACHINES[a.kind];
    const vx = dt ? (e.x - a.x) / dt : 0,
      vz = dt ? (e.z - a.z) / dt : 0;
    if (Math.hypot(e.x - a.x, e.z - a.z) > 4) initActor(a, e);
    a.vx += (vx - a.vx) * blend;
    a.vz += (vz - a.vz) * blend;
    a.speed += (Math.hypot(a.vx, a.vz) - a.speed) * blend;
    const turn = Math.atan2(Math.sin(e.yaw - a.yaw), Math.cos(e.yaw - a.yaw));
    const turnRate =
      a.kind === "bulwark"
        ? 0.32
        : a.kind === "watcher"
          ? 0.4
          : a.kind === "strider"
            ? 2.4
            : 3.5;
    const steering = Math.max(
      -turnRate * dt,
      Math.min(turnRate * dt, turn * (1 - Math.exp(-dt * 5))),
    );
    a.turnVelocity = dt ? steering / dt : 0;
    a.yaw += steering;
    const far =
        quality === "low" ||
        camera.position.distanceToSquared(a.anchor.position) > 35 * 35,
      rig = far ? a.far : a.near;
    if (a.rig !== rig) {
      for (let i = 0; i < rig.legs.length; i++) {
        const from = a.rig.legs[i],
          to = rig.legs[i];
        if (from) {
          to.planted.copy(from.planted);
          to.target.copy(from.target);
          to.start.copy(from.start);
          to.end.copy(from.end);
          to.progress = from.progress;
        }
      }
      a.rig = rig;
    }
    a.near.root.visible = !far;
    a.far.root.visible = far;
    let ride = 0;
    if (a.kind === "gnat") {
      a.pitch +=
        ((a.vx * Math.sin(a.yaw) + a.vz * Math.cos(a.yaw)) * 0.06 - a.pitch) *
        blend;
      a.roll +=
        ((a.vx * Math.cos(a.yaw) - a.vz * Math.sin(a.yaw)) * -0.1 -
          turn * 0.18 -
          a.roll) *
        blend;
      ride = reduced
        ? 0
        : Math.sin(time * 3.3 + e.id) * 0.085 +
          Math.sin(time * 1.7 + e.id) * 0.035;
    } else {
      const span = a.kind === "bulwark" ? 1.15 : 0.45,
        c = Math.cos(a.yaw),
        sn = Math.sin(a.yaw);
      const front = rigs.ground(e.x + sn * span, e.z + c * span, e.y + 0.5),
        back = rigs.ground(e.x - sn * span, e.z - c * span, e.y + 0.5);
      const left = rigs.ground(e.x + c * span, e.z - sn * span, e.y + 0.5),
        right = rigs.ground(e.x - c * span, e.z + sn * span, e.y + 0.5);
      a.pitch +=
        (Math.max(-0.2, Math.min(0.2, (back - front) / (span * 2))) - a.pitch) *
        blend;
      a.roll +=
        (Math.max(
          -0.16,
          Math.min(0.16, (left - right) / (span * 2) + turn * -0.08),
        ) -
          a.roll) *
        blend;
      ride = -0.065 + (front + back + left + right) * 0.25 - e.y;
      // A yielding suspension follows the loaded foot rather than a clock-driven bob.
      for (const leg of rig.legs)
        if (leg.progress < 1)
          ride -=
            Math.sin(leg.progress * Math.PI) *
            (a.kind === "bulwark" ? 0.035 : 0.025);
    }
    a.ride +=
      (ride - a.ride) * (1 - Math.exp(-dt * (a.kind === "bulwark" ? 3 : 7)));
    a.anchor.position.set(
      e.x,
      e.y + (a.kind === "gnat" ? spec.centre : 0) + a.ride,
      e.z,
    );
    if (a.kind === "gnat" && !reduced) {
      a.anchor.position.x += Math.sin(time * 2.4 + e.id) * 0.075;
      a.anchor.position.z += Math.cos(time * 2.1 + e.id) * 0.055;
    }
    a.anchor.rotation.set(
      a.pitch,
      a.yaw,
      a.roll +
        (a.kind === "gnat" && !reduced
          ? Math.sin(time * 2.4 + e.id) * 0.07
          : 0),
      "YXZ",
    );
    if (rig.nodes.body && rig.restBody) {
      rig.nodes.body.position.copy(rig.restBody);
      rig.nodes.body.position.z -= e.hit * 0.07;
      rig.nodes.body.rotation.x = -e.hit * 0.045;
    }
    a.anchor.updateWorldMatrix(true, false);
    a.stepClock += dt;
    let stepping = false;
    for (const leg of rig.legs) if (leg.progress < 1) stepping = true;
    let candidate = -1,
      worst = 0;
    for (let i = 0; i < rig.legs.length; i++) {
      const leg = rig.legs[i];
      temp.copy(leg.ankle).applyMatrix4(a.anchor.matrixWorld);
      const error = Math.hypot(temp.x - leg.planted.x, temp.z - leg.planted.z);
      if (error > worst) {
        worst = error;
        candidate = i;
      }
    }
    const threshold =
      a.kind === "bulwark" ? 0.3 : a.kind === "watcher" ? 0.4 : 0.28;
    if (
      !stepping &&
      candidate >= 0 &&
      worst > threshold &&
      a.stepClock > (a.kind === "bulwark" ? 0.12 : 0.02)
    ) {
      for (let i = 0; i < rig.legs.length; i++) {
        // The heavy diagonal pair unloads together; the other pair carries the hull.
        if (i !== candidate && !(a.kind === "bulwark" && i === 3 - candidate))
          continue;
        const leg = rig.legs[i];
        leg.start.copy(leg.planted);
        leg.end
          .copy(leg.ankle)
          .applyAxisAngle(
            up,
            a.turnVelocity *
              (a.kind === "bulwark"
                ? 0.65
                : a.kind === "watcher"
                  ? 0.65
                  : 0.28),
          )
          .applyMatrix4(a.anchor.matrixWorld);
        const lead = a.kind === "bulwark" ? 0.65 : 0.38;
        leg.end.x += a.vx * lead;
        leg.end.z += a.vz * lead;
        leg.end.y = rigs.ground(leg.end.x, leg.end.z, e.y + 0.5) + leg.sole;
        leg.progress = 0;
      }
      a.stepClock = 0;
    }
    for (const leg of rig.legs) {
      if (leg.progress < 1) {
        leg.progress = Math.min(
          1,
          leg.progress +
            dt /
              (a.kind === "bulwark" ? 0.48 : a.kind === "watcher" ? 0.6 : 0.28),
        );
        const t = leg.progress,
          smooth = t * t * (3 - 2 * t);
        leg.target.lerpVectors(leg.start, leg.end, smooth);
        leg.target.y +=
          Math.sin(t * Math.PI) * (a.kind === "bulwark" ? 0.19 : 0.24);
        // Clear rises in the terrain throughout a step, not just at its endpoint.
        leg.target.y = Math.max(
          leg.target.y,
          rigs.ground(leg.target.x, leg.target.z, e.y + 0.5) + leg.sole,
        );
        if (t === 1) {
          leg.planted.copy(leg.end);
          fx.emit(
            leg.end.x,
            leg.end.y - leg.sole + 0.04,
            leg.end.z,
            1,
            a.kind === "bulwark" ? 0.4 : 0.17,
            0.6,
            0x9b9784,
            0,
            0.12,
            0,
          );
        }
      } else leg.target.copy(leg.planted);
      const x = leg.target.x,
        z = leg.target.z,
        y = leg.target.y + 0.35;
      leg.normal
        .set(
          rigs.ground(x - 0.12, z, y) - rigs.ground(x + 0.12, z, y),
          0.24,
          rigs.ground(x, z - 0.12, y) - rigs.ground(x, z + 0.12, y),
        )
        .normalize();
      leg.target.x += leg.normal.x * leg.sole;
      leg.target.z += leg.normal.z * leg.sole;
      leg.target.y += (leg.normal.y - 1) * leg.sole;
    }
    rigs.solve(rig, a.yaw);
    const aim = e.charge > 0 ? e.aim : s.player;
    if (rig.nodes.head) {
      const yaw = Math.atan2(aim.x - e.x, aim.z - e.z) - a.yaw;
      rig.nodes.head.rotation.y = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    }
    if (rig.nodes.gun) {
      rig.nodes.gun.getWorldPosition(temp);
      const pitch = Math.atan2(
        aim.y + (e.charge > 0 ? 0 : 1) - temp.y,
        Math.max(0.5, Math.hypot(aim.x - temp.x, aim.z - temp.z)),
      );
      rig.nodes.gun.rotation.x =
        (rig.restGun?.x ?? 0) -
        (a.kind === "bulwark" ? e.charge * 0.65 : pitch * 0.8);
      const yaw = Math.atan2(aim.x - e.x, aim.z - e.z) - a.yaw;
      const swivel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      rig.nodes.gun.rotation.y = rig.nodes.head
        ? 0
        : a.kind === "bulwark" || a.kind === "turret"
          ? swivel
          : Math.max(-1.2, Math.min(1.2, swivel));
    }
    for (const glow of rig.emit) {
      glow.material.emissiveIntensity =
        glow.channel === "heat"
          ? 0.5 + (1 - e.hp / spec.hp) * 4
          : glow.channel === "engine"
            ? 2 + a.speed * 0.3
            : 1.2 + e.charge * 4;
    }
    for (let i = 0; i < 4; i++) {
      const thruster = rig.nodes["thruster_" + i];
      if (thruster) thruster.rotation.x = -a.pitch * 2;
    }
    if (a.kind !== "watcher" && e.charge > 0) {
      // Every shot is telegraphed: the muzzle swells and brightens through the
      // sim's warning, never smaller than a few pixels at range.
      (rig.nodes.muzzle ?? rig.nodes.gun ?? rig.root).getWorldPosition(temp);
      const px = temp.distanceTo(camera.position) * 0.00095;
      const glow = Math.max(0.12 + e.charge * 0.35, px * (4 + e.charge * 8));
      const hot = a.kind === "bulwark" ? 0xffb35a : 0x9df3ff;
      fx.put(
        temp.x,
        temp.y,
        temp.z,
        glow,
        glow,
        hot,
        0.35 + e.charge * 0.6,
        0,
        camera,
        null,
        null,
        2.5,
      );
      fx.put(
        temp.x,
        temp.y,
        temp.z,
        glow * 0.35,
        glow * 0.35,
        0xffffff,
        0.5 + e.charge * 0.5,
        0,
        camera,
        null,
        null,
        3,
      );
    }
    if (a.kind === "watcher" && e.charge > 0) {
      // Bright cyan aim line, at least ~3 px wide at any range, brightening as
      // the shot builds; a hot dot where it ends.
      (rig.nodes.muzzle ?? rig.nodes.gun ?? rig.root).getWorldPosition(temp);
      target.set(e.aim.x, e.aim.y, e.aim.z);
      fx.beam(
        temp,
        target,
        0x8ff2ff,
        0.45 + e.charge * 0.5,
        camera,
        2.5 + e.charge * 1.5,
      );
      const lens = Math.max(
        0.35 + e.charge * 0.4,
        temp.distanceTo(camera.position) * 0.00095 * (6 + e.charge * 6),
      );
      fx.put(
        temp.x,
        temp.y,
        temp.z,
        lens,
        lens,
        0xbff8ff,
        0.6 + e.charge * 0.4,
        0,
        camera,
        null,
        null,
        3,
      );
    }
    if (e.shield < a.shieldHP) flare(a.shield, null);
    if (e.hit > a.hit + 0.15) {
      (rig.nodes.sensor ?? rig.root).getWorldPosition(temp);
      fx.emit(temp.x, temp.y, temp.z, 0, 0.35, 0.15, 0xb5efff);
    }
    updateShield(a.shield, dt, true);
    a.x = e.x;
    a.z = e.z;
    a.hit = e.hit;
    a.hp = e.hp;
    a.shieldHP = e.shield;
  }
  function setPiece(kind, index = 0) {
    const near = rigs.make(kind, false, index),
      far = rigs.make(kind, true, index),
      group = new T.Group();
    group.name = "Cartel " + kind;
    group.add(near.root, far.root);
    root.add(group);
    return { root: group, near, far, nodes: near.nodes, emit: near.emit };
  }
  function pieceLOD(piece, camera) {
    const far =
      quality === "low" ||
      camera.position.distanceToSquared(piece.root.position) > 1225;
    piece.near.root.visible = !far;
    piece.far.root.visible = far;
    piece.nodes = far ? piece.far.nodes : piece.near.nodes;
    piece.emit = far ? piece.far.emit : piece.near.emit;
  }
  const hauler = setPiece("hauler"),
    siege = setPiece("siege");
  const doorsByName = [
    ["bay_l", 1],
    ["bay_r", -1],
    ["door_l", 1],
    ["door_r", -1],
    ["bay_door_0", -1],
    ["bay_door_1", 1],
  ];
  for (const rig of [siege.near, siege.far]) {
    for (let i = 0; i < 3; i++)
      if (rig.nodes["clamp_" + i]) rig.nodes["clamp_" + i].visible = false;
    for (let i = 0; i < 2; i++)
      if (rig.nodes["turret_" + i]) rig.nodes["turret_" + i].visible = false;
  }
  const hull = sim.layout.find((s) => s.kind === "siege-hull");
  if (hull) ctx.claimSolid?.(hull); // Sim envelope now matches the vertical crawler body.
  const clamps = sim.entities.clamps.map((e, i) => {
    const rig = setPiece("clamp", i);
    rig.root.position.set(e.x, e.y, e.z);
    return {
      rig,
      breakActor: { kind: "clamp", rig, variant: i },
      death: { x: e.x, y: e.y, z: e.z, zone: 4 },
      shield: shield(rig.root, 1.1, 1.9, 0),
      hp: 180,
      shieldHP: 80,
      alive: true,
      breakAge: 99,
    };
  });
  const cableGeo = new T.CylinderGeometry(0.075, 0.075, 1, 6, 1),
    cableMat = kit.material({
      color: 0x193d45,
      emissive: 0x45bccb,
      emissiveIntensity: 0.6,
      roughness: 0.5,
      metalness: 0.7,
    });
  const cables = Array.from({ length: 18 }, () => {
    const m = new T.Mesh(cableGeo, cableMat);
    return m;
  });
  const cableBatch = createCableBatch(T, cableGeo, cableMat, cables.length);
  root.add(cableBatch.mesh);
  const cableEnd = new T.Vector3();
  const cableJaws = sim.entities.clamps.map((e, i) => {
    const node = manifest.machines?.siege?.nodes.find(
      (n) => n.name === "clamp_" + i + "_jaw",
    );
    return node ? new T.Vector3(...node.pivot) : new T.Vector3(0, 3 + i * 3, 0);
  });
  const tetherGeo = new T.CylinderGeometry(0.016, 0.016, 1, 4),
    tetherMat = kit.material({ color: 0x273439, roughness: 0.65 });
  const passengers = Array.from({ length: 5 }, (_, i) => {
    const rig = rigs.make(
        sim.entities.spawns.find((e) => e.id === 21 + i)?.kind ?? "strider",
        true,
      ),
      line = new T.Mesh(tetherGeo, tetherMat);
    root.add(rig.root, line);
    return { rig, line };
  });
  let lastDying = 0,
    landedAge = 0,
    wreckSmoke = 0,
    haulerDust = 0,
    lastTime = -1;
  const placement = manifest.machines?.siege?.extra?.placement?.world;
  const bossPosition = placement
    ? new T.Vector3(placement.x, placement.y, placement.z)
    : new T.Vector3(17, sim.groundY(17, -373), -373);
  function link(mesh, a, b, width = 1) {
    direction.subVectors(b, a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, direction.length(), width);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  function updateSetPieces(frame) {
    const { snapshot: s, dt, time, camera } = frame,
      dying = s.boss.dying;

    // The attached crawler is a station landmark, including quiet scenery views.
    // After the fall it stays where the sim's pose put it, as a smoking wreck.
    siege.root.visible = s.zone >= 3;
    const pose = s.boss.pose;
    if (pose) siege.root.position.set(pose.x, pose.y, pose.z);
    else siege.root.position.copy(bossPosition);
    siege.root.rotation.set(0, 0, pose?.roll ?? 0);
    landedAge = dying >= 1 ? landedAge + dt : 0;
    if (dying >= 1) {
      // Settles into the ground over ~1.5 s with a small sag and roll.
      const settle = 1 - Math.exp(-landedAge * 2.2);
      siege.root.position.y -= 0.35 * settle;
      siege.root.rotation.z += 0.035 * settle;
    }
    pieceLOD(siege, camera);
    wreckSmoke += dt;
    const smokeEvery = quality === "low" ? 0.3 : 0.12;
    if (
      dying > 0.25 &&
      s.zone >= 4 &&
      !s.quiet &&
      wreckSmoke > smokeEvery &&
      camera.position.distanceToSquared(siege.root.position) < 160 * 160
    ) {
      wreckSmoke = 0;
      siege.root.updateMatrixWorld(true);
      for (let i = 0; i < 3; i++) {
        const socket = siege.nodes["clamp_" + i + "_jaw"];
        if (!socket) continue;
        socket.getWorldPosition(temp);
        // A column of black smoke from each torn clamp socket, embers in it.
        fx.emit(
          temp.x + (random() - 0.5) * 0.8,
          temp.y + 0.5,
          temp.z + (random() - 0.5) * 0.8,
          1,
          2 + random() * 0.8,
          quality === "low" ? 3.5 : 5,
          0x2f302d,
          0.3 + (random() - 0.5) * 0.4,
          1.1 + random() * 0.5,
          (random() - 0.5) * 0.4,
          -0.05,
        );
        if (random() < 0.6)
          fx.emit(
            temp.x + random() - 0.5,
            temp.y + 0.3,
            temp.z + random() - 0.5,
            0,
            0.05,
            1.4 + random(),
            0xffa040,
            (random() - 0.5) * 0.8,
            2.2 + random() * 1.5,
            (random() - 0.5) * 0.8,
            0.4,
          );
      }
    }
    let brokenCount = 0;
    for (const c of s.boss.clamps) if (!c.alive) brokenCount++;
    siege.root.rotation.z +=
      Math.sin(brokenCount * 1.9) * brokenCount * 0.025 * (1 - dying);
    for (let i = 0; i < clamps.length; i++) {
      const c = clamps[i],
        state = s.boss.clamps[i],
        e = sim.entities.clamps[i];
      pieceLOD(c.rig, camera);
      if (c.alive && !state.alive) {
        c.breakAge = 0;
        explodeActor(c.breakActor, c.death);
      }
      c.breakAge += dt;
      c.rig.root.visible = s.zone >= 3 && state.alive;
      c.rig.root.position.set(
        e.x + (state.alive ? 0 : c.breakAge * 0.8),
        e.y - (state.alive ? 0 : c.breakAge * c.breakAge * 4),
        e.z,
      );
      c.rig.root.rotation.z = state.alive ? 0 : c.breakAge * 2;
      pieceLOD(c.rig, camera);
      if (state.shield < c.shieldHP) flare(c.shield, null, state.shield <= 0);
      updateShield(c.shield, dt, c.rig.root.visible && state.alive);
      for (const glow of c.rig.emit)
        glow.material.emissiveIntensity = state.alive
          ? 1 + (1 - state.hp / 180) * 3
          : 0;
      const jaw = c.rig.nodes["clamp_0_jaw"];
      if (jaw) jaw.rotation.y = state.alive ? (state.shield > 0 ? 0 : 0.06) : 0;
      c.alive = state.alive;
      c.shieldHP = state.shield;
      c.hp = state.hp;
      for (let j = 0; j < 6; j++) {
        const m = cables[i * 6 + j],
          segments = quality === "low" ? 3 : 6;
        m.visible = j < segments && s.zone >= 3 && state.alive && dying < 0.9;
        if (j >= segments) continue;
        const t0 = j / segments,
          t1 = (j + 1) / segments;
        cableEnd
          .copy(cableJaws[i])
          .applyEuler(siege.root.rotation)
          .add(siege.root.position);
        temp.set(
          e.x + (cableEnd.x - e.x) * t0,
          e.y +
            0.3 +
            (cableEnd.y - e.y - 0.3) * t0 -
            Math.sin(t0 * Math.PI) * 0.7,
          e.z + (cableEnd.z - e.z) * t0,
        );
        target.set(
          e.x + (cableEnd.x - e.x) * t1,
          e.y +
            0.3 +
            (cableEnd.y - e.y - 0.3) * t1 -
            Math.sin(t1 * Math.PI) * 0.7,
          e.z + (cableEnd.z - e.z) * t1,
        );
        if (dying) {
          temp.y -= dying * dying * 5 * (1 - t0);
          target.y -= dying * dying * 5 * (1 - t1);
          temp.x += Math.sin(time * 8 + j) * dying * 2;
          target.x += Math.sin(time * 8 + j + 1) * dying * 2;
        }
        link(m, temp, target, 0.85 + 0.15 * Math.sin(time * 3 - j));
      }
      if (c.rig.root.visible && state.alive && dying < 0.9) {
        // A slow packet travels into the spire using the already-warm effects batch.
        const t = (time * 0.38 + i * 0.31) % 1;
        temp.set(
          e.x + (cableEnd.x - e.x) * t,
          e.y +
            0.3 +
            (cableEnd.y - e.y - 0.3) * t -
            Math.sin(t * Math.PI) * 0.7,
          e.z + (cableEnd.z - e.z) * t,
        );
        direction.set(cableEnd.x - e.x, cableEnd.y - e.y, cableEnd.z - e.z);
        fx.put(
          temp.x,
          temp.y,
          temp.z,
          0.18,
          0.8,
          0xb1f7ff,
          0.75,
          4,
          camera,
          direction,
        );
        fx.put(temp.x, temp.y, temp.z, 0.5, 0.5, 0x61e6ff, 0.2, 0, camera);
      }
    }
    cableBatch.update(cables);
    cableMat.emissiveIntensity = 0.6 + 0.35 * Math.sin(time * 2);
    if (lastDying < 1 && dying >= 1)
      fx.burst(
        sim.siege.landing.x,
        sim.siege.landing.y - 2.32,
        sim.siege.landing.z,
        6,
        true,
      );
    lastDying = dying;
    const h = s.hauler;
    hauler.root.visible = !!h && !s.quiet;
    for (const p of passengers) {
      p.rig.root.visible = false;
      p.line.visible = false;
    }
    if (!h) return;
    hauler.root.position.set(h.x, h.y, h.z);
    hauler.root.rotation.set(0, h.yaw, Math.sin(h.phase * Math.PI * 2) * 0.055);
    pieceLOD(hauler, camera);
    const doors =
      Math.max(0, Math.min(1, (h.phase - 0.16) * 10)) *
      Math.max(0, Math.min(1, (0.75 - h.phase) * 8));
    for (const [key, sign] of doorsByName)
      if (hauler.nodes[key]) hauler.nodes[key].rotation.z = doors * sign * 1.3;
    for (const glow of hauler.emit)
      glow.material.emissiveIntensity = glow.channel === "engine" ? 2.4 : 1.6;
    for (let i = 0; i < 4; i++)
      if (hauler.nodes["thruster_" + i])
        hauler.nodes["thruster_" + i].rotation.x =
          Math.sin(h.phase * Math.PI) * 0.22;
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i],
        e = s.enemies.find((e) => e.id === 21 + i);
      if (!e || e.hp <= 0 || e.deployed !== false || h.phase < 0.2) continue;
      const t = h.descent ?? Math.max(0, Math.min(1, (h.phase - 0.24) / 0.16));
      const bay = hauler.nodes.bay_release;
      if (bay) bay.getWorldPosition(temp);
      else temp.set(h.x, h.y - 1, h.z);
      direction.set(0, 0, (i - 2) * 1.6).applyEuler(hauler.root.rotation);
      temp.add(direction);
      p.rig.root.position.set(
        temp.x + (e.x - temp.x) * t,
        temp.y +
          (e.y + (e.kind === "gnat" ? sim.MACHINES.gnat.centre : 0) - temp.y) *
            t,
        temp.z + (e.z - temp.z) * t,
      );
      p.rig.root.visible = !s.quiet;
      target
        .copy(p.rig.root.position)
        .addScaledVector(up, e.kind === "gnat" ? 0.12 : 2.15);
      link(p.line, temp, target);
      p.line.visible = !s.quiet;
    }
    haulerDust += dt;
    if (haulerDust > 0.08 && !s.quiet) {
      haulerDust = 0;
      // Four separated outflows roll away from the actual nacelle footprint.
      const hoverStrength = Math.max(0, 1 - Math.max(0, h.phase - 0.58) * 4);
      for (let i = 0; i < 4; i++) {
        const nozzle = hauler.nodes["thruster_" + i];
        if (!nozzle) continue;
        nozzle.getWorldPosition(temp);
        const y = rigs.ground(temp.x, temp.z, h.y),
          dx = temp.x - h.x,
          dz = temp.z - h.z;
        fx.emit(
          temp.x,
          y + 0.45,
          temp.z,
          1,
          2.6 * hoverStrength,
          2.8,
          0xbab4a2,
          dx * 0.65 + random() - 0.5,
          0.45 + random() * 0.5,
          dz * 0.65 + random() - 0.5,
        );
      }
    }
    for (let i = 0; i < 4; i++) {
      const nozzle = hauler.nodes["thruster_" + i];
      if (!nozzle) continue;
      nozzle.getWorldPosition(temp);
      fx.put(temp.x, temp.y - 0.6, temp.z, 0.9, 1.6, 0x6de9ff, 0.25, 0, camera);
    }
  }
  const batches = batchMachines(T, root, [
    ...actors,
    hauler,
    siege,
    ...clamps.map((c) => c.rig),
    ...passengers.map((p) => ({ near: p.rig, far: { meshes: [] } })),
    ...wrecks.map((w) => ({
      near: { meshes: w.pieces.map((p) => p.mesh) },
      far: { meshes: [] },
    })),
  ]);
  return {
    update(frame) {
      const { snapshot: s, events } = frame;
      // Reset presentation state after restarting/checkpoint rewinds, without allocating.
      if (s.time < lastTime - 0.1) {
        for (const a of actors) a.id = -1;
        for (const w of wrecks) w.age = 99;
        for (const c of clamps) {
          c.alive = true;
          c.shield.age = 0;
        }
        fx.reset();
        lastDying = 0;
      }
      lastTime = s.time;
      fx.begin(frame);
      for (const a of actors) {
        a.seen = false;
        a.justDied = false;
        a.anchor.visible = false;
      }
      // When the sim kills a crowd in one update (the boss's fall), break them up
      // over about a second instead of all wrecks swapping in on one frame.
      let newlyDead = 0;
      for (const e of s.enemies)
        if (e.hp <= 0)
          for (const slot of pools[e.kind] ?? [])
            if (slot.id === e.id && !slot.dead && slot.deathDelay < 0)
              newlyDead++;
      let wave = 0;
      for (const e of s.enemies) {
        if (s.quiet || e.deployed === false || Math.abs(e.zone - s.zone) > 1)
          continue;
        let a = null;
        for (const slot of pools[e.kind] ?? [])
          if (slot.id === e.id) {
            a = slot;
            break;
          }
        if (!a && e.hp > 0) {
          for (const slot of pools[e.kind] ?? [])
            if (slot.id === -1 || slot.dead) {
              a = slot;
              initActor(a, e);
              break;
            }
        }
        if (!a) continue;
        a.seen = true;
        if (e.hp <= 0) {
          if (!a.dead) {
            if (a.deathDelay < 0)
              a.deathDelay =
                newlyDead > 2 ? wave++ * 0.08 + random() * 0.22 : 0;
            a.deathDelay -= frame.dt;
            if (a.deathDelay > 0) {
              // Still standing for a moment: frozen, sparking from the sensor.
              a.anchor.visible = true;
              if (random() < 0.25) {
                (a.rig.nodes.sensor ?? a.rig.root).getWorldPosition(temp);
                fx.emit(
                  temp.x,
                  temp.y,
                  temp.z,
                  0,
                  0.05,
                  0.5,
                  0xffc070,
                  random() - 0.5,
                  1.5 + random(),
                  random() - 0.5,
                  8,
                );
              }
              continue;
            }
            explodeActor(a, e);
            a.justDied = true;
            a.dead = true;
          }
          continue;
        }
        if (a.dead) initActor(a, e);
        a.anchor.visible = true;
        moveActor(a, e, frame);
      }
      for (const a of actors) if (!a.seen) a.id = -1;
      for (const event of events) {
        if (
          event.type === "shield-break" &&
          event.enemy == null &&
          event.index != null
        ) {
          const c = clamps[event.index];
          if (c) flare(c.shield, null, true);
        }
        if (event.type === "shield-break" && event.enemy != null) {
          const a = actors.find((a) => a.id === event.enemy);
          if (a) flare(a.shield, null, true);
        }
        if (event.type === "shot" && event.enemy != null) {
          const a = actors.find((a) => a.id === event.enemy);
          if (a && event.hit === "shield") flare(a.shield, event.to);
          if (!armsActive && a && ["enemy", "weak"].includes(event.hit))
            fx.impact(event.to, event.hit, event.normal);
        }
        if (
          event.type === "shot" &&
          event.enemy == null &&
          (event.hit === "shield" || event.hit === "weak")
        ) {
          let nearest = null,
            distance = Infinity;
          for (let i = 0; i < clamps.length; i++) {
            const e = sim.entities.clamps[i],
              d =
                (e.x - event.to[0]) ** 2 +
                (e.y - event.to[1]) ** 2 +
                (e.z - event.to[2]) ** 2;
            if (d < distance) {
              distance = d;
              nearest = clamps[i];
            }
          }
          if (nearest && event.hit === "shield")
            flare(nearest.shield, event.to);
          if (!armsActive && nearest && event.hit === "weak")
            fx.impact(event.to, "weak", event.normal);
        }
        if (event.type === "bolt-hit")
          fx.impact(event.at, event.hit, event.normal);
        let deathBurst = false;
        if (event.type === "explode" && event.kind === "bulwark")
          for (const a of actors)
            if (
              a.justDied &&
              a.kind === event.kind &&
              (a.x - event.at[0]) ** 2 + (a.z - event.at[2]) ** 2 < 0.09
            )
              deathBurst = true;
        if (
          event.type === "explode" &&
          !deathBurst &&
          ["bulwark", "charge"].includes(event.kind)
        )
          fx.burst(
            event.at[0],
            event.at[1],
            event.at[2],
            event.kind === "bulwark" ? 2 : 1.7,
            true,
            event.kind !== "charge" || !armsActive,
          );
      }
      updateSetPieces(frame);
      updateWrecks(frame);
      fx.end(frame);
      batches.update();
      // No new lights: light.js consumes the sim's explode events for its blast slot.
    },
    dispose() {
      root.removeFromParent();
      batches.dispose();
      rigs.dispose();
      fx.dispose();
      shieldGeo.dispose();
      shieldBase.dispose();
      cableBatch.dispose();
      cableGeo.dispose();
      tetherGeo.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}
