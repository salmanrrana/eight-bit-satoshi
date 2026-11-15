import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { createPost } from "./post.js";
import { bakeSkyVisibility } from "./skyvis.js";
import { createSky, noiseGLSL } from "./sky.js";
import { createLighting } from "./lighting.js";
import { createKit } from "./kit.js";
import { buildWorld } from "./world.js";
// Probe time on the GPU this level was tuned on (Intel Iris Xe), and the pixel
// count that GPU holds at a good frame rate on the high tier.
const REFERENCE_PROBE_MS = 20,
  REFERENCE_PIXELS = 1280 * 720;
// Time a fixed amount of pixel work so "auto" can place this GPU on a tier
// before anything is built. Returns milliseconds.
function probeGpu(renderer) {
  const target = new T.WebGLRenderTarget(512, 512, { depthBuffer: false });
  const quad = new FullScreenQuad(
    new T.ShaderMaterial({
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: `varying vec2 v;${noiseGLSL}
void main(){float n=0.;vec3 p=vec3(v*40.,1.);for(int i=0;i<24;i++){n+=noise3(p);p=p*1.07+vec3(1.3,2.1,.7);}gl_FragColor=vec4(vec3(n/24.),1.);}`,
    }),
  );
  const pixel = new Uint8Array(4);
  // Reading one pixel back is the only reliable way to wait for the GPU.
  const run = (count) => {
    for (let i = 0; i < count; i++) quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
  };
  renderer.setRenderTarget(target);
  run(1);
  const start = performance.now();
  run(6);
  const ms = performance.now() - start;
  renderer.setRenderTarget(null);
  quad.material.dispose();
  quad.dispose();
  target.dispose();
  return ms;
}
export async function create(canvas, callbacks) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!context)
    throw new Error(
      "First Light needs WebGL2. Enable graphics acceleration and reload.",
    );
  const renderer = new T.WebGLRenderer({ canvas, context });
  const gpuInfo = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = gpuInfo
    ? context.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  // ?q=low|high|ultra pins the tier at full size (tools rely on that). Without
  // it the tier comes from a quick GPU timing, and the render size from how
  // many pixels that GPU can carry. Both are settled before the build and never
  // change during play, so nothing is ever re-allocated mid-run.
  const requested = new URLSearchParams(location.search).get("q"),
    manual = ["low", "high", "ultra"].includes(requested);
  const probeMs = manual ? 0 : probeGpu(renderer),
    speed = REFERENCE_PROBE_MS / Math.max(1, probeMs);
  const quality = manual
    ? requested
    : speed > 3.3
      ? "ultra"
      : speed > 0.62
        ? "high"
        : "low";
  const pixelBudget =
    REFERENCE_PIXELS * speed * { low: 2.2, high: 1, ultra: 0.45 }[quality];
  let scale = 1;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(68, 1, 0.08, 500);
  camera.rotation.order = "YXZ";
  const progress = async (text) => {
    callbacks.progress?.(text);
    await new Promise(requestAnimationFrame);
  };
  await progress("Integrating the night sky…");
  const sky = createSky(renderer, scene, quality);
  await sky.prepare(progress);
  const lighting = createLighting(scene, quality),
    kit = createKit(renderer, lighting, sky.iblUniforms);
  kit.quality = quality;
  const world = await buildWorld({
    T,
    scene,
    renderer,
    quality,
    kit,
    sim: window.FirstLight,
    progress,
  });
  kit.finishBakes();
  // Everything after the scene render (fog, occlusion, anti-aliasing, bloom,
  // tone map, grade) lives in post.js.
  const post = createPost(renderer, {
    quality,
    fogMaterial: lighting.fogMaterial,
  });
  let width = 0,
    height = 0,
    last = 0,
    average = 16.7,
    worst = 0,
    frames = 0,
    disposed = false,
    lookX = 0,
    lookY = 0,
    drag = null,
    releasing = false,
    sound = null,
    audioFactory = null,
    titleEpoch = 0,
    lastMode = "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    controller = new AbortController(),
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
        releasing = false;
        return;
      }
      if (releasing) {
        releasing = false;
        return;
      }
      if (callbacks.active()) callbacks.pause();
    },
    opts,
  );
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch" && drag === null) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    opts,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (drag?.id === e.pointerId) {
        look((e.clientX - drag.x) * 1.8, (e.clientY - drag.y) * 1.8);
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    },
    opts,
  );
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(
      event,
      (e) => {
        if (drag?.id === e.pointerId) drag = null;
      },
      opts,
    );
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      callbacks.error("Graphics context lost. Reload to restore First Light.");
      callbacks.pause();
    },
    opts,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      last = 0;
      if (document.hidden && callbacks.active()) callbacks.pause();
    },
    opts,
  );
  function resize() {
    const w = Math.max(1, canvas.clientWidth),
      h = Math.max(1, canvas.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    if (!manual)
      scale = T.MathUtils.clamp(Math.sqrt(pixelBudget / (w * h)), 0.5, 1);
    renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
    post.setSize(Math.round(w * scale), Math.round(h * scale));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // Colour grade follows the story: cold wet night, blue hour, warm first light.
  // Shadows lean cool and highlights warm throughout; daylight adds saturation.
  function grade(env) {
    const day = T.MathUtils.smoothstep(env.sunDir.y, -0.02, 0.12),
      g = post.grade;
    g.shadowTint.value.setRGB(0.93 + 0.03 * day, 1, 1.07 - 0.02 * day);
    g.highlightTint.value.setRGB(1.04 + 0.03 * day, 1.005, 0.95 - 0.02 * day);
    g.saturation.value = 1.02 + 0.1 * day;
    g.contrast.value = 0.2;
  }
  // Draws one frame. `prepare` runs after the world updates and before the
  // draw; the warm-up uses it to switch hidden objects on for one frame.
  function renderFrame(snapshot, dt, time, fade = 0, prepare) {
    renderer.info.autoReset = false;
    renderer.info.reset();
    // The camera is final here: jitter it before anything copies its matrices.
    post.begin(camera);
    const env = sky.update(snapshot.timeOverride ?? snapshot.progress);
    kit.update(env, reduced ? 0 : time);
    world.update({ snapshot, dt, time: reduced ? 0 : time, camera, env });
    camera.updateMatrixWorld();
    lighting.update(env, camera, dt);
    grade(env);
    prepare?.();
    // Auto exposure: the lit street needs less gain than the open yard, and
    // daylight less than either. Blend by position and time, never by zone.
    const openNight = T.MathUtils.smoothstep(-camera.position.z, 36, 64),
      nightCeiling = 2.2 + 0.6 * openNight;
    post.render(scene, camera, {
      time: reduced ? 0 : time,
      fade,
      dt,
      key: 0.28 + 0.04 * openNight,
      ceiling:
        nightCeiling -
        (nightCeiling - 1.7) * T.MathUtils.smoothstep(env.progress, 0.35, 0.72),
    });
  }
  function draw(sim, mode, time, audio) {
    if (disposed || document.hidden) return;
    const now = performance.now(),
      elapsed = last ? now - last : 16.7,
      dt = Math.min(elapsed / 1000, 0.1);
    last = now;
    average += (elapsed - average) * 0.025;
    worst = Math.max(worst, elapsed);
    frames++;
    resize();
    if (mode !== lastMode) {
      // A run always opens on the night street: start its exposure settled there.
      if (mode === "playing") {
        post.seedExposure(1.95);
        post.reset();
      }
      lastMode = mode;
    }
    const s = sim.state,
      p = s.player;
    if (mode === "playing" && callbacks.active()) {
      p.yaw -= lookX;
      p.pitch = T.MathUtils.clamp(p.pitch - lookY, -1.35, 1.35);
    }
    lookX = lookY = 0;
    let snapshot = sim.snapshot(),
      fade = 0;
    if (mode === "title") {
      const t = s.timeOverride ?? ((now - titleEpoch) / 40000) % 1,
        routeS = t * 300,
        q = window.FirstLight.at(routeS),
        ahead = window.FirstLight.at(Math.min(300, routeS + 12));
      // High over the rooftops, then gliding down to skim the meadow.
      camera.position.set(
        q.x - 4,
        Math.max(0, window.FirstLight.groundY(q.x, q.z)) +
          T.MathUtils.lerp(16, 3.6, T.MathUtils.smoothstep(routeS, 80, 135)),
        q.z + 4,
      );
      camera.lookAt(
        ahead.x,
        window.FirstLight.groundY(ahead.x, ahead.z) + 2,
        ahead.z,
      );
      snapshot = {
        ...snapshot,
        progress: t,
        zone: Math.min(
          6,
          window.FirstLight.ZONES.findIndex(
            (z) => routeS >= z.s0 && routeS < z.s1,
          ),
        ),
        blocks: snapshot.blocks.map(() => ({ risen: 1, lit: true })),
      };
      fade = Math.max(0, 1 - Math.min(t, 1 - t) * 65);
    } else {
      camera.position.set(
        p.x,
        p.y +
          1.68 +
          (reduced || !p.grounded ? 0 : Math.sin(s.steps * 7) * 0.018),
        p.z,
      );
      camera.rotation.set(p.pitch, p.yaw, 0);
      fade = Math.max(s.fade, T.MathUtils.clamp((s.ending - 1.6) / 0.8, 0, 1));
    }
    const fov = 68 + (Math.hypot(p.vx, p.vz) > 4 ? 3 : 0);
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 5));
    camera.updateProjectionMatrix();
    renderFrame(snapshot, dt, now / 1000, fade);
    if (audio.ctx && !sound && audioFactory) {
      try {
        sound = audioFactory(audio.ctx, audio.master);
      } catch (error) {
        console.warn("First Light audio unavailable", error);
        audioFactory = null;
      }
    }
    try {
      sound?.update(
        {
          ...snapshot,
          active: mode === "playing" && callbacks.active() && audio.enabled,
        },
        dt,
      );
    } catch (error) {
      console.warn("First Light audio stopped", error);
      sound?.dispose();
      sound = null;
      audioFactory = null;
    }
    callbacks.hud(
      `${sim.objective()} · ${s.pagesTaken.filter(Boolean).length}/9 pages`,
      sim.target(),
      time,
    );
  }
  await progress("Compiling all surfaces and shadow variants…");
  // Thin transparent cards need one pass, not three.js's back-then-front pair.
  scene.traverse((o) => {
    for (const m of [o.material].flat())
      if (m?.transparent && m.side === T.DoubleSide) m.forceSinglePass = true;
  });
  world.showAll();
  // With every zone visible: bake where the sky can be seen from (skyvis.js).
  const skyVisibility = bakeSkyVisibility(renderer, scene, window.FirstLight);
  kit.uniforms.flSkyVis.value = skyVisibility.texture;
  camera.position.set(20, 4, -100);
  // Compile everything in one parallel batch: the scene against the linear HDR
  // target it really draws to (compiling against the screen would also build
  // unused tone-mapped variants), and every post-chain shader beside it.
  const triangle = new T.PlaneGeometry(2, 2),
    offscreen = new T.Scene(),
    onscreen = new T.Scene();
  // FullScreenQuad has position/UV only. A normal attribute creates a second
  // shader variant in Three r187 even when the post shader never reads normals.
  triangle.deleteAttribute("normal");
  for (const m of [...post.materials.offscreen, lighting.fogMaterial])
    offscreen.add(new T.Mesh(triangle, m));
  for (const m of post.materials.screen) onscreen.add(new T.Mesh(triangle, m));
  const previousTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(post.sceneTarget);
  const compiling = [
    renderer.compileAsync(scene, camera),
    renderer.compileAsync(offscreen, camera),
  ];
  renderer.setRenderTarget(null);
  compiling.push(renderer.compileAsync(onscreen, camera));
  // One long wait with no GPU calls to spare: tick the text so it never looks hung.
  const since = performance.now();
  const ticker = setInterval(
    () =>
      callbacks.progress?.(
        `Compiling shaders… ${Math.round((performance.now() - since) / 1000)} s. Only the first visit is slow.`,
      ),
    1000,
  );
  try {
    await Promise.all(compiling);
  } finally {
    clearInterval(ticker);
    renderer.setRenderTarget(previousTarget);
    triangle.dispose();
  }
  // Render each zone before START, including depth, sun shadows and post chain.
  resize();
  const preview = window.FirstLight.create().snapshot();
  preview.blocks.forEach((b) => (b.risen = 1));
  for (let i = 0; i < 7; i++) {
    await progress(`Warming zone ${i + 1}/7…`);
    const q = window.FirstLight.at(window.FirstLight.ZONES[i].s0 + 5);
    camera.position.set(q.x, window.FirstLight.groundY(q.x, q.z) + 1.68, q.z);
    camera.rotation.set(0, 0, 0);
    preview.zone = i;
    preview.progress = window.FirstLight.ZONES[i].s0 / 300;
    // Draw the whole zone, seen or not, so every buffer and texture is on the
    // GPU before START and nothing uploads on first sight.
    const unseen = [];
    world.groups[i].traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        unseen.push(o);
      }
    });
    renderFrame(preview, 1, 0);
    unseen.forEach((o) => (o.frustumCulled = true));
  }
  // One black frame with every switched-off object shown (genesis block, node
  // glows, finale, mid-run effects), so nothing is used for the first time in play.
  const restore = [];
  const show = (target, key) => {
    restore.push([target, key, target[key]]);
    target[key] = key === "visible";
  };
  renderFrame(preview, 1, 0, 1, () =>
    scene.traverse((o) => {
      if (!o.visible) show(o, "visible");
      if (o.frustumCulled) show(o, "frustumCulled");
      for (const m of [o.material].flat())
        if (m && !m.visible) show(m, "visible");
    }),
  );
  restore.forEach(([target, key, value]) => (target[key] = value));
  renderer.setRenderTarget(null);
  // The title opens in daylight; draw() reseeds for the street when a run starts.
  post.seedExposure(1.3);
  post.reset();
  await progress("Preparing sound…");
  try {
    const module = await import("./audio.js");
    audioFactory = module.createAudio;
  } catch (error) {
    console.warn("First Light running silently", error);
  }
  callbacks.prepareAudio?.();
  last = 0;
  titleEpoch = performance.now() - 0.56 * 40000; // open over the meadow at first light
  return {
    draw,
    releaseCapture() {
      if (document.pointerLockElement === canvas) {
        releasing = true;
        document.exitPointerLock();
      }
    },
    sfx(type, position) {
      try {
        sound?.hit(type, position);
      } catch {
        /* Optional audio never blocks a run. */
      }
    },
    metrics: () => ({
      gpu,
      localLights: lighting.lightCount,
      skySamples: sky.samples,
      quality,
      scale,
      frameMs: +average.toFixed(2),
      worstFrameMs: +worst.toFixed(2),
      frames,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs.length,
      surfacePrograms: renderer.info.programs.filter((p) =>
        p.cacheKey.includes("first-light-surface"),
      ).length,
      postProgramVariants: [
        ...post.materials.offscreen,
        ...post.materials.screen,
      ].map((m) => renderer.properties.get(m).programs?.size ?? 0),
      exposure: post.exposure(),
      probeMs: +probeMs.toFixed(1),
    }),
    dispose() {
      disposed = true;
      controller.abort();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      sound?.dispose();
      world.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
      });
      kit.dispose();
      sky.dispose();
      lighting.dispose();
      post.dispose();
      skyVisibility.dispose();
      renderer.dispose();
    },
  };
}
