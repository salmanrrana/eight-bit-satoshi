import { buildField } from "./flora-field.js";
import { buildGrass } from "./flora-grass.js";
import { buildPlants } from "./flora-plants.js";

/** High-summer meadow: stable world-space blades, planted drifts and soft scrub.
 * All geometry and materials exist before START; playback only changes shared
 * uniforms and visibility. Fine vegetation never casts a shadow map of its own.
 */
export async function build(ctx) {
  const { T } = ctx;
  const field = buildField(T, ctx.sim);
  const white = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  const motion = {
    floraTime: { value: 0 },
    floraWind: { value: 0.4 },
    floraEye: { value: new T.Vector3() },
    floraSun: { value: new T.Vector3(0, 1, 0) },
    // White fallback also supports isolated content views without a cloud field.
    floraCloud: { value: 0 },
    floraCloudMap: { value: white },
    floraCloudBounds: { value: new T.Vector4(-1, -1, 2, 2) },
  };
  const grass = buildGrass(ctx, field, motion);
  const plants = buildPlants(ctx, field, motion);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    update(frame) {
      motion.floraEye.value.copy(frame.camera.position);
      motion.floraSun.value.copy(frame.env.sunDir);
      motion.floraTime.value = reduced ? 0 : frame.time;
      motion.floraWind.value = frame.env.wind;
      // Use the backbone's projection so cloud shade stays aligned with LAND.
      const cloud = frame.env.cloudShadow;
      motion.floraCloud.value = cloud?.texture ? (cloud.strength ?? 1) : 0;
      motion.floraCloudMap.value = cloud?.texture ?? white;
      if (cloud?.bounds?.isVector4)
        motion.floraCloudBounds.value.copy(cloud.bounds);
      else if (Array.isArray(cloud?.bounds))
        motion.floraCloudBounds.value.fromArray(cloud.bounds);
      grass.update(frame);
      plants.update(frame);
    },
    dispose() {
      grass.dispose();
      plants.dispose();
      field.texture.dispose();
      white.dispose();
    },
  };
}
