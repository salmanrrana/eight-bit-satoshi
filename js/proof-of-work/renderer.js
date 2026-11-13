import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { adaptiveResolution } from "./resolution.js";
import { bakeIrradiance } from "./irradiance.js";

import { materials, label } from "./materials.js";
import { buildWorld } from "./world.js";
import { effects } from "./effects.js";
import { createAudio } from "./audio.js";

export async function create(canvas, callbacks) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!context)
    throw new Error(
      "WebGL2 is unavailable. Enable graphics acceleration, then reload.",
    );
  const renderer = new T.WebGLRenderer({ canvas, context, antialias: false });
  const debug = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug
    ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);
  const requested = new URLSearchParams(location.search).get("q");
  const quality = ["low", "high", "ultra"].includes(requested)
    ? requested
    : "low";
  const resolution = adaptiveResolution(quality);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.transmissionResolutionScale = 0.5;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0a1216);
  scene.fog = new T.FogExp2(0x142024, 0.028);
  const camera = new T.PerspectiveCamera(68, 1, 0.07, 65);
  camera.rotation.order = "YXZ";
  const progress = async (message) => {
    callbacks.progress?.(message);
    await new Promise(requestAnimationFrame);
  };
  const m = await materials(renderer, quality, progress),
    world = buildWorld(scene, m, quality),
    fx = effects(scene);
  if (quality === "low") {
    const simplified = new Map();
    scene.traverse((o) => {
      const mat = o.material;
      if (!mat?.isMeshPhysicalMaterial) return;
      if (!simplified.has(mat)) {
        const replacement = new T.MeshStandardMaterial();
        T.MeshStandardMaterial.prototype.copy.call(replacement, mat);
        replacement.onBeforeCompile = mat.onBeforeCompile;
        // Keep refraction and layered BRDFs on high/ultra. The street already
        // has depth on low; a thin reflective pane avoids a transmission pass.
        if (mat.transmission > 0) {
          replacement.transparent = true;
          replacement.opacity = 0.14;
          replacement.depthWrite = false;
        }
        simplified.set(mat, replacement);
      }
      o.material = simplified.get(mat);
    });
    // Animated emissive references must point at the replacement too.
    for (const key of Object.keys(world)) {
      if (simplified.has(world[key])) world[key] = simplified.get(world[key]);
    }
    simplified.forEach((replacement, original) => original.dispose());
  }
  const hemi = new T.HemisphereLight(0x9aaebc, 0x20232a, 0.035);
  scene.add(hemi);
  const moon = new T.SpotLight(0x9fc7e4, 240, 18, 0.46, 0.7, 2);
  moon.position.set(0.5, 5.5, -8);
  moon.target.position.set(0.1, 0, -7);
  scene.add(moon, moon.target);
  moon.castShadow = quality !== "low";
  moon.shadow.mapSize.setScalar(quality === "ultra" ? 2048 : 1024);
  moon.shadow.bias = -0.0002;
  moon.shadow.normalBias = 0.03;
  moon.shadow.autoUpdate = false;
  moon.shadow.needsUpdate = true;
  const flash = new T.SpotLight(0xffe6c5, 30, 14, 0.49, 0.65, 2);
  flash.castShadow = quality !== "low";
  flash.shadow.mapSize.setScalar(1024);
  flash.shadow.bias = -0.0001;
  flash.shadow.normalBias = 0.025;
  scene.add(flash, flash.target);
  const cookieData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const v = Math.round(
        255 *
          Math.max(
            0,
            (Math.exp(-r * r * 6) * 0.82 +
              Math.exp(-(((r - 0.66) / 0.13) ** 2)) * 0.09) *
              (1 - Math.min(1, r) ** 4),
          ),
      );
      cookieData.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  const cookie = new T.DataTexture(cookieData, 64, 64);
  cookie.needsUpdate = true;
  cookie.minFilter = cookie.magFilter = T.LinearFilter;
  flash.map = cookie;
  const torchBounce = new T.PointLight(0xe3c8a4, 0, 4, 2);
  scene.add(torchBounce);
  const hitRay = new T.Ray();
  const hitPoint = new T.Vector3();
  const hitBoxes = window.ProofOfWork.layout
    .filter((o) => o.kind !== "room")
    .map(
      (o) =>
        new T.Box3(
          new T.Vector3(o.bounds[0], o.bottom || 0, o.bounds[2]),
          new T.Vector3(o.bounds[1], (o.bottom || 0) + o.height, o.bounds[3]),
        ),
    );
  const indirect = await bakeIrradiance(scene, progress);
  const cubeTarget = new T.WebGLCubeRenderTarget(
    quality === "ultra" ? 256 : 128,
    {
      type: T.HalfFloatType,
      generateMipmaps: true,
      minFilter: T.LinearMipmapLinearFilter,
    },
  );
  const cube = new T.CubeCamera(0.1, 40, cubeTarget);
  cube.position.set(0, 2, -7);
  scene.add(cube);
  const pmrem = new T.PMREMGenerator(renderer);
  const environments = [];
  const reflective = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.material || !("envMap" in o.material)) return;
    const z = o.getWorldPosition(new T.Vector3()).z;
    reflective.push({
      material: o.material,
      region: o.userData.room ?? (z > 0 ? 0 : z < -16 ? 2 : 1),
    });
  });
  function setPower(power) {
    world.lamps.forEach((l, i) => {
      l.color.set(power === 4 ? 0xffbf80 : 0xffead3);
      l.intensity = i < power ? (power === 4 ? 320 : 150) : 0;
    });
    world.bankFills.forEach((l, i) => {
      l.intensity = i < power ? (power === 4 ? 10 : 6) : 0;
    });
    world.controlLamp.intensity = power >= 3 ? 60 : 0;
    world.controlFill.intensity = power >= 3 ? 4 : 0;
    world.ledMaterials.forEach((m, i) => {
      m.emissiveIntensity = i < power ? 0.75 : 0.045;
    });
  }
  function useProbes(power) {
    indirect.setStage(power);
    reflective.forEach(({ material, region }) => {
      material.envMap = environments[power][region].texture;
    });
    scene.environment = environments[power][1].texture;
  }
  // Auxiliary normal/depth passes must not render reflections or fresh shadow
  // maps. Transparent water, glass and haze also aren't solid depth surfaces.
  const visualLayers = [];
  scene.traverse((o) => {
    if (o.isMesh && (o.material.transparent || o.material.transmission > 0))
      visualLayers.push(o);
  });
  function depthPass(pass) {
    const render = pass.render.bind(pass);
    pass.render = (...args) => {
      const visible = visualLayers.filter((o) => o.visible);
      const shadowUpdate = renderer.shadowMap.autoUpdate;
      visible.forEach((o) => {
        o.visible = false;
      });
      renderer.shadowMap.autoUpdate = false;
      try {
        return render(...args);
      } finally {
        visible.forEach((o) => {
          o.visible = true;
        });
        renderer.shadowMap.autoUpdate = shadowUpdate;
      }
    };
    return pass;
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (quality !== "low") {
    ao = depthPass(new GTAOPass(scene, camera, 480, 270));
    ao.updateGtaoMaterial({ radius: 0.55, thickness: 0.7, samples: 12 });
    ao.updatePdMaterial({ radius: 5, lumaPhi: 5, depthPhi: 2, normalPhi: 3 });
    ao.blendIntensity = 0.8;
    composer.addPass(ao);
  }
  const dof = depthPass(
    new BokehPass(scene, camera, {
      focus: 0.6,
      aperture: 0.0015,
      maxblur: 0.009,
    }),
  );
  dof.enabled = false;
  composer.addPass(dof);
  const bloom = new UnrealBloomPass(new T.Vector2(480, 270), 0.065, 0.35, 2.2);
  composer.addPass(bloom);
  const aa = new SMAAPass();
  composer.addPass(aa);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      fade: { value: 0 },
    },
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform float time;uniform float fade;varying vec2 v;void main(){vec3 c=texture2D(tDiffuse,v).rgb;float grain=fract(sin(dot(v+time,vec2(12.9898,78.233)))*43758.5453)-.5;c+=grain*.003;c*=1.-.10*pow(length((v-.5)*1.4),2.);gl_FragColor=vec4(c*(1.-fade),1.);}`,
  });
  composer.addPass(grade);

  const meterTarget = new T.WebGLRenderTarget(1, 1);
  const meter = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;void main(){float l=0.;for(int y=0;y<4;y++)for(int x=0;x<4;x++){vec3 c=texture2D(tDiffuse,(vec2(float(x),float(y))+.5)/4.).rgb;l+=dot(c,vec3(.2126,.7152,.0722));}gl_FragColor=vec4(vec3(l/16.),1.);}`,
  });
  let metering = false,
    meterAt = 0,
    exposureTarget = 1.2;
  let width = 0,
    height = 0,
    scale = resolution.update(0, 16.7),
    last = 0,
    average = 16.7,
    frames = 0,
    stage = -1,
    sound = null,
    disposed = false,
    lookX = 0,
    lookY = 0,
    drag = null,
    releasingCapture = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controller = new AbortController(),
    opts = { signal: controller.signal };
  function look(dx, dy) {
    lookX += dx * 0.002;
    lookY += dy * 0.002;
  }
  canvas.addEventListener(
    "click",
    () => {
      if (callbacks.active() && !matchMedia("(pointer: coarse)").matches)
        canvas.requestPointerLock()?.catch(() => {});
    },
    opts,
  );
  document.addEventListener(
    "mousemove",
    (e) => {
      if (document.pointerLockElement === canvas)
        look(e.movementX, e.movementY);
    },
    opts,
  );
  document.addEventListener(
    "pointerlockchange",
    () => {
      if (document.pointerLockElement === canvas) {
        releasingCapture = false;
        return;
      }
      if (releasingCapture) {
        releasingCapture = false;
        return;
      }
      if (callbacks.active()) callbacks.pause();
    },
    opts,
  );
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") {
        drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    opts,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (drag) {
        look((e.clientX - drag.x) * 1.8, (e.clientY - drag.y) * 1.8);
        drag = { x: e.clientX, y: e.clientY };
      }
    },
    opts,
  );
  canvas.addEventListener(
    "pointerup",
    () => {
      drag = null;
    },
    opts,
  );
  canvas.addEventListener(
    "pointercancel",
    () => {
      drag = null;
    },
    opts,
  );
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      callbacks.error("Graphics context lost. Reload to restore Level 8.");
      callbacks.pause();
    },
    opts,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) callbacks.pause();
    },
    opts,
  );
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w * scale, h * scale, false);
    composer.setSize(w * scale, h * scale);
    ao?.setSize(w * scale * 0.5, h * scale * 0.5);
    bloom.setSize(w * scale * 0.5, h * scale * 0.5);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }
  function updateBoard(text) {
    const next = label(text, 1024, 160, "#9ae7c6", "#09201c");
    world.board.material.map.dispose();
    world.board.material.map = next.map;
    world.board.material.emissiveMap = next.map;
    next.dispose();
  }
  let boardPhase = -1;
  const bankStarts = [null, null, null];
  function draw(sim, mode, time, audio) {
    if (disposed || document.hidden) return;
    const now = performance.now(),
      elapsed = last ? now - last : 16.7,
      dt = Math.min(elapsed / 1000, 0.1);
    last = now;
    average += (elapsed - average) * 0.04;
    frames++;
    const nextScale = resolution.update(now, elapsed);
    if (nextScale !== scale) {
      scale = nextScale;
      width = 0;
    }
    const resized = resize();
    const s = sim.state,
      p = s.player;
    if (mode === "playing") {
      p.yaw -= lookX;
      p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - lookY));
    }
    lookX = lookY = 0;
    if (mode === "title") {
      camera.position.set(0.3 + Math.sin(now * 0.00008) * 0.25, 1.85, -1.1);
      camera.rotation.set(-0.04, -0.05 + Math.sin(now * 0.00012) * 0.35, 0);
    } else {
      camera.position.set(
        p.x,
        p.y + (reduced ? 0 : Math.sin(s.steps * 7) * 0.018),
        p.z,
      );
      camera.rotation.set(p.pitch, p.yaw, 0);
    }
    const fov = s.ending ? 46 : 68 + (Math.hypot(p.vx, p.vz) > 2.6 ? 4 : 0);
    camera.fov += (fov - camera.fov) * 0.06;
    camera.updateProjectionMatrix();
    flash.position.lerp(camera.position, 0.35);
    const dir = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flash.target.position.copy(camera.position).addScaledVector(dir, 4);
    flash.intensity = s.flashlight ? flash.intensity : 0;
    if (frames % 6 === 0) {
      hitRay.set(camera.position, dir);
      let nearest = 10;
      for (const box of hitBoxes)
        if (hitRay.intersectBox(box, hitPoint))
          nearest = Math.min(nearest, hitPoint.distanceTo(camera.position));
      torchBounce.position
        .copy(camera.position)
        .addScaledVector(dir, Math.max(0.2, nearest - 0.3));
      flash.intensity = s.flashlight
        ? s.mining && p.z < -18
          ? 3
          : Math.max(8, Math.min(100, nearest * nearest * 8))
        : 0;
      torchBounce.intensity =
        s.flashlight && nearest > 1.5
          ? Math.min(0.8, 3 / (1 + nearest * nearest * 0.2))
          : 0;
    }
    const beaconPulse = reduced ? 1 : 0.8 + 0.2 * Math.sin(now * 0.0008);
    world.red.emissiveIntensity = beaconPulse * 0.6;
    world.beacons.forEach((l) => {
      l.intensity = beaconPulse * 5;
    });
    world.controlLamp.intensity = s.stage === 3 ? 60 : 0;
    world.controlFill.intensity = s.stage === 3 ? 4 : 0;
    const power = s.stage + (s.mining ? 1 : 0);
    world.ledMaterials.forEach((mat, i) => {
      if (!s.breakers[i]) bankStarts[i] = null;
      else if (bankStarts[i] === null) bankStarts[i] = now;
      mat.userData.clock.value = reduced ? 0 : now / 1000;
      mat.userData.age.value = reduced
        ? 100
        : bankStarts[i] === null
          ? 0
          : (now - bankStarts[i]) / 1000;
      mat.emissiveIntensity = s.breakers[i] ? 0.75 : 0.045;
      mat.color.set(s.breakers[i] ? 0x7faaa0 : 0x27403a);
    });
    world.bankFills.forEach((l, i) => {
      l.intensity = s.breakers[i] ? (s.mining ? 10 : 6) : 0;
    });
    world.lamps.forEach((l, i) => {
      l.color.lerp(new T.Color(s.mining ? 0xffbf80 : 0xffead3), 0.025);
      l.intensity = s.breakers[i] ? (s.mining ? 320 : 150) : 0;
    });
    world.handles.forEach(
      (h, i) =>
        (h.rotation.x +=
          (s.breakers[i] ? -0.9 - h.rotation.x : 0.5 - h.rotation.x) * 0.12),
    );
    world.fans.forEach(({ fan, bank, dead }, i) => {
      if (s.breakers[bank] && !dead) fan.rotation.z += dt * 20;
      fan.updateWorldMatrix(true, false);
      world.fanInstances.setMatrixAt(i, fan.matrixWorld);
    });
    world.fanInstances.instanceMatrix.needsUpdate = true;
    world.door.position.x = s.doorOpen * 1.8;
    world.doorStatus.color.set(s.stage === 3 ? 0x65ffab : 0xdd4424);
    world.doorStatus.emissive.copy(world.doorStatus.color);
    world.lever.rotation.x +=
      ((s.mining ? -0.75 : 0.45) - world.lever.rotation.x) * 0.08;
    world.tray.position.z = -19.8 + s.coinTrayOpen * 0.52;
    world.coin.visible = s.mining >= 6;
    if (s.ending) {
      camera.position.lerp(new T.Vector3(-0.4, 1.55, -18.85), 0.05);
      camera.lookAt(-0.4, 1.05, -19.28);
    }
    const b = s.mining >= 6 ? 200 : s.mining ? Math.floor(s.mining * 3) + 1 : 0;
    if (b !== boardPhase) {
      boardPhase = b;
      updateBoard(
        b === 200
          ? "BLOCK FOUND / 000008"
          : b > 0
            ? `${((s.mining / 6) * 21).toFixed(2)} EH/s / VERIFYING`
            : "0.00 EH/s / OFFLINE",
      );
    }
    dof.enabled = s.mining >= 6 && Math.hypot(p.x + 0.4, p.z + 19.28) < 1.2;
    dof.uniforms.focus.value = camera.position.distanceTo(
      new T.Vector3(-0.4, 1.05, -19.28),
    );
    if (
      power !== stage ||
      (b === 200 && world.crt.userData.accepted !== true)
    ) {
      stage = power;
      world.crt.userData.accepted = b === 200;
      const screen = label(
        s.mining >= 6
          ? "BLOCK ACCEPTED\n000008 / VERIFIED"
          : s.mining
            ? "VERIFYING\nSHA-256"
            : s.stage === 3
              ? "NODE 0008\nREADY TO MINE"
              : "NODE 0008\nSTANDBY",
        512,
        320,
        "#76b794",
        "#06100c",
      );
      world.crt.material.map.dispose();
      world.crt.material.map = world.crt.material.emissiveMap = screen.map;
      screen.dispose();
      useProbes(power);
    }
    world.windowTime.value = reduced ? 0 : now / 1000;
    fx.update(reduced ? 0 : now / 1000, camera, s.flashlight);
    grade.uniforms.time.value = now / 1000;
    grade.uniforms.fade.value = Math.max(0, (s.ending - 1.3) / 0.9);
    if (audio.ctx && !sound) sound = createAudio(audio.ctx, audio.master);
    sound?.update(s, mode === "playing" && callbacks.active() && audio.enabled);
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.toneMappingExposure +=
      (exposureTarget - renderer.toneMappingExposure) *
      (1 - Math.exp(-dt * 0.7));
    composer.render();
    if (now - meterAt > 500 && !metering) {
      metering = true;
      meterAt = now;
      meter.render(renderer, meterTarget, composer.readBuffer);
      renderer
        .readRenderTargetPixelsAsync(meterTarget, 0, 0, 1, 1, new Uint8Array(4))
        .then((pixel) => {
          if (!disposed)
            exposureTarget = T.MathUtils.clamp(
              renderer.toneMappingExposure *
                Math.sqrt(0.23 / Math.max(0.06, pixel[0] / 255)),
              0.75,
              s.stage === 3 && camera.position.z < -16 ? 0.9 : 1.4,
            );
        })
        .catch(() => {})
        .finally(() => {
          metering = false;
        });
      renderer.setRenderTarget(null);
    }
    callbacks.hud(sim.objective(), sim.target(), time);
    if (resized) resolution.resized(performance.now());
  }
  // All power states are cached before START. Light membership and shadow
  // flags stay identical in cube, reflection and main-camera renders.
  resize();
  // A black environment fixes the environment shader variant even during
  // baking. Captures suppress its contribution rather than removing the map.
  const emptyEnvironment = pmrem.fromCubemap(cubeTarget.texture);
  reflective.forEach(({ material }) => {
    material.envMap = emptyEnvironment.texture;
    material.userData.probeIntensity ??= material.envMapIntensity;
    material.envMapIntensity = 0;
  });
  scene.environment = emptyEnvironment.texture;
  scene.environmentIntensity = 0;
  world.coin.visible = true;
  flash.intensity = 0;
  world.floor.visible = false;
  // The scene is always rendered into HDR targets, whose material variant
  // has no tone mapping. ACES belongs to OutputPass, not these materials.
  renderer.toneMapping = T.NoToneMapping;
  renderer.setRenderTarget(cubeTarget);
  const compileObjects = [];
  scene.traverse((o) => {
    if (o.material) compileObjects.push(o);
  });
  for (let power = 0; power < 5; power++) {
    setPower(power);
    environments[power] = [];
    await progress(`Compiling power state ${power + 1}/5`);
    if (power === 0) {
      for (let offset = 0; offset < compileObjects.length; offset += 16) {
        const batch = new T.Group();
        // Compile-only references: do not reparent the actual world objects.
        batch.children = compileObjects.slice(offset, offset + 16);
        await renderer.compileAsync(batch, camera, scene);
        await progress(
          `Compiling surfaces ${Math.min(offset + 16, compileObjects.length)}/${compileObjects.length}`,
        );
      }
    } else await renderer.compileAsync(scene, camera);
    for (const [region, pose] of [
      [0, [0, 1.6, 4]],
      [1, [0, 2, -7]],
      [2, [0, 1.6, -18]],
    ]) {
      cube.position.set(...pose);
      cube.update(renderer, scene);
      environments[power][region] = pmrem.fromCubemap(cubeTarget.texture);
      await progress(`Baking reflections ${power * 3 + region + 1}/15`);
    }
  }
  useProbes(0);
  reflective.forEach(({ material }) => {
    material.envMapIntensity = material.userData.probeIntensity * 0.85;
  });
  scene.environmentIntensity = 0.3;
  emptyEnvironment.dispose();
  world.floor.visible = true;
  flash.intensity = 11;
  dof.enabled = true;
  await progress("Compiling reflections, shadows and focus…");
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  for (const pose of [
    [0, 1.68, 6.5],
    [0, 1.8, -1],
    [0, 1.6, -18],
  ]) {
    camera.position.set(...pose);
    composer.render();
    await progress("Warming camera passes…");
  }
  meter.render(renderer, meterTarget, composer.readBuffer);
  renderer.setRenderTarget(null);
  dof.enabled = false;
  world.coin.visible = false;
  setPower(0);
  await progress("Preparing room audio…");
  const preparedAudio = callbacks.prepareAudio?.();
  if (preparedAudio?.ctx)
    sound = createAudio(preparedAudio.ctx, preparedAudio.master);
  last = 0;
  resolution.resized(performance.now());
  return {
    draw,
    releaseCapture() {
      if (document.pointerLockElement === canvas) {
        releasingCapture = true;
        document.exitPointerLock();
      }
    },
    sfx: (type, p) => sound?.hit(type, p),
    metrics: () => ({
      quality,
      gpu,
      frameMs: +average.toFixed(2),
      scale,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    dispose() {
      disposed = true;
      controller.abort();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      sound?.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            mat.map?.dispose();
            mat.dispose();
          }
        }
      });
      world.floor.getRenderTarget().dispose();
      world.dispose();
      m.dispose();
      indirect.dispose();
      cookie.dispose();
      meterTarget.dispose();
      meter.dispose();
      environments.flat().forEach((e) => e.dispose());
      cubeTarget.dispose();
      pmrem.dispose();
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
      renderer.dispose();
    },
  };
}
