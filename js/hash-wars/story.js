import { materials } from "./story-materials.js";
import { props } from "./story-props.js";
import { relics } from "./story-relics.js";

/** Interactive world dressing. Simulation remains the authority for every use. */
export async function build(ctx) {
  const roots = [];
  for (const solid of ctx.sim.layout)
    if (solid.owner === "story") ctx.claimSolid?.(solid);
  const own = (object, parent) => {
    object.userData.hashWarsPackage = "story";
    parent.add(object);
    roots.push(object);
    return object;
  };
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const mat = materials(ctx);
  const equipment = await props(ctx, mat, own, preference);
  const archive = relics(ctx, mat, own, preference);
  // Stable, world-space target for LEAD's HUD; never write into the snapshot.
  // Consumers can retain this object, or find scene's named story-objective node.
  const objective = archive.objective;
  const counts = { ...equipment.counts, ...archive.counts };
  return {
    objective,
    counts,
    update(frame) {
      equipment.update(frame);
      archive.update(frame);
    },
    dispose() {
      equipment.dispose();
      archive.dispose();
      roots.forEach((root) => root.removeFromParent());
      mat.dispose();
    },
  };
}
