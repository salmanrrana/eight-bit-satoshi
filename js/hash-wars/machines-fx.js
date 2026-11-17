/** One instanced, soft-edged program for projectiles, trails, smoke, sparks and marks. */
export function createEffects(
  { T, scene, quality, armsActive = false },
  ground,
) {
  const capacity = quality === "low" ? 320 : 640,
    reserved = 192;
  const geometry = new T.PlaneGeometry(1, 1),
    data = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  geometry.setAttribute("effect", data);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    vertexShader: `attribute vec4 effect; varying vec2 vUv; varying vec4 vEffect; varying vec3 vColour;
void main(){vUv=uv;vEffect=effect;vColour=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying vec4 vEffect;varying vec3 vColour;
void main(){vec2 p=vUv*2.-1.;float r=length(p);float a=pow(max(0.,1.-r*r),2.);
if(vEffect.y>0.5&&vEffect.y<1.5){a*=.65+.35*sin(p.x*8.+sin(p.y*9.)+vEffect.z);}
if(vEffect.y>1.5&&vEffect.y<2.5)a=(1.-smoothstep(.025,.17,abs(r-.78)))*(1.-smoothstep(.95,1.,r))*(.55+.45*sin(p.x*19.+sin(p.y*17.)));
if(vEffect.y>2.5&&vEffect.y<3.5)a=pow(max(0.,1.-r),.7)*(.7+.3*sin(p.x*16.)*sin(p.y*13.));
if(vEffect.y>3.5)a=pow(max(0.,1.-p.x*p.x),2.)*(1.-smoothstep(.65,1.,abs(p.y)));
gl_FragColor=vec4(vColour,a*vEffect.x);}`,
  });
  const mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.name = "Cartel pooled effects";
  // Defines USE_INSTANCING_COLOR before the shader warms, even with an empty pool.
  mesh.setColorAt(0, new T.Color());
  scene.add(mesh);
  const records = Array.from({ length: capacity - reserved }, () => ({
    age: 0,
    life: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0,
    mode: 0,
    colour: 0,
    gravity: 0,
    stretch: 1,
    normal: new T.Vector3(0, 1, 0),
  }));
  const dummy = new T.Object3D(),
    colour = new T.Color(),
    up = new T.Vector3(0, 1, 0),
    normalZ = new T.Vector3(0, 0, 1),
    dir = new T.Vector3(),
    side = new T.Vector3(),
    basis = new T.Matrix4(),
    cameraNormal = new T.Vector3();
  let cursor = 0,
    write = 0,
    seed = 143;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function emit(
    x,
    y,
    z,
    mode,
    size,
    life,
    tint,
    vx = 0,
    vy = 0,
    vz = 0,
    gravity = 0,
    normal = null,
  ) {
    const p = records[cursor++ % records.length];
    p.age = 0;
    p.life = life;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.mode = mode;
    p.size = size;
    p.colour = tint;
    p.gravity = gravity;
    p.normal.copy(normal ?? up);
  }
  function burst(x, y, z, size = 1, dirt = false, skirt = true) {
    emit(x, y, z, 0, size * 2, 0.24, 0xe5faff);
    if (skirt)
      emit(x, ground(x, z, y + 0.4) + 0.045, z, 2, size * 3.5, 0.8, 0xab9e7b);
    emit(x, ground(x, z, y + 0.4) + 0.025, z, 3, size * 2.3, 26, 0x211e1a);
    for (let i = 0; i < (quality === "low" ? 10 : 22); i++) {
      const a = random() * Math.PI * 2,
        s = (0.4 + random()) * size;
      emit(
        x,
        y,
        z,
        i % 3 === 0 ? 1 : 0,
        i % 3 === 0 ? size * 0.9 : 0.06 + random() * 0.08,
        i % 3 === 0 ? 2 + random() * 2 : 0.4 + random() * 0.65,
        i % 3 === 0 ? 0x555653 : dirt ? 0x80755e : 0xffac43,
        Math.sin(a) * s,
        random() * size * 4,
        Math.cos(a) * s,
        i % 3 === 0 ? -0.15 : 9,
      );
    }
  }
  function impact(at, hit, normal) {
    const x = at[0],
      y = at[1],
      z = at[2],
      metal = ["metal", "enemy", "weak", "shield", "player"].includes(hit),
      water = hit === "water" || hit === "wet",
      stone = hit === "rock" || hit === "concrete",
      dust = stone ? 0x8d8c83 : hit === "grass" ? 0x756c54 : 0x9d9275;
    emit(x, y, z, 0, 0.4, 0.15, metal ? 0x8deaff : 0xffd2a0);
    for (let i = 0; i < (quality === "low" ? 4 : 9); i++) {
      const speed = 1 + random() * 3;
      emit(
        x,
        y,
        z,
        metal || water || (stone && i % 3 === 0) ? 0 : 1,
        metal || water || (stone && i % 3 === 0) ? 0.055 : 0.22,
        0.3 + random() * 0.45,
        water
          ? 0xb6e4ed
          : hit === "shield"
            ? 0x83eaff
            : metal
              ? 0xffd19a
              : dust,
        (random() - 0.5) * speed + (normal?.[0] ?? 0),
        random() * 2 + (normal?.[1] ?? 0),
        (random() - 0.5) * speed + (normal?.[2] ?? 0),
        metal || water || (stone && i % 3 === 0) ? 8 : 1,
      );
    }
    // World marks belong to static receivers, never a floating point left on an actor.
    if (
      hit === "enemy" ||
      hit === "weak" ||
      hit === "shield" ||
      hit === "player"
    )
      return;
    if (water) {
      emit(x, y + 0.02, z, 2, 0.6, 0.6, 0xa9dfe7);
      return;
    }
    dir.set(normal?.[0] ?? 0, normal?.[1] ?? 1, normal?.[2] ?? 0);
    if (dir.lengthSq() < 0.1) dir.copy(up);
    dir.normalize();
    emit(
      x + dir.x * 0.015,
      y + dir.y * 0.015,
      z + dir.z * 0.015,
      3,
      0.28,
      18,
      metal ? 0x253136 : 0x35312a,
      0,
      0,
      0,
      0,
      dir,
    );
  }
  function put(
    x,
    y,
    z,
    w,
    h,
    tint,
    alpha,
    mode,
    camera,
    aim = null,
    surface = null,
    boost = 1,
  ) {
    if (write >= capacity) return;
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, 1);
    if (surface) dummy.quaternion.setFromUnitVectors(normalZ, surface);
    else if (aim) {
      dir.copy(aim).normalize();
      side.copy(camera.position).sub(dummy.position).cross(dir);
      if (side.lengthSq() < 0.00001)
        side
          .setFromMatrixColumn(camera.matrixWorld, 0)
          .addScaledVector(dir, -side.dot(dir));
      side.normalize();
      cameraNormal.crossVectors(side, dir).normalize();
      basis.makeBasis(side, dir, cameraNormal);
      dummy.quaternion.setFromRotationMatrix(basis);
    } else dummy.quaternion.copy(camera.quaternion);
    dummy.updateMatrix();
    mesh.setMatrixAt(write, dummy.matrix);
    colour.set(tint).multiplyScalar(boost);
    mesh.setColorAt(write, colour);
    data.setXYZW(write, alpha, mode, seed % 10, 0);
    write++;
  }
  const segA = new T.Vector3(),
    segB = new T.Vector3(),
    segMid = new T.Vector3(),
    segDir = new T.Vector3();
  // Metres per pixel-ish at distance d for the 68° game camera at 720p.
  const PX = 0.00095;
  /** A telegraph/trace line that stays `px` pixels wide at any distance: drawn as
   * short pieces whose width follows their distance. Skips the stretch right at
   * the eye so a beam aimed at the player never fills the screen. */
  function beam(from, to, tint, alpha, camera, px = 3, dot = true) {
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      segA.lerpVectors(from, to, i / pieces);
      segB.lerpVectors(from, to, (i + 1) / pieces);
      segMid.addVectors(segA, segB).multiplyScalar(0.5);
      const d = segMid.distanceTo(camera.position);
      if (d < 1.4) continue;
      segDir.subVectors(segB, segA);
      put(
        segMid.x,
        segMid.y,
        segMid.z,
        Math.max(0.012, d * PX * px),
        segDir.length() * 1.04,
        tint,
        alpha,
        4,
        camera,
        segDir,
        null,
        3,
      );
    }
    const end = to.distanceTo(camera.position);
    if (dot && end > 2.5) {
      const size = Math.max(0.14, end * PX * 9);
      put(
        to.x,
        to.y,
        to.z,
        size,
        size,
        0xe8ffff,
        0.95,
        0,
        camera,
        null,
        null,
        3,
      );
    }
  }
  const velocity = new T.Vector3(),
    landing = new T.Vector3(),
    worldUp = new T.Vector3(0, 1, 0);
  function begin(frame) {
    write = 0;
    const { snapshot: s, camera, dt } = frame;
    if (!s.quiet)
      for (const b of s.bolts) {
        if (armsActive && b.kind === "charge") continue;
        const mortar = b.kind === "bulwark",
          charge = b.kind === "charge";
        velocity.set(b.vx, b.vy, b.vz);
        // Enemy bolts never shrink below ~4 px; their trail keeps ~2 px.
        const far = segMid.set(b.x, b.y, b.z).distanceTo(camera.position) * PX;
        put(
          b.x,
          b.y,
          b.z,
          Math.max(mortar ? 0.18 : charge ? 0.16 : 0.065, far * 2.2),
          mortar ? 0.55 : charge ? 0.2 : b.kind === "watcher" ? 1.8 : 0.65,
          charge ? 0xffb75e : 0xb6f6ff,
          0.95,
          4,
          camera,
          velocity,
        );
        // The core stays visible when looking straight along an incoming/outgoing ribbon.
        const core = Math.max(mortar ? 0.23 : 0.13, far * 5);
        put(
          b.x,
          b.y,
          b.z,
          core,
          core,
          charge ? 0xffb75e : 0xe6fdff,
          0.95,
          0,
          camera,
          null,
          null,
          charge ? 1 : 3,
        );
        if (!charge && !mortar)
          put(
            b.x,
            b.y,
            b.z,
            core * 2.4,
            core * 2.4,
            0x4fd6ff,
            0.35,
            0,
            camera,
            null,
            null,
            1.6,
          );
        const length = mortar ? 0.8 : charge ? 0.3 : 1.9;
        velocity.normalize();
        put(
          b.x - velocity.x * length * 0.5,
          b.y - velocity.y * length * 0.5,
          b.z - velocity.z * length * 0.5,
          Math.max(mortar ? 0.3 : 0.13, far * 2.5),
          length,
          charge ? 0xffb75e : 0x52d8ff,
          0.55,
          4,
          camera,
          velocity,
        );
        if (mortar) {
          // Predict using the sim's gravity and fuse; this is a marker, never a new shot.
          const fuse = Math.max(0, 1.6 - (b.age ?? 0));
          let t = fuse;
          for (let i = 1; i <= 16; i++) {
            const q = (fuse * i) / 16,
              x = b.x + b.vx * q,
              z = b.z + b.vz * q;
            if (b.y + b.vy * q - 5 * q * q <= ground(x, z, b.y)) {
              t = q;
              break;
            }
          }
          landing.set(b.x + b.vx * t, 0, b.z + b.vz * t);
          landing.y = ground(landing.x, landing.z, b.y) + 0.07;
          put(
            landing.x,
            landing.y,
            landing.z,
            3.6,
            3.6,
            0x8cecff,
            0.55,
            2,
            camera,
            null,
            worldUp,
          );
          if (dt > 0) emit(b.x, b.y, b.z, 1, 0.35, 0.65, 0x737776, 0, 0.2, 0);
        }
      }
  }
  function end(frame) {
    const { dt, camera, snapshot: s } = frame;
    for (const p of records) {
      if (p.age >= p.life) continue;
      p.age += dt;
      if (s.quiet) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const age = p.age / p.life,
        smoke = p.mode === 1,
        ring = p.mode === 2;
      put(
        p.x,
        p.y,
        p.z,
        p.size * (smoke ? 1 + age * 2 : ring ? 0.25 + age * 1.6 : 1),
        p.size * (smoke ? 1 + age * 2 : ring ? 0.25 + age * 1.6 : 1),
        p.colour,
        (smoke ? 0.32 : ring ? 0.24 : p.mode === 3 ? 0.6 : 0.95) *
          Math.max(0, Math.min(1, (1 - age) * 4)),
        p.mode,
        camera,
        null,
        ring || p.mode === 3 ? p.normal : null,
      );
    }
    // Keep one zero-area instance drawn while idle: all GPU buffers warm before START.
    if (!write) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      data.setXYZW(0, 0, 0, 0, 0);
    }
    mesh.count = Math.max(1, write);
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    data.needsUpdate = true;
  }
  return {
    reset() {
      for (const p of records) p.age = p.life;
    },
    emit,
    burst,
    impact,
    put,
    beam,
    begin,
    end,
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
