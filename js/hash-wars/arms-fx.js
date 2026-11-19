/** Fixed pools: one soft-effect shader and shared instanced PBR brass/cells. */
export function createEffects({ T, kit, scene, viewGroup, sim, quality }) {
  const capacity = quality === "low" ? 256 : 512,
    count = quality === "low" ? 36 : 72;
  const geometry = new T.PlaneGeometry(1, 1),
    params = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  geometry.setAttribute("effect", params);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    vertexShader: `attribute vec4 effect;varying vec2 uvEffect;varying vec4 fx;varying vec3 tint;
void main(){uvEffect=uv;fx=effect;tint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 uvEffect;varying vec4 fx;varying vec3 tint;
void main(){vec2 p=uvEffect*2.-1.;float r=length(p);
if(fx.y>7.5){
 // Muzzle star: three petal shapes cycle per shot (fx.z), random roll (fx.w).
 float a=atan(p.y,p.x)+fx.w,k=fx.z<.5?4.:fx.z<1.5?5.:3.;
 float petal=pow(abs(cos(a*k*.5)),fx.z<1.5?5.:2.5);
 float reach=.16+.84*petal*(.8+.2*sin(a*13.+fx.w*7.));
 float star=(1.-smoothstep(reach*.35,reach,r))*(1.-smoothstep(.75,1.,r));
 float core=exp(-r*r*22.);
 gl_FragColor=vec4(tint*(1.+core*2.),max(core,star*.85)*fx.x);return;
}
if(fx.y>6.5){
 vec2 q=p*vec2(fx.z,1.);float radius=length(q);
 float surround=smoothstep(.59,.76,radius)*.97;
 float vertical=(1.-smoothstep(.0015,.0035,abs(q.x)))*smoothstep(.055,.08,abs(q.y))*(1.-smoothstep(.45,.47,abs(q.y)));
 float horizontal=(1.-smoothstep(.0015,.0035,abs(q.y)))*smoothstep(.055,.08,abs(q.x))*(1.-smoothstep(.45,.47,abs(q.x)));
 float tick=(1.-smoothstep(.002,.004,abs(abs(q.y)-.19)))*(1.-smoothstep(.012,.016,abs(q.x)));
 float reticle=max(max(vertical,horizontal),tick);
 gl_FragColor=vec4(mix(vec3(.004,.007,.009),vec3(.65,.36,.13),reticle),max(surround,reticle*.8)*fx.x);return;
}
float alpha=pow(max(0.,1.-r*r),2.);
if(fx.y>.5&&fx.y<1.5){float billow=sin(p.x*6.+sin(p.y*8.)+fx.z)*sin(p.y*7.-fx.z);
alpha*=smoothstep(-.8,.8,billow)*.65+.35;alpha*=1.-smoothstep(.55+.15*billow,1.,r);}
if(fx.y>1.5&&fx.y<2.5)alpha=(1.-smoothstep(.018,.12,abs(r-.77)))*(1.-smoothstep(.95,1.,r));
if(fx.y>3.5&&fx.y<4.5)alpha=pow(max(0.,1.-p.x*p.x),2.)*(1.-smoothstep(.65,1.,abs(p.y)));
if(fx.y>4.5&&fx.y<5.5)alpha=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r));
if(fx.y>5.5&&fx.y<6.5)alpha=(1.-smoothstep(.22,.7,abs(p.x)+abs(p.y)*.7))*(.8+.2*sin(p.y*18.+fx.z));
gl_FragColor=vec4(tint,alpha*fx.x);}`,
  });
  const mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.name = "ARMS pooled soft effects";
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.setColorAt(0, new T.Color());
  scene.add(mesh);
  const flashGeo = new T.PlaneGeometry(1, 1),
    flashParams = new T.InstancedBufferAttribute(new Float32Array(12), 4);
  flashGeo.setAttribute("effect", flashParams);
  const flash = new T.InstancedMesh(flashGeo, material, 3);
  flash.name = "ARMS soft muzzle";
  flash.frustumCulled = false;
  flash.setColorAt(0, new T.Color(0xffcb80));
  viewGroup.add(flash);
  const scopeGeo = new T.PlaneGeometry(1, 1),
    scopeParams = new T.InstancedBufferAttribute(new Float32Array(4), 4);
  scopeGeo.setAttribute("effect", scopeParams);
  const scope = new T.InstancedMesh(scopeGeo, material, 1);
  scope.name = "ARMS scope surround and reticle";
  scope.frustumCulled = false;
  scope.renderOrder = 100;
  scope.setColorAt(0, new T.Color());
  viewGroup.add(scope);
  const brass = kit.material({
    color: 0xffffff,
    metalness: 0.72,
    roughness: 0.38,
  });
  const casingGeo = new T.CylinderGeometry(0.5, 0.5, 1, 8);
  casingGeo.rotateX(Math.PI / 2);
  const casings = new T.InstancedMesh(casingGeo, brass, count);
  const cellGeo = kit.roundedBox(1, 1, 1, 0.12),
    cells = new T.InstancedMesh(cellGeo, brass, count);
  cells.name = "ARMS spent cells";
  cells.frustumCulled = false;
  scene.add(cells);
  casings.setColorAt(0, new T.Color());
  cells.setColorAt(0, new T.Color());
  casings.receiveShadow = cells.receiveShadow = true;
  casings.name = "ARMS persistent casings";
  casings.frustumCulled = false;
  scene.add(casings);
  for (const draw of [mesh, flash, scope, casings, cells]) {
    draw.instanceMatrix.setUsage(T.DynamicDrawUsage);
    draw.instanceColor.setUsage(T.DynamicDrawUsage);
  }
  for (const attribute of [params, flashParams, scopeParams])
    attribute.setUsage(T.DynamicDrawUsage);
  const chipGeometry = new T.TetrahedronGeometry(0.65);
  const chipFade = new T.InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  );
  chipGeometry.setAttribute("chipFade", chipFade.setUsage(T.DynamicDrawUsage));
  const chipMaterial = kit.material({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
  });
  const compileChip = chipMaterial.onBeforeCompile;
  chipMaterial.customProgramCacheKey = () => "hw-impact-chip";
  chipMaterial.onBeforeCompile = (shader) => {
    compileChip(shader);
    shader.vertexShader =
      "attribute float chipFade;varying float opacityChip;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nopacityChip=chipFade;",
      );
    shader.fragmentShader =
      "varying float opacityChip;\n" +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.a*=opacityChip;",
        )
        .replace(
          "#include <opaque_fragment>",
          // Preserve the fragment shading while the orange muzzle light is on.
          "outgoingLight=mix(vec3(dot(outgoingLight,vec3(.2126,.7152,.0722))),outgoingLight,.18);\n#include <opaque_fragment>",
        );
  };
  const chips = new T.InstancedMesh(chipGeometry, chipMaterial, capacity);
  chips.setColorAt(0, new T.Color());
  chips.frustumCulled = false;
  chips.receiveShadow = true;
  chips.name = "ARMS stone fragments";
  scene.add(chips);
  const zeroMatrix = new T.Matrix4().makeScale(0, 0, 0);
  const records = Array.from({ length: capacity }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0,
    stretch: 1,
    age: 1,
    life: 0,
    mode: 0,
    tint: 0,
    phase: 0,
    opacity: 1,
    gravity: 0,
    floor: 0,
    minWidth: 0,
    boost: 1,
    normal: new T.Vector3(),
    axis: new T.Vector3(),
  }));
  const shells = Array.from({ length: count }, () => ({
    p: new T.Vector3(),
    v: new T.Vector3(),
    spin: new T.Vector3(),
    q: new T.Quaternion(),
    age: 99,
    kind: "carbine",
    floor: 0,
    bounces: 0,
  }));
  const dummy = new T.Object3D(),
    tint = new T.Color(),
    dir = new T.Vector3(),
    side = new T.Vector3(),
    normal = new T.Vector3(),
    basis = new T.Matrix4(),
    up = new T.Vector3(0, 1, 0),
    zAxis = new T.Vector3(0, 0, 1),
    point = new T.Vector3(),
    axis = new T.Vector3(),
    helixPrevious = new T.Vector3(),
    helixNext = new T.Vector3(),
    barrel = new T.Vector3();
  let cursor = 0,
    shellCursor = 0,
    write = 0,
    round = 0,
    pellet = 0,
    flashAge = 1,
    flashShape = 0,
    flashRoll = 0,
    seed = 941,
    lastKind = "carbine";
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  // Supports authoritative deck tops as well as bare terrain, without inventing collision.
  function floor(x, z, y) {
    let h = sim.groundY(x, z);
    for (const b of sim.layout) {
      if (b.shape === "cyl") {
        if (b.y1 <= y + 0.2 && Math.hypot(x - b.x, z - b.z) < b.r)
          h = Math.max(h, b.y1);
      } else if (
        b.max[1] <= y + 0.2 &&
        x >= b.min[0] &&
        x <= b.max[0] &&
        z >= b.min[2] &&
        z <= b.max[2]
      )
        h = Math.max(h, b.max[1]);
    }
    return h;
  }
  function emit(
    x,
    y,
    z,
    mode,
    size,
    life,
    colour,
    vx = 0,
    vy = 0,
    vz = 0,
    gravity = 0,
    surface = null,
    direction = null,
    stretch = 1,
    opacity = 1,
  ) {
    const p = records[cursor++ % capacity];
    p.x = x;
    p.y = y;
    p.z = z;
    p.mode = mode;
    p.phase = random() * 6.28;
    p.size = size;
    p.life = life;
    p.age = 0;
    p.tint = colour;
    p.opacity = opacity;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.gravity = gravity;
    p.stretch = stretch;
    p.minWidth = 0;
    p.boost = 1;
    p.normal.copy(surface ?? zAxis);
    p.axis.copy(direction ?? zAxis);
  }
  function put(
    x,
    y,
    z,
    w,
    h,
    colour,
    alpha,
    mode,
    camera,
    surface = null,
    direction = null,
    phase = 0,
    boost = 1,
  ) {
    if (write >= capacity) return;
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, 1);
    if (surface) dummy.quaternion.setFromUnitVectors(zAxis, surface);
    else if (direction) {
      dir.copy(direction).normalize();
      side.copy(camera.position).sub(dummy.position).cross(dir);
      if (side.lengthSq() < 0.00001) {
        side.set(0, 1, 0).cross(dir);
        if (side.lengthSq() < 0.00001) side.set(1, 0, 0);
      }
      side.normalize();
      normal.crossVectors(side, dir).normalize();
      basis.makeBasis(side, dir, normal);
      dummy.quaternion.setFromRotationMatrix(basis);
    } else dummy.quaternion.copy(camera.quaternion);
    dummy.updateMatrix();
    mesh.setMatrixAt(write, dummy.matrix);
    tint.set(colour).multiplyScalar(boost);
    mesh.setColorAt(write, tint);
    params.setXYZW(write, alpha, mode, phase, 0);
    write++;
  }
  function eject(position, camera, kind, dropped = false) {
    // The four-shot rail cell is spent during reload, not after every slug.
    if (kind === "arc" || (kind === "rail" && !dropped)) return;
    const p = shells[shellCursor++ % count];
    p.p.copy(position);
    p.v
      .set(1.4 + random(), 0.7 + random(), 0.15 + random() * 0.5)
      .applyQuaternion(camera.quaternion);
    if (dropped) p.v.set(0.15, -0.6, 0.1).applyQuaternion(camera.quaternion);
    p.q.copy(camera.quaternion);
    p.spin.set(3 + random() * 7, random() * 9, random() * 7);
    p.age = 0;
    p.kind = kind;
    p.bounces = 0;
    p.floor = floor(p.p.x, p.p.z, p.p.y);
  }
  function impact(at, hit, n, weapon) {
    if (!hit) return;
    const x = at[0],
      y = at[1],
      z = at[2];
    normal.set(n?.[0] ?? 0, n?.[1] ?? 1, n?.[2] ?? 0);
    if (normal.lengthSq() < 0.01) normal.copy(up);
    normal.normalize();
    const shield = hit === "shield",
      weak = hit === "weak",
      hull = hit === "enemy";
    if (shield || weak) {
      const colour = shield ? 0x8cefff : 0xffc376;
      // Local contact feedback supplements MACHINES' large enclosing shield shell.
      emit(x, y, z, 2, shield ? 0.7 : 0.42, 0.32, colour, 0, 0, 0, 0, normal);
      emit(x, y, z, 5, 0.22, 0.2, colour);
      if (shield) return;
    }
    if (hit === "player") return;
    const pellet = weapon === "scatter";
    if (hit === "water") {
      const force = pellet
        ? 0.52
        : weapon === "rail" || weapon === "charge"
          ? 1.7
          : 1;
      const drops = pellet ? 4 : quality === "low" ? 7 : 12;
      const phase = random() * Math.PI * 2;
      for (let i = 0; i < drops; i++) {
        const a = phase + (i * 6.283) / drops,
          speed = (1.4 + random()) * force;
        emit(
          x,
          y + 0.04,
          z,
          0,
          0.15 * force,
          1.4,
          0xd9f8ff,
          Math.cos(a) * speed,
          (3.6 + random() * 1.8) * Math.sqrt(force),
          Math.sin(a) * speed,
          9,
          null,
          null,
          1.6,
        );
        const drop = records[(cursor - 1) % capacity];
        drop.life = (2 * drop.vy) / drop.gravity;
      }
      emit(
        x,
        y + 0.58 * force,
        z,
        4,
        0.21 * force,
        0.32,
        0xf0ffff,
        0,
        0.7,
        0,
        0,
        null,
        up,
        6,
      );
      emit(x, y + 0.19, z, 1, 0.67 * force, 0.53, 0xe0eff3, 0.15, 0.42, 0);
      return;
    }
    // A short hot pinpoint makes every hit readable at range.
    emit(
      x + normal.x * 0.03,
      y + normal.y * 0.03,
      z + normal.z * 0.03,
      5,
      0.14,
      0.06,
      0xffe2b0,
    );
    records[(cursor - 1) % capacity].boost = 2.4;
    const metal = hit === "metal" || hull || weak,
      stone = hit === "rock" || hit === "concrete" || hit === "stone";
    const colour = metal
      ? 0xffbd65
      : hit === "grass"
        ? 0x675635
        : hit === "sand"
          ? 0xb99762
          : hit === "rock"
            ? 0x858886
            : hit === "stone"
              ? 0x626b72
              : 0x999e9d;
    const particles = pellet ? 2 : quality === "low" ? 4 : 7;
    const bottom = stone ? (normal.y > 0.85 ? y : floor(x, z, y)) : 0;
    for (let i = 0; i < particles; i++) {
      const speed = metal ? 5 : 2.7;
      const vx = (random() - 0.5) * speed + normal.x * 2,
        vy = 0.5 + random() * speed + normal.y,
        vz = (random() - 0.5) * speed + normal.z * 2;
      axis.set(vx, vy, vz).normalize();
      emit(
        x,
        y + 0.02,
        z,
        metal ? 4 : stone ? 9 : 6,
        metal ? 0.034 : 0.065 + random() * 0.07,
        stone ? 1.25 : 0.24 + random() * 0.24,
        colour,
        vx,
        vy,
        vz,
        9,
        null,
        axis,
        metal ? 6 : 1,
      );
      records[(cursor - 1) % capacity].floor = bottom;
    }
    emit(
      x + normal.x * 0.08,
      y + 0.06,
      z + normal.z * 0.08,
      1,
      metal ? 0.12 : pellet ? 0.23 : 0.58,
      metal ? 0.82 : stone ? 1.32 : 0.46,
      metal ? 0xa39d98 : colour,
      normal.x * 0.5,
      0.45 + normal.y * 0.4,
      normal.z * 0.5,
    );
  }
  // Thin warm tracer from the muzzle to the authoritative hit. The streak travels
  // so its head reaches the hit as it fades; width never drops under ~2 px.
  function tracer(start, to, length, life, width, colour, boost) {
    const span = Math.min(3.2, length * 0.45);
    point.copy(start).addScaledVector(dir, span * 0.5 + 0.15);
    const speed = Math.max(0, length - span - 0.15) / life;
    emit(
      point.x,
      point.y,
      point.z,
      4,
      width,
      life,
      colour,
      dir.x * speed,
      dir.y * speed,
      dir.z * speed,
      0,
      null,
      dir,
      span / width,
    );
    const p = records[(cursor - 1) % capacity];
    p.minWidth = 0.0042;
    p.boost = boost;
    // Seen nearly end-on a short streak shrinks to a dot, so the shot frame also
    // draws one long streak that starts at the barrel and points at the hit.
    const reach = Math.min(length - 0.2, 14);
    point.copy(start).addScaledVector(dir, reach * 0.5 + 0.2);
    emit(
      point.x,
      point.y,
      point.z,
      4,
      width * 0.8,
      0.03,
      colour,
      0,
      0,
      0,
      0,
      null,
      dir,
      reach / (width * 0.8),
    );
    const q = records[(cursor - 1) % capacity];
    q.minWidth = 0.0032;
    q.boost = boost * 0.8;
  }
  // One flash per trigger pull (the sim's casing event), for every weapon.
  function muzzleFlash() {
    flashAge = 0;
    flashShape = (flashShape + 1) % 3;
    flashRoll = random() * 6.28;
  }
  function shot(event, start, contact) {
    if (event.weapon === "arc") return;
    const rail = event.weapon === "rail";
    const to = contact?.at ?? event.to;
    dir.fromArray(to).sub(start);
    const length = dir.length();
    dir.normalize();
    if (rail)
      emit(
        start.x + dir.x * length * 0.5,
        start.y + dir.y * length * 0.5,
        start.z + dir.z * length * 0.5,
        4,
        0.035,
        0.34,
        0xffe3ab,
        0,
        0,
        0,
        0,
        null,
        dir,
        length / 0.035,
      );
    else if (event.weapon === "scatter") {
      // Eight pellets per shot; three short hot streaks read as a cone.
      if (pellet++ % 3 === 0 && length > 1.5)
        tracer(
          start,
          event.to,
          Math.min(length, 14),
          0.05,
          0.012,
          0xffd59a,
          2.2,
        );
    } else if (round++ % 2 === 0 && length > 2.5)
      tracer(
        start,
        event.to,
        length,
        Math.min(0.09, Math.max(0.05, length / 500)),
        0.016,
        0xffd9a3,
        2.6,
      );
    if (rail) {
      // A helix around the authoritative hit line. The mist expands after the slug.
      axis.crossVectors(dir, up).normalize();
      if (axis.lengthSq() < 0.01) axis.set(1, 0, 0);
      side.crossVectors(dir, axis).normalize();
      const steps = quality === "low" ? 24 : 48,
        reach = Math.min(35, length);
      helixPrevious.copy(start).addScaledVector(axis, 0.06);
      for (let i = 0; i < steps; i++) {
        const d = ((i + 1) / steps) * reach,
          a = d * 2.6,
          r = 0.06 + d * 0.002;
        const ox = (axis.x * Math.cos(a) + side.x * Math.sin(a)) * r,
          oy = (axis.y * Math.cos(a) + side.y * Math.sin(a)) * r,
          oz = (axis.z * Math.cos(a) + side.z * Math.sin(a)) * r;
        helixNext.copy(start).addScaledVector(dir, d);
        helixNext.x += ox;
        helixNext.y += oy;
        helixNext.z += oz;
        point.copy(helixNext).add(helixPrevious).multiplyScalar(0.5);
        normal.copy(helixNext).sub(helixPrevious);
        const span = normal.length();
        normal.normalize();
        emit(
          point.x,
          point.y,
          point.z,
          4,
          0.075,
          1.15 + random() * 0.3,
          0xc4d0cf,
          ox * 0.15,
          0.035,
          oz * 0.15,
          0,
          null,
          normal,
          span / 0.075,
          0.2,
        );
        helixPrevious.copy(helixNext);
      }
    }
    impact(to, event.hit, contact?.normal ?? event.normal, event.weapon);
  }
  function burst(at) {
    // MACHINES owns the hot flash/plume; this is the low ground shock and soil skirt.
    if (at[1] < sim.waterY(at[0], at[2])) return;
    const y = floor(at[0], at[2], at[1] + 1) + 0.035;
    emit(at[0], y, at[2], 2, 5, 0.75, 0xd2b992, 0, 0, 0, 0, up);
    for (let i = 0; i < (quality === "low" ? 8 : 16); i++) {
      const a = random() * Math.PI * 2,
        v = 1 + random() * 3;
      emit(
        at[0],
        y + 0.08,
        at[2],
        1,
        0.4,
        1.5,
        0x776c57,
        Math.sin(a) * v,
        0.3 + random(),
        Math.cos(a) * v,
        0.35,
      );
    }
  }
  function update(frame, muzzle, rig, vent, displayAim) {
    const { dt, camera, snapshot: s } = frame;
    write = 0;
    if (rig.kind !== lastKind) {
      flashAge = 1;
      lastKind = rig.kind;
    }
    // Per-shot flash: full on the shot frame, half on the next, then gone (~2 frames).
    if (s.pose === "fire") flashAge = 0;
    const scatter = rig.kind === "scatter",
      rail = rig.kind === "rail",
      arc = rig.kind === "arc";
    const strength = flashAge < 0.001 ? 1 : flashAge < 0.026 ? 0.5 : 0;
    flashAge += dt;
    const star = scatter ? 0.22 : rail ? 0.17 : arc ? 0.1 : 0.12;
    barrel.set(0, 0, -1).applyQuaternion(rig.anchor.quaternion).normalize();
    const hue = arc ? 0x7fe6ff : rail ? 0xdff1ff : 0xffd29a,
      boost = arc ? 2.2 : rail ? 3.2 : 2.8;
    // 0: star facing the eye. 1: hot plume along the barrel. 2: soft halo for bloom.
    for (let i = 0; i < 3; i++) {
      // Some muzzle nodes sit inside a shroud; start the flash just past the tip.
      dummy.position
        .copy(muzzle)
        .addScaledVector(barrel, i === 1 ? star * 0.75 : star * 0.3);
      if (i === 1) {
        side.copy(dummy.position).negate().cross(barrel).normalize();
        normal.crossVectors(side, barrel).normalize();
        basis.makeBasis(side, barrel, normal);
        dummy.quaternion.setFromRotationMatrix(basis);
        dummy.scale.set(star * 0.32, star * (scatter ? 1.1 : 1.35), 1);
      } else {
        dummy.quaternion.identity();
        const size = i === 0 ? star * (0.85 + 0.3 * random()) : star * 1.9;
        dummy.scale.set(size, size, 1);
      }
      dummy.updateMatrix();
      flash.setMatrixAt(i, dummy.matrix);
      tint.set(hue).multiplyScalar(i === 2 ? 1.2 : boost);
      flash.setColorAt(i, tint);
      flashParams.setXYZW(
        i,
        strength * (i === 0 ? 1 : i === 1 ? 0.8 : 0.22),
        i === 0 ? 8 : i === 1 ? 4 : 5,
        flashShape,
        flashRoll,
      );
    }
    flashParams.needsUpdate = true;
    flash.instanceMatrix.needsUpdate = true;
    flash.instanceColor.needsUpdate = true;
    flash.visible =
      s.player.armed &&
      s.pose !== "down" &&
      (strength > 0 || s.time === 0) &&
      !(rail && displayAim > 0.8);
    const scopeAim = rail ? displayAim : 0;
    const scopeBlend = Math.max(0, Math.min(1, (scopeAim - 0.72) / 0.23));
    dummy.position.set(0, 0, -0.02);
    dummy.quaternion.identity();
    const halfHeight = 0.02 * Math.tan((viewGroup.parent.fov * Math.PI) / 360);
    dummy.scale.set(halfHeight * 2 * camera.aspect, halfHeight * 2, 1);
    dummy.updateMatrix();
    scope.setMatrixAt(0, dummy.matrix);
    scopeParams.setXYZW(0, scopeBlend, 7, camera.aspect, 0);
    scopeParams.needsUpdate = true;
    scope.instanceMatrix.needsUpdate = true;
    scope.visible = s.player.armed && (scopeBlend > 0 || s.time === 0);
    if (vent) {
      emit(vent.x, vent.y, vent.z, 1, 0.07, 0.8, 0xa5bfc0, 0, 0.3, 0.03);
    }
    let chipCount = 0;
    for (const p of records) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life,
        smoke = p.mode === 1,
        ring = p.mode === 2;
      if (p.mode === 9) {
        if (p.y <= p.floor && p.vy < 0) {
          p.y = p.floor + 0.012;
          p.vy = -p.vy * 0.28;
          p.vx *= 0.48;
          p.vz *= 0.48;
          if (p.vy < 0.45) p.gravity = p.vx = p.vy = p.vz = 0;
        }
        const size = p.size;
        chipFade.setX(chipCount, Math.min(1, Math.max(0, (1 - t) * 4)));
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(
          p.phase + p.age * p.vx,
          p.phase + p.age * p.vz,
          p.phase,
        );
        dummy.scale.set(size, size * 0.62, size * 0.8);
        dummy.updateMatrix();
        chips.setMatrixAt(chipCount, dummy.matrix);
        chips.setColorAt(chipCount++, tint.set(p.tint));
        continue;
      }
      const size = p.size * (smoke ? 1 + t * 2 : ring ? 0.2 + t * 1.5 : 1),
        alpha =
          p.opacity *
          (smoke ? 0.25 : 0.9) *
          Math.min(1, Math.max(0, (1 - t) * 4));
      const width = p.minWidth
        ? Math.max(
            size,
            camera.position.distanceTo(point.set(p.x, p.y, p.z)) * p.minWidth,
          )
        : size;
      put(
        p.x,
        p.y,
        p.z,
        width,
        size * p.stretch,
        p.tint,
        alpha,
        p.mode,
        camera,
        p.mode === 2 ? p.normal : null,
        p.mode === 4 ? p.axis : null,
        p.phase + t * 0.6,
        p.boost,
      );
    }
    chips.count = s.time === 0 ? Math.max(1, chipCount) : chipCount;
    chips.visible = chips.count > 0;
    if (chipCount)
      chipFade.needsUpdate =
        chips.instanceColor.needsUpdate =
        chips.instanceMatrix.needsUpdate =
          true;
    if (!chipCount && s.time === 0) chips.setMatrixAt(0, zeroMatrix);
    mesh.count = s.time === 0 ? Math.max(1, write) : write;
    mesh.visible = write > 0 || s.time === 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    params.needsUpdate = true;
    let drawn = 0,
      cellCount = 0;
    for (const p of shells) {
      p.age += dt;
      if (p.age > 18) continue;
      if (p.bounces < 3) {
        p.v.y -= 9.8 * dt;
        p.p.addScaledVector(p.v, dt);
        dummy.quaternion.copy(p.q);
        dummy.rotateX(p.spin.x * dt);
        dummy.rotateY(p.spin.y * dt);
        dummy.rotateZ(p.spin.z * dt);
        p.q.copy(dummy.quaternion);
        p.floor = floor(p.p.x, p.p.z, p.p.y);
        if (p.p.y < p.floor + 0.012) {
          p.p.y = p.floor + 0.012;
          p.v.y = Math.abs(p.v.y) * 0.3;
          p.v.x *= 0.6;
          p.v.z *= 0.6;
          p.spin.multiplyScalar(0.45);
          p.bounces++;
          if (p.bounces === 3) p.q.setFromAxisAngle(up, p.spin.y);
        }
      }
      dummy.position.copy(p.p);
      dummy.quaternion.copy(p.q);
      const scatter = p.kind === "scatter",
        rail = p.kind === "rail";
      dummy.scale.set(
        scatter ? 0.018 : rail ? 0.026 : 0.008,
        scatter ? 0.018 : rail ? 0.03 : 0.008,
        scatter ? 0.055 : rail ? 0.08 : 0.028,
      );
      dummy.scale.multiplyScalar(Math.min(1, (18 - p.age) / 2));
      dummy.updateMatrix();
      tint.set(scatter ? 0x803a2c : rail ? 0x536269 : 0xb29558);
      if (rail) {
        cells.setMatrixAt(cellCount, dummy.matrix);
        cells.setColorAt(cellCount++, tint);
      } else {
        casings.setMatrixAt(drawn, dummy.matrix);
        casings.setColorAt(drawn++, tint);
      }
    }
    if (!drawn && s.time === 0) casings.setMatrixAt(0, zeroMatrix);
    if (!cellCount && s.time === 0) cells.setMatrixAt(0, zeroMatrix);
    casings.count = s.time === 0 ? Math.max(1, drawn) : drawn;
    casings.visible = drawn > 0 || s.time === 0;
    casings.instanceMatrix.needsUpdate = true;
    casings.instanceColor.needsUpdate = true;
    cells.count = s.time === 0 ? Math.max(1, cellCount) : cellCount;
    cells.visible = cellCount > 0 || s.time === 0;
    cells.instanceMatrix.needsUpdate = true;
    cells.instanceColor.needsUpdate = true;
  }
  function reset() {
    for (const p of records) p.age = p.life;
    for (const p of shells) p.age = 99;
    flashAge = 1;
    lastKind = "carbine";
  }
  return {
    shot,
    muzzleFlash,
    impact,
    emit,
    eject,
    burst,
    update,
    floor,
    reset,
    dispose() {
      chips.removeFromParent();
      chips.dispose();
      chipGeometry.dispose();
      mesh.removeFromParent();
      flash.removeFromParent();
      scope.removeFromParent();
      casings.removeFromParent();
      cells.removeFromParent();
      mesh.dispose();
      flash.dispose();
      scope.dispose();
      scopeGeo.dispose();
      casings.dispose();
      cells.dispose();
      casingGeo.dispose();
      geometry.dispose();
      flashGeo.dispose();
      material.dispose();
    },
  };
}
