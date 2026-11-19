import { createRigs, reloadRig } from "./arms-rig.js";
import { createEffects } from "./arms-fx.js";

import { createImpacts } from "./arms-impacts.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** First-person presentation only. Every fire/hit/projectile decision belongs to the sim. */
export async function build(ctx) {
  const { T, kit, viewGroup, scene, sim } = ctx;
  const rigs = await createRigs(ctx),
    fx = createEffects(ctx),
    impacts = createImpacts(ctx),
    rigList = Object.values(rigs.rigs);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const muzzle = new T.Vector3(),
    worldMuzzle = new T.Vector3(),
    ejectPoint = new T.Vector3(),
    localInverse = new T.Matrix4(),
    shadeOrigin = new T.Vector3(),
    ventPoint = new T.Vector3(),
    cellPoint = new T.Vector3();
  // Renderer-owned fixed lights can follow these live, camera-correct muzzle points.
  viewGroup.userData.hwArmsMuzzleLocal = muzzle;
  viewGroup.userData.hwArmsMuzzleWorld = worldMuzzle;
  const pulseBody = kit.material({
      color: 0x343d3d,
      metalness: 0.65,
      roughness: 0.45,
    }),
    pulseGlow = kit.material({
      color: 0xffa12e,
      emissive: 0xff9c28,
      emissiveIntensity: 1.2,
    });
  const pulses = Array.from({ length: 4 }, () => {
    const root = new T.Group();
    root.name = "Keeper pulse charge";
    const body = kit.box(0.13, 0.1, 0.18, pulseBody, 0.025);
    body.receiveShadow = true;
    root.add(body);
    const band = kit.box(0.139, 0.027, 0.13, pulseGlow, 0.008);
    band.receiveShadow = true;
    root.add(band);
    scene.add(root);
    root.visible = false;
    return { root, band };
  });
  let current = "carbine",
    previous = null,
    lastTime = -1,
    lastYaw = 0,
    lastPitch = 0,
    swayX = 0,
    swayY = 0,
    bob = 0,
    landing = 0,
    landVelocity = 0,
    grounded = true,
    downSpeed = 0,
    sprint = 0,
    throwAge = 2,
    lastCharges = -1,
    ventClock = 0,
    lastReload = 0,
    shadeClock = 1,
    shadeDirect = 1,
    shadeSky = 1,
    aimReturn = 1;
  // A cheap authoritative ray test, cached between frames. No shadow map or new light.
  const solidBounds = sim.layout.map((b) =>
    b.shape === "cyl"
      ? { min: [b.x - b.r, b.y0, b.z - b.r], max: [b.x + b.r, b.y1, b.z + b.r] }
      : b,
  );
  function sunBlocked(p, sun) {
    for (let i = 0; i < 7; i++) {
      const d = 0.7 * 2 ** i;
      if (sim.groundY(p.x + sun.x * d, p.z + sun.z * d) > p.y + sun.y * d)
        return true;
    }
    for (const b of solidBounds) {
      let lo = 0.08,
        hi = 60;
      for (let i = 0; i < 3; i++) {
        const o = i === 0 ? p.x : i === 1 ? p.y : p.z,
          d = i === 0 ? sun.x : i === 1 ? sun.y : sun.z;
        if (Math.abs(d) < 0.00001) {
          if (o < b.min[i] || o > b.max[i]) {
            hi = -1;
            break;
          }
        } else {
          const a = (b.min[i] - o) / d,
            c = (b.max[i] - o) / d;
          lo = Math.max(lo, Math.min(a, c));
          hi = Math.min(hi, Math.max(a, c));
        }
      }
      if (hi >= lo) return true;
    }
    return false;
  }
  // The view pass has its own lens. Map its muzzle onto the world camera's
  // matching screen ray so smoke, brass and traces join the rendered barrel.
  function toWorld(point, camera) {
    const ratio =
      Math.tan((camera.fov * Math.PI) / 360) /
      Math.tan((viewGroup.parent.fov * Math.PI) / 360);
    point.x *= ratio;
    point.y *= ratio;
    point.applyMatrix4(camera.matrixWorld);
  }
  let respawning = false;
  function nodeLocal(node, target, fallback) {
    if (node) {
      node.getWorldPosition(target);
      target.applyMatrix4(localInverse);
    } else target.copy(fallback);
  }
  return {
    update(frame) {
      const { snapshot: s, events, dt, time, camera, env } = frame,
        w = s.weapon,
        p = s.player;
      const reset = s.time < lastTime || (s.respawn > 0 && !respawning);
      respawning = s.respawn > 0;
      if (reset) {
        current = w.kind;
        previous = null;
        landing = landVelocity = swayX = swayY = 0;
        lastYaw = p.yaw;
        lastPitch = p.pitch;
        lastCharges = s.charges;
        lastReload = 0;
        sprint = bob = 0;
        grounded = p.grounded;
        downSpeed = 0;
        throwAge = 2;
        ventClock = 0;
        shadeClock = 1;
        aimReturn = 1;
        fx.reset();
        impacts.reset();
      }
      lastTime = s.time;
      if (current !== w.kind) {
        previous = current;
        current = w.kind;
        lastReload = 0;
        aimReturn = 1;
      }
      const pose = s.pose,
        aim = pose === "aim" ? 1 : w.aim,
        reload = pose === "reload-mid" ? 0.5 : w.reload;
      if (reload > 0) aimReturn = 0;
      else aimReturn = Math.min(1, aimReturn + dt * 5);
      // Held aim returns through the shoulder after a reload instead of snapping.
      const displayAim =
        aim * (reload > 0 ? 1 - ease(reload / 0.08) : ease(aimReturn));
      const noMotion = reduced.matches,
        blend = 1 - Math.exp(-dt * 10),
        speed = Math.hypot(p.vx, p.vz);
      const motionDt = Math.max(1 / 240, dt);
      const yawDelta = Math.atan2(
        Math.sin(p.yaw - lastYaw),
        Math.cos(p.yaw - lastYaw),
      );
      swayX +=
        (clamp((yawDelta / motionDt) * 0.012, -0.025, 0.025) - swayX) * blend;
      swayY +=
        (clamp((-(p.pitch - lastPitch) / motionDt) * 0.009, -0.018, 0.018) -
          swayY) *
        blend;
      lastYaw = p.yaw;
      lastPitch = p.pitch;
      if (!grounded && p.grounded)
        landVelocity -= Math.min(1, downSpeed / 7) * 0.8;
      grounded = p.grounded;
      downSpeed = p.vy < 0 ? -p.vy : downSpeed;
      const springDt = Math.min(dt, 0.05);
      landVelocity += (-landing * 95 - landVelocity * 15) * springDt;
      landing += landVelocity * springDt;
      bob += ((p.grounded ? Math.min(1, speed / 4.2) : 0) - bob) * blend;
      sprint +=
        ((pose === "sprint" || (speed > 4.7 && aim < 0.2) ? 1 : 0) - sprint) *
        blend;
      if (lastCharges >= 0 && s.charges < lastCharges) throwAge = 0;
      lastCharges = s.charges;
      throwAge += dt;
      const throwDip = Math.sin(clamp(throwAge / 0.55, 0, 1) * Math.PI) * 0.13;
      const swap = pose === "swap" ? 0.72 : w.raise,
        swapProgress = 1 - swap;
      const endingLower = ease(clamp(s.ending / 0.6, 0, 1));
      const active = rigs.rigs[current];
      for (const rig of rigList) {
        const old = previous === rig.kind && swapProgress < 0.44 && swap > 0;
        rig.anchor.visible =
          p.armed &&
          endingLower < 1 &&
          pose !== "down" &&
          (rig === active || old);
        if (!rig.anchor.visible && s.time !== 0) continue;
        const r = rig === active ? reload : 0,
          a = rig === active ? displayAim : 0;
        reloadRig(rig, r, w.heat, w.charging, w.venting, time, noMotion, dt);
        rig.anchor.position.copy(rig.hip).lerp(rig.aim, a);
        // Preserve the receiver's screen position in a narrow portrait viewport.
        rig.anchor.position.x *= Math.min(1, camera.aspect / (16 / 9));
        // Drop the previous rig before bringing the new one through the lower edge.
        const lower = old
          ? ease(swapProgress / 0.44)
          : swap > 0
            ? 1 - ease((swapProgress - 0.44) / 0.56)
            : 0;
        const reloadTurn = Math.sin(Math.PI * r),
          kick = noMotion
            ? 0
            : w.kick *
              (rig.kind === "rail" ? 1.65 : rig.kind === "scatter" ? 1.4 : 1);
        // Reloads lift the gun up and in, rolling the magazine well toward the
        // eye so the support hand's work stays near 60% of screen height.
        // The scattergun loads its side drum, so it only cants a little the
        // other way; rolling it like a magazine gun drags the forearm across.
        const drum = rig.kind === "scatter";
        rig.anchor.position.y -=
          endingLower * 0.8 +
          lower * 0.65 +
          sprint * 0.15 +
          throwDip -
          reloadTurn * (drum ? 0.085 : 0.1);
        rig.anchor.position.x -= reloadTurn * (drum ? 0.01 : 0.06);
        rig.anchor.position.z += kick + sprint * 0.065 + reloadTurn * 0.03;
        // Negative roll turns the underside (magazine well) toward the eye.
        rig.anchor.rotation.set(
          -sprint * 0.25 + kick * 1.1 + reloadTurn * (drum ? 0.1 : 0.16),
          0.055 * (1 - a) + reloadTurn * (drum ? 0.18 : 0.22),
          -0.11 * sprint + (drum ? 0.3 : -0.5) * reloadTurn + lower * 0.13,
        );
        if (!noMotion) {
          // The sim takes a footstep every 1.8 m; horizontal sway spans two steps.
          const quiet = 1 - a;
          rig.anchor.position.x +=
            (swayX + Math.sin(s.steps * 1.75) * 0.006 * bob) * quiet;
          rig.anchor.position.y +=
            (swayY +
              Math.cos(s.steps * 3.5) * 0.005 * bob +
              landing -
              clamp(p.vy, -5, 5) * 0.002) *
            quiet;
          rig.anchor.rotation.x += swayY * 0.55 * quiet;
          rig.anchor.rotation.y -= swayX * 0.6 * quiet;
        }
        // At full rail aim the scope surround and zoom take over the image.
        if (rig.kind === "rail" && a > 0.94) rig.anchor.visible = false;
      }
      if (swap <= 0) previous = null;
      const parent = viewGroup.parent;
      parent.updateWorldMatrix(true, true);
      localInverse.copy(viewGroup.matrixWorld).invert();
      nodeLocal(active.nodes.muzzle, muzzle, active.hip);
      camera.updateMatrixWorld();
      worldMuzzle.copy(muzzle);
      toWorld(worldMuzzle, camera);
      nodeLocal(active.nodes.eject, ejectPoint, muzzle);
      toWorld(ejectPoint, camera);
      nodeLocal(active.nodes.vent, ventPoint, muzzle);
      toWorld(ventPoint, camera);
      nodeLocal(active.nodes.mag, cellPoint, muzzle);
      toWorld(cellPoint, camera);
      for (const e of events) {
        if (e.type === "shot") {
          fx.shot(e, worldMuzzle, impacts.mark(e, e.to));
        }
        if (e.type === "bolt-hit") {
          const contact = e.kind === "arc" && impacts.mark(e, e.at);
          fx.impact(
            contact?.at ?? e.at,
            e.hit,
            contact?.normal ?? e.normal,
            e.kind,
          );
        }
        if (e.type === "splash") fx.impact(e.at, "water", null, e.kind);
        if (e.type === "casing") {
          fx.muzzleFlash();
          fx.eject(ejectPoint, camera, e.weapon);
          fx.emit(
            worldMuzzle.x,
            worldMuzzle.y,
            worldMuzzle.z,
            1,
            0.035,
            0.65,
            0xaeb7b8,
            0,
            0.11,
            0,
          );
        }
        if (e.type === "explode" && e.kind === "charge") fx.burst(e.at);
      }
      impacts.update(s.time, s.zone);
      // A rail reload drops its old cell before the replacement seats.
      if (current === "rail" && lastReload < 0.28 && reload >= 0.28)
        fx.eject(cellPoint, camera, "rail", true);
      lastReload = reload;
      ventClock += dt;
      const vent = w.venting && ventClock > 0.065;
      if (vent) ventClock = 0;
      fx.update(frame, muzzle, active, vent ? ventPoint : null, displayAim);
      let index = 0;
      for (const b of s.bolts)
        if (b.kind === "charge" && index < pulses.length) {
          const pulse = pulses[index++];
          pulse.root.visible = true;
          pulse.root.position.set(b.x, b.y, b.z);
          pulse.root.rotation.set(
            b.settled ? 0 : b.age * 5,
            b.settled ? b.id * 0.7 : b.age * 3,
            b.bounced ? 0.7 : 0,
          );
          const scale = noMotion ? 1 : 1 + Math.sin(b.age * 9) * 0.045;
          pulse.band.scale.setScalar(scale);
        }
      for (; index < pulses.length; index++)
        pulses[index].root.visible = s.time === 0;
      rigs.eye.value.copy(camera.position);
      shadeClock += dt;
      if (shadeClock > 0.12) {
        shadeClock = 0;
        shadeOrigin.set(p.x, p.y + 1.4, p.z);
        const direct = sunBlocked(shadeOrigin, env.sunDir) ? 0.12 : 1;
        const wall =
          Math.max(
            sim.groundY(p.x + 2, p.z),
            sim.groundY(p.x - 2, p.z),
            sim.groundY(p.x, p.z + 2),
            sim.groundY(p.x, p.z - 2),
          ) - p.y;
        shadeDirect = direct;
        shadeSky = clamp(1 - Math.max(0, wall - 1) * 0.08, 0.5, 1);
      }
      rigs.shade.value.x += (shadeDirect - rigs.shade.value.x) * blend;
      rigs.shade.value.y += (shadeSky - rigs.shade.value.y) * blend;
    },
    dispose() {
      delete viewGroup.userData.hwArmsMuzzleLocal;
      delete viewGroup.userData.hwArmsMuzzleWorld;
      rigs.dispose();
      fx.dispose();
      impacts.dispose();
      for (const pulse of pulses) pulse.root.removeFromParent();
    },
  };
}
