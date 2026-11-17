import { Float32BufferAttribute } from "three";
/** Shared asset cache. Missing artist files resolve to null: content keeps its grey proxy.
 * load(path), get(path), instantiate(path,{node,lod}), preload(), dispose().
 * Clones share geometry/materials; animate emit channels via uniforms, never new shaders.
 */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { surface, SURFACES } from "../first-light/surfaces.js";
export function createAssets(kit, progress = async () => {}) {
  const loader = new GLTFLoader(),
    cache = new Map(),
    pending = new Map();
  const resources = new Set(),
    surfaceVariants = new Map();
  async function load(path) {
    if (pending.has(path)) return pending.get(path);
    const job = (async () => {
      try {
        const response = await fetch(path);
        if (!response.ok) return null;
        const gltf = await loader.parseAsync(
          await response.arrayBuffer(),
          new URL(".", new URL(path, location.href)).href,
        );
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          // Content mergers consume raw arrays. Decode normalized transport
          // attributes once so their transforms and merges retain glTF values.
          for (const name of ["normal", "tangent", "uv", "uv1"]) {
            const attribute = o.geometry.attributes[name];
            if (!attribute?.normalized) continue;
            const values = new Float32Array(
              attribute.count * attribute.itemSize,
            );
            for (let i = 0; i < attribute.count; i++)
              for (let j = 0; j < attribute.itemSize; j++)
                values[i * attribute.itemSize + j] = attribute.getComponent(
                  i,
                  j,
                );
            o.geometry.setAttribute(
              name,
              new Float32BufferAttribute(values, attribute.itemSize),
            );
          }
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          resources.add(o.geometry);
          o.castShadow = o.receiveShadow = true;
          const apply = (m) => {
            resources.add(m);
            for (const v of Object.values(m))
              if (v?.isTexture) resources.add(v);
            const [rule, name] = m.name.split(":");
            if (rule === "surf" && SURFACES.includes(name)) {
              const key = `${name}:${!!o.geometry.attributes.color}`;
              if (surfaceVariants.has(key)) return surfaceVariants.get(key);
              const world = surface(kit, name, { weather: false });
              // One vertex-AO material per family, shared across every GLB mesh.
              if (o.geometry.attributes.color) {
                const ao = world.clone();
                ao.onBeforeCompile = world.onBeforeCompile;
                ao.customProgramCacheKey = world.customProgramCacheKey;
                ao.vertexColors = true;
                resources.add(ao);
                surfaceVariants.set(key, ao);
                return ao;
              }
              surfaceVariants.set(key, world);
              return world;
            }
            if (rule === "emit") {
              if (m.emissive.getHex() === 0) m.emissive.copy(m.color);
              m.emissiveIntensity = 1.5;
              m.userData.channel = name;
            }
            return m;
          };
          o.material = Array.isArray(o.material)
            ? o.material.map(apply)
            : apply(o.material);
        });
        cache.set(path, gltf.scene);
        return gltf.scene;
      } catch (error) {
        console.warn("HASH WARS asset fallback:", path, error);
        return null;
      }
    })();
    pending.set(path, job);
    return job;
  }
  return {
    load,
    get: (path) => cache.get(path) ?? null,
    instantiate(path, { node, lod = false } = {}) {
      const root = cache.get(path);
      if (!root) return null;
      const source = node
        ? ((lod ? root.getObjectByName(node + "_lod1") : null) ??
          root.getObjectByName(node))
        : root;
      if (!source) return null;
      const copy = source.clone(true);
      copy.traverse((o) => {
        // An explicitly requested world/LOD node must itself stay visible.
        if (o === copy && node) return;
        if (o.name.endsWith("_world")) o.visible = false;
        if (o.name.endsWith("_lod1")) o.visible = lod;
        else if (lod && root.getObjectByName(o.name + "_lod1"))
          o.visible = false;
      });
      return copy;
    },
    async preload() {
      for (const pack of ["arms", "machines", "structures", "rocks"]) {
        let manifest;
        try {
          const r = await fetch(`/assets/hash-wars/${pack}/manifest.json`);
          if (r.ok) manifest = await r.json();
        } catch {
          /* Artists may still be exporting. */
        }
        if (!manifest) continue;
        // Accept manifests keyed by filename or containing an assets/files array.
        const paths = new Set(
          JSON.stringify(manifest).match(/[\w-]+\.glb/g) || [],
        );
        for (const file of paths) {
          await progress(`Loading ${pack} · ${file}…`);
          await load(`/assets/hash-wars/${pack}/${file}`);
        }
      }
    },
    dispose() {
      resources.forEach((r) => {
        if (r.isTexture) r.source?.data?.close?.();
        r.dispose();
      });
      cache.clear();
      pending.clear();
      surfaceVariants.clear();
    },
  };
}
