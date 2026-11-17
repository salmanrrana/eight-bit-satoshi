import * as T from "three";
import { createPost } from "./post.js";
import { createSky } from "./sky.js";
import { createLighting } from "./light.js";
import { createKit } from "./kit.js";
import { createAssets } from "./assets.js";
import { bakeSkyVisibility } from "./skyvis.js";
import { buildWorld } from "./world.js";
export async function create(canvas, callbacks) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!context)
    throw new Error(
      "Hash Wars needs WebGL2. Enable graphics acceleration and reload.",
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
  // Manual tiers use full resolution. Auto builds low and adjusts pixel work
  // only after eight seconds of compiled, steady play; light count never changes.
  const requested = new URLSearchParams(location.search).get("q"),
    manual = ["low", "high", "ultra"].includes(requested);
  let quality = manual ? requested : "low";
  const buildQuality = quality;
  let scale = 1;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(68, 1, 0.15, 6000);
  camera.rotation.order = "YXZ";
  const bridge = window.HashWars.layout.find(
    (solid) => solid.kind === "bridge",
  );
  function routeSupport(point) {
    const ground = window.HashWars.groundY(point.x, point.z);
    return bridge &&
      point.x >= bridge.min[0] &&
      point.x <= bridge.max[0] &&
      point.z >= bridge.min[2] &&
      point.z <= bridge.max[2]
      ? Math.max(ground, bridge.max[1])
      : ground;
  }
  const progress = async (text) => {
    callbacks.progress?.(text);
    await new Promise(requestAnimationFrame);
  };
  await progress("Integrating the noon sky…");
  const sky = createSky(renderer, scene, quality);
  await sky.prepare(progress);
  const viewScene = new T.Scene(),
    viewCamera = new T.PerspectiveCamera(58, 1, 0.01, 5),
    viewGroup = new T.Group();
  viewScene.add(viewCamera);
  // Match the playable view pass before compileAsync chooses shader variants.
  viewScene.environment = scene.environment;
  viewScene.environmentIntensity = sky.env.environmentIntensity;
  viewCamera.add(viewGroup);
  const viewFill = new T.HemisphereLight(0xffffff, 0x33333d, 1),
    viewGlow = new T.PointLight(0xffbd7d, 0, 3, 2);
  viewGlow.position.set(0.2, -0.1, -0.3);
  viewCamera.add(viewGlow);
  viewScene.add(viewFill);
  const viewKey = new T.DirectionalLight(0xffffff, 2);
  viewKey.position.set(-1, 2, 3);
  viewKey.castShadow = true;
  viewKey.shadow.mapSize.setScalar(1024);
  Object.assign(viewKey.shadow.camera, {
    left: -1,
    right: 1,
    top: 1,
    bottom: -1,
    near: 0.1,
    far: 10,
  });
  viewKey.shadow.normalBias = 0.002;
  viewCamera.add(viewKey, viewKey.target);
  const lighting = createLighting(scene, quality),
    kit = createKit(renderer, lighting, sky.iblUniforms);
  kit.quality = quality;
  const assets = createAssets(kit, progress);
  await assets.preload();
  const world = await buildWorld({
    assets,
    T,
    scene,
    renderer,
    quality,
    kit,
    sim: window.HashWars,
    viewGroup,
    progress,
  });
  kit.finishBakes();
  world.update({
    snapshot: window.HashWars.create().snapshot(),
    events: [],
    dt: 0,
    time: 0,
    camera,
    env: sky.update(0.5),
  });
  world.showAll();
  const skyVisibility = bakeSkyVisibility(renderer, scene, window.HashWars);
  kit.uniforms.flSkyVis.value = skyVisibility.texture;
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
    lastMode = "",
    fire = false,
    aim = false,
    warm = true,
    stable = 0,
    acousticAge = 1,
    acousticSpace;
  const pendingEvents = [];
  const eventSlots = Array.from({ length: 128 }, () => ({
    type: "",
    from: [0, 0, 0],
    to: [0, 0, 0],
    at: [0, 0, 0],
    normal: [0, 0, 0],
    hit: null,
    enemy: null,
    index: 0,
    kind: "",
  }));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    controller = new AbortController(),
    opts = { signal: controller.signal };
  function sendWeapon() {
    callbacks.weaponInput?.(fire, aim);
  }
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (callbacks.active()) {
        e.preventDefault();
        callbacks.swap?.();
      }
    },
    { ...opts, passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), opts);
  canvas.addEventListener(
    "mousedown",
    (e) => {
      if (!callbacks.active()) return;
      if (e.button === 0) fire = true;
      if (e.button === 2) aim = true;
      sendWeapon();
    },
    opts,
  );
  document.addEventListener(
    "mouseup",
    (e) => {
      if (e.button === 0) fire = false;
      if (e.button === 2) aim = false;
      sendWeapon();
    },
    opts,
  );
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
      if (
        document.pointerLockElement === canvas ||
        (!document.pointerLockElement &&
          callbacks.active() &&
          (fire || aim) &&
          e.buttons)
      )
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
      fire = aim = false;
      sendWeapon();
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
      callbacks.error("Graphics context lost. Reload to restore Hash Wars.");
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
    const w = warm ? 160 : Math.max(1, canvas.clientWidth),
      h = warm ? 90 : Math.max(1, canvas.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;

    renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
    post.setSize(Math.round(w * scale), Math.round(h * scale));
    camera.aspect = w / h;
    viewCamera.aspect = w / h;
    viewCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();
  }
  // Restrained noon grade: cool shade, near-neutral ceramic highlights.
  function grade(env) {
    const day = T.MathUtils.smoothstep(env.sunDir.y, -0.02, 0.12),
      g = post.grade;
    g.shadowTint.value.setRGB(0.93 + 0.03 * day, 1, 1.07 - 0.02 * day);
    g.highlightTint.value.setRGB(1, 1, 1);
    g.saturation.value = 1.02 + 0.02 * day;
    g.contrast.value = 0.08;
  }
  // Draws one frame. `prepare` runs after the world updates and before the
  // draw; the warm-up uses it to switch hidden objects on for one frame.
  function renderFrame(snapshot, dt, time, fade = 0, prepare) {
    renderer.info.autoReset = false;
    renderer.info.reset();
    // The camera is final here: jitter it before anything copies its matrices.
    post.begin(camera);
    const env = sky.update(0.5);
    kit.update(env, reduced ? 0 : time);
    world.update({
      snapshot,
      events: snapshot.events,
      dt,
      time: reduced ? 0 : time,
      camera,
      env,
    });
    camera.updateMatrixWorld();
    const muzzleLocal = viewGroup.userData.hwArmsMuzzleLocal;
    if (muzzleLocal) viewGlow.position.copy(muzzleLocal);
    lighting.effects(
      snapshot,
      camera,
      dt,
      viewGroup.userData.hwArmsMuzzleWorld,
    );
    lighting.update(env, camera, dt);
    viewCamera.position.copy(camera.position);
    viewCamera.quaternion.copy(camera.quaternion);
    viewScene.environment = scene.environment;
    viewFill.color.copy(env.ambient);
    viewFill.intensity = env.fillIntensity;
    viewScene.environmentIntensity = env.environmentIntensity;
    viewKey.intensity = env.sunIntensity;
    viewKey.color.copy(env.sunColour);
    viewKey.position
      .copy(env.sunDir)
      .applyQuaternion(camera.quaternion.clone().invert())
      .multiplyScalar(5);
    viewGlow.color.set(snapshot.weapon.kind === "arc" ? 0x68dfff : 0xffbd7d);
    viewGlow.intensity +=
      ((snapshot.weapon.firing ? 3 : 0) - viewGlow.intensity) *
      (1 - Math.exp(-dt * 10));
    grade(env);
    prepare?.();
    post.render(scene, camera, {
      time: reduced ? 0 : time,
      view: () => {
        if (snapshot.player.armed) renderer.render(viewScene, viewCamera);
      },
      fade,
      dt,
      key: 0.3,
      ceiling: 1.5,
    });
  }
  function draw(sim, mode, time, audio) {
    if (disposed || document.hidden) return;
    const now = performance.now(),
      elapsed = last ? now - last : 16.7,
      dt = Math.min(elapsed / 1000, 0.1);
    last = now;
    average += (elapsed - average) * 0.025;
    if (!warm && mode === "playing") worst = Math.max(worst, elapsed);
    frames++;
    // Auto starts low. Only steady, compiled play can alter pixel work; light count stays fixed.
    if (!manual && mode === "playing" && !warm) {
      stable += dt;
      if (stable > 8) {
        stable = 0;
        const next =
          average > 35
            ? Math.max(0.6, scale - 0.1)
            : average < 13
              ? Math.min(1, scale + 0.1)
              : scale;
        if (next !== scale) {
          scale = next;
          width = 0;
        }
        quality = buildQuality;
      }
    }
    resize();
    if (mode !== lastMode) {
      // Settle exposure before the first playable frame.
      if (mode === "playing") {
        post.seedExposure(1.1);
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
    let snapshot = { ...s },
      fade = 0;
    if (mode === "title") {
      const t = (now - titleEpoch) / 1000;
      const distance = (t * 3) % 425,
        q = window.HashWars.at(distance),
        ahead = window.HashWars.at(Math.min(430, distance + 40));
      camera.position.set(q.x + 8, routeSupport(q) + 12, q.z + 10);
      camera.lookAt(ahead.x, routeSupport(ahead) + 7, ahead.z);
      snapshot = {
        ...snapshot,
        zone: window.HashWars.ZONES.findLastIndex((z) => distance >= z.s0),
        player: { ...snapshot.player, armed: false },
      };
    } else {
      camera.position.set(
        p.x,
        p.y +
          1.68 +
          (reduced || !p.grounded ? 0 : Math.sin(s.steps * 3.5) * 0.018),
        p.z,
      );
      camera.rotation.set(p.pitch, p.yaw, 0);
      fade = Math.max(
        s.fade,
        T.MathUtils.clamp((s.ending - (sim.ENDING_SECONDS - 1.1)) / 1.1, 0, 1),
      );
    }
    const visualAim =
      s.weapon.reload || s.pose === "reload-mid"
        ? 0
        : s.pose === "aim"
          ? 1
          : s.weapon.aim;
    const fov =
      68 -
      visualAim *
        (s.weapon.kind === "rail"
          ? 68 -
            (2 * Math.atan(Math.tan((34 * Math.PI) / 180) / 2.5) * 180) /
              Math.PI
          : 12) +
      (Math.hypot(p.vx, p.vz) > 4 ? 3 : 0);
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 5));
    camera.updateProjectionMatrix();
    snapshot.events = pendingEvents;
    renderFrame(snapshot, dt, now / 1000, fade);
    pendingEvents.length = 0;
    if (audio.ctx && !sound && audioFactory) {
      try {
        sound = audioFactory(audio.ctx, audio.master);
      } catch (error) {
        console.warn("Hash Wars audio unavailable", error);
        audioFactory = null;
      }
    }
    acousticAge += dt;
    if (acousticAge > 0.25) {
      acousticAge = 0;
      const ground = window.HashWars.groundY;
      const cliff =
        Math.max(
          ground(p.x - 3, p.z),
          ground(p.x + 3, p.z),
          ground(p.x, p.z - 3),
          ground(p.x, p.z + 3),
        ) >
        p.y + 2;
      acousticSpace = cliff ? "cliffs" : undefined;
    }
    try {
      sound?.update(
        {
          ...snapshot,
          space: acousticSpace,
          active: mode === "playing" && callbacks.active() && audio.enabled,
        },
        dt,
      );
    } catch (error) {
      console.warn("Hash Wars audio stopped", error);
      try {
        sound?.dispose();
      } catch {
        /* Optional audio must stay optional. */
      }
      sound = null;
      audioFactory = null;
    }
    callbacks.hud(sim.objective(), sim.target(), time, s);
  }
  await progress("Compiling all surfaces and shadow variants…");
  // Thin transparent cards need one pass, not three.js's back-then-front pair.
  scene.traverse((o) => {
    for (const m of [o.material].flat())
      if (m?.transparent && m.side === T.DoubleSide) m.forceSinglePass = true;
  });
  world.showAll();
  camera.position.set(0, 2, -10);
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
    renderer.compileAsync(viewScene, viewCamera),
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
  const previewGame = window.HashWars.create();
  const preview = previewGame.snapshot();
  for (let i = 0; i < world.groups.length; i++) {
    await progress(`Warming arena ${i + 1}/6…`);
    const q = window.HashWars.at(window.HashWars.ZONES[i].s0 + 3);
    camera.position.set(q.x, routeSupport(q) + 1.68, q.z);
    camera.rotation.set(0, 0, 0);
    preview.zone = i;
    preview.weapon.firing = true;
    preview.weapon.heat = preview.weapon.charging = 1;
    preview.weapon.reload = 0.5;
    for (const kind of i === 0
      ? Object.keys(window.HashWars.WEAPONS)
      : ["carbine"]) {
      preview.weapon.kind = kind;
      renderFrame(preview, 1 / 60, 0, 1);
      if (i === 0 && kind === "rail") {
        preview.weapon.reload = 0;
        preview.weapon.aim = 1;
        // Only the rail adds geometry in aim. Warm its scope; unscoped aim
        // reuses the already drawn weapon and needs no extra world pass.
        renderFrame(preview, 0.25, 0, 1);
        preview.weapon.aim = 0;
        preview.weapon.reload = 0.5;
      }
    }
  }
  // Draw pooled effects and hidden geometry before play.
  const restore = [],
    warmedMeshes = new Set();
  const show = (target, key, value = key === "visible") => {
    restore.push([target, key, target[key]]);
    target[key] = value;
  };
  renderFrame(preview, 1, 0, 1, () =>
    [scene, viewScene].forEach((warmScene) =>
      warmScene.traverse((o) => {
        let visible = true;
        // Shared pool clones reuse the same GPU buffers and program. One draw
        // uploads them; drawing every hidden clone only adds loading overdraw.
        // Instanced meshes retain their own per-object instance buffers.
        if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) {
          const key = `${warmScene.uuid}:${o.geometry.uuid}:${[o.material]
            .flat()
            .map((m) => m.uuid)
            .join(",")}:${o.castShadow}:${o.receiveShadow}`;
          visible = !warmedMeshes.has(key);
          warmedMeshes.add(key);
        }
        if (o.visible !== visible) show(o, "visible", visible);
        if (o.frustumCulled) show(o, "frustumCulled");
        for (const m of [o.material].flat())
          if (m && !m.visible) show(m, "visible");
      }),
    ),
  );
  restore.forEach(([target, key, value]) => (target[key] = value));
  // Three shares its default depth material between the two light sets. Seed
  // the view's double-sided depth variant explicitly before it first casts.
  let viewDepthWarmup;
  const viewCaster = viewGroup.getObjectByProperty("castShadow", true);
  if (viewCaster?.geometry) {
    viewDepthWarmup = new T.MeshDepthMaterial({
      side: T.DoubleSide,
      map: [viewCaster.material].flat()[0].map,
    });
    const depthMesh = new T.Mesh(viewCaster.geometry, viewDepthWarmup);
    depthMesh.frustumCulled = false;
    viewCamera.add(depthMesh);
    renderer.setRenderTarget(post.sceneTarget);
    await renderer.compileAsync(viewScene, viewCamera);
    renderer.render(viewScene, viewCamera);
    viewCamera.remove(depthMesh);
  }
  renderer.setRenderTarget(null);
  // The title opens in daylight; draw() reseeds for the street when a run starts.
  post.seedExposure(1.3);
  post.reset();
  await progress("Preparing sound…");
  try {
    const module = await import("./audio.js");
    audioFactory = module.createAudio;
  } catch (error) {
    console.warn("Hash Wars running silently", error);
  }
  const preparedAudio = callbacks.prepareAudio?.();
  if (preparedAudio?.ctx && audioFactory) {
    await progress("Synthesizing sound…");
    try {
      sound = audioFactory(preparedAudio.ctx, preparedAudio.master);
    } catch (error) {
      console.warn("Hash Wars running silently", error);
      audioFactory = null;
    }
  }
  warm = false;
  width = 0;
  resize();
  // Every geometry and weapon has already drawn against the real HDR format.
  // Allocate the full-size post targets once; repeated full-size arena draws
  // add no programs or attachments and make software-rendered loading costly.
  await progress("Settling full-resolution graphics…");
  previewGame.setZone(0);
  const firstFrame = previewGame.snapshot();
  // setZone raises the swap rig; warm the settled first-person presentation.
  firstFrame.weapon.raise = 0;
  camera.position.set(0, routeSupport({ x: 0, z: 0 }) + 1.68, 0);
  camera.rotation.set(0, 0, 0);
  renderFrame(firstFrame, 1 / 60, 0, 1);
  renderFrame(firstFrame, 1 / 60, 0, 1);
  // Loading-only drain: zero-timeout fence polling can remain unsignalled on
  // software WebGL. Never stall the interactive render loop with this call.
  context.finish();
  worst = 0;
  average = 16.7;
  last = 0;
  titleEpoch = performance.now(); // begin the valley flight
  return {
    draw,
    events(events) {
      for (const e of events) {
        if (pendingEvents.length >= 128) break;
        const slot = eventSlots[pendingEvents.length];
        for (const key of ["type", "hit", "enemy", "index", "kind", "weapon"])
          slot[key] = e[key];
        for (const key of ["from", "to", "at", "normal"])
          if (e[key]) for (let i = 0; i < 3; i++) slot[key][i] = e[key][i];
        pendingEvents.push(slot);
      }
    },
    releaseCapture() {
      fire = aim = false;
      sendWeapon();
      if (document.pointerLockElement === canvas) {
        releasing = true;
        document.exitPointerLock();
      }
    },
    sfx(type, position, detail) {
      try {
        sound?.hit(type, position, detail);
      } catch {
        /* Optional audio never blocks a run. */
      }
    },
    metrics: () => ({
      gpu,
      localLights: lighting.lightCount,
      skySamples: sky.samples,
      quality,
      buildQuality,
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
    }),
    dispose() {
      disposed = true;
      controller.abort();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      try {
        sound?.dispose();
      } catch {
        /* Continue releasing graphics. */
      }
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
      viewKey.shadow.map?.dispose();
      viewDepthWarmup?.dispose();
      post.dispose();
      skyVisibility.dispose();
      assets.dispose();
      viewScene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
    },
  };
}
