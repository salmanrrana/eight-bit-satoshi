// Static city details are merged by material: a dense service wall costs a few
// draws, rather than a draw for every pipe clamp, bolt and fence wire.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { surface } from "./surfaces.js";

export function details({ T, kit, quality }, group) {
  const labels = new Map();
  const buckets = new Map(),
    resources = [],
    unregister = [];
  const rotation = new T.Euler(),
    matrix = new T.Matrix4();
  const material = (name, options = {}) => surface(kit, name, options);
  function add(geometry, mat, position, angles = [0, 0, 0]) {
    rotation.set(...angles);
    matrix.compose(
      new T.Vector3(...position),
      new T.Quaternion().setFromEuler(rotation),
      new T.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geometry);
  }
  function box(x, y, z, w, h, d, mat, bevel = 0, angles) {
    add(
      bevel ? kit.roundedBox(w, h, d, bevel) : new T.BoxGeometry(w, h, d),
      mat,
      [x, y, z],
      angles,
    );
  }
  function rod(a, b, radius, mat, sides = 7) {
    const va = new T.Vector3(...a),
      vb = new T.Vector3(...b),
      delta = vb.clone().sub(va);
    const geo = new T.CylinderGeometry(radius, radius, delta.length(), sides);
    geo.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    geo.translate(...va.add(vb).multiplyScalar(0.5).toArray());
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  }
  function plane(x, y, z, w, h, mat, angles = [0, 0, 0]) {
    add(new T.PlaneGeometry(w, h), mat, [x, y, z], angles);
  }
  function label(text, x, y, z, w, h, angles = [0, 0, 0], options = {}) {
    const { distress = false, ...textOptions } = options;
    const cacheKey = JSON.stringify([text, options]);
    if (labels.has(cacheKey)) {
      const mat = labels.get(cacheKey);
      plane(x, y, z, w, h, mat, angles);
      return mat;
    }
    const map = kit.text(text, {
      width: 512,
      height: 256,
      font: 38,
      ...textOptions,
    });
    if (distress) {
      const c = map.image.getContext("2d"),
        w = map.image.width,
        h = map.image.height;
      c.fillStyle = "rgba(43,35,30,.07)";
      for (let i = 0; i < 12; i++)
        c.fillRect((i * 97) % w, (i * 37) % (h / 2), (i % 4) + 1, h);
      c.globalCompositeOperation = "destination-out";
      c.fillStyle = "#000";
      for (let i = 0; i < 45; i++) {
        c.beginPath();
        c.ellipse(
          (i * 47) % w,
          i % 2 ? h : 0,
          3 + (i % 7),
          4 + (i % 13),
          i,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.globalCompositeOperation = "source-over";
      map.needsUpdate = true;
    }
    const mat = kit.material({
      map,
      roughness: 0.88,
      side: T.DoubleSide,
      alphaTest: distress ? 0.35 : 0,
    });
    mat.userData.noReflect = true;
    labels.set(cacheKey, mat);
    plane(x, y, z, w, h, mat, angles);
    return mat;
  }
  function fixture(position, colour, intensity = 20, kind = "lamp") {
    unregister.push(kit.addLightFixture({ position, colour, intensity, kind }));
  }
  function canvasMaterial(draw, options = {}, size = 512) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    draw(canvas.getContext("2d"), size);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    resources.push(map);
    return kit.material({ map, roughness: 0.65, ...options });
  }
  const meshFence = canvasMaterial(
    (c, s) => {
      c.strokeStyle = "#929997";
      c.lineWidth = 2;
      for (let i = -s; i < 2 * s; i += 24) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + s, s);
        c.stroke();
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i - s, s);
        c.stroke();
      }
    },
    {
      transparent: false,
      alphaTest: 0.18,
      metalness: 0.6,
      side: T.DoubleSide,
      alphaToCoverage: quality === "ultra",
    },
  );
  meshFence.map.wrapS = meshFence.map.wrapT = T.RepeatWrapping;
  meshFence.map.repeat.set(1, 1);
  const steel = material("galvanized", { tint: 0x98958d });
  function fence(a, b, height = 2) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(len / 2.5),
      angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      // Each 2.5m bay gets its own UVs; the diamond size stays human-scale.
      plane(x, height / 2, z, len / steps, height, meshFence, [
        0,
        angle + Math.PI / 2,
        0,
      ]);
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      rod([x, 0, z], [x, height + 0.08, z], 0.034, steel);
      box(x, 0.12, z, 0.13, 0.24, 0.13, material("concrete"));
    }
    for (const y of [0.15, height - 0.06])
      rod([a[0], y, a[1]], [b[0], y, b[1]], 0.023, steel);
  }
  function lightPool(x, z, w, d, colour) {
    const mat = canvasMaterial(
      (c, s) => {
        const grad = c.createRadialGradient(
          s / 2,
          s / 2,
          0,
          s / 2,
          s / 2,
          s / 2,
        );
        grad.addColorStop(0, "rgba(255,255,255,.25)");
        grad.addColorStop(0.5, "rgba(255,255,255,.08)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = grad;
        c.fillRect(0, 0, s, s);
        c.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 90; i++)
          c.fillRect(0, (i * 197) % s, s, (i % 3) + 1);
      },
      {
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.35,
        transparent: true,
        depthWrite: false,
        roughness: 0.2,
        metalness: 0.3,
      },
    );
    plane(x, 0.008, z, w, d, mat, [-Math.PI / 2, 0, 0]);
  }
  function flood(x, y, z, intensity = 38) {
    const housing = material("paintedMetal", { tint: 0x798278 });
    const lens = canvasMaterial(
      (c, size) => {
        const gradient = c.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, "#fff3ce");
        gradient.addColorStop(0.45, "#e9ad58");
        gradient.addColorStop(1, "#36240f");
        c.fillStyle = gradient;
        c.fillRect(0, 0, size, size);
      },
      { emissive: 0xffb65c, emissiveIntensity: 4, roughness: 0.22 },
    );
    lens.emissiveMap = lens.map;
    rod([x, 0, z], [x, y + 0.12, z], 0.035, steel);
    rod([x, y + 0.12, z], [x + 0.28, y + 0.12, z], 0.025, steel);
    box(x + 0.28, y + 0.08, z, 0.48, 0.16, 0.38, housing, 0.025);
    const dome = new T.SphereGeometry(
      0.19,
      16,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    dome.scale(1, 0.38, 1);
    add(dome, lens, [x + 0.28, y, z], [Math.PI, 0, 0]);
    rod([x + 0.055, 0.2, z], [x + 0.055, y, z], 0.009, material("rubber"), 5);
    fixture([x + 0.28, y - 0.12, z], 0xffb65c, intensity);
  }
  function finish() {
    for (const [mat, geometries] of buckets) {
      const geo = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      const mesh = new T.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.userData.noSkyVis = Boolean(mat.alphaTest || mat.transparent);
      mesh.userData.noReflect = Boolean(
        group.userData.noReflect ||
        mat.userData.noReflect ||
        mat.transparent ||
        mat.alphaTest ||
        mat.emissive?.getHex(),
      );
      // Thin alpha-tested fences need no expensive shadow pass.
      mesh.castShadow =
        !group.userData.noReflect &&
        !mat.userData.noReflect &&
        !mat.transparent &&
        !mat.alphaTest &&
        !mat.emissive?.getHex();
      group.add(mesh);
      resources.push(geo);
    }
    buckets.clear();
  }
  return {
    box,
    rod,
    plane,
    label,
    fixture,
    flood,
    canvasMaterial,
    material,
    fence,
    lightPool,
    finish,
    shape: add,
    density: quality === "low" ? 1 : quality === "ultra" ? 3 : 2,
    dispose() {
      unregister.forEach((fn) => fn());
      resources.forEach((r) => r.dispose());
    },
  };
}
