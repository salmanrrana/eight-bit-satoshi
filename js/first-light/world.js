import * as T from "three";
export async function buildWorld(ctx) {
  const groups = Array.from({ length: 7 }, () => {
    const g = new T.Group();
    ctx.scene.add(g);
    return g;
  });
  const zoneGroup = (n) => groups[n];
  const modules = [];
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:";
  const filter = local
    ? new URLSearchParams(location.search).get("mods")
    : null;
  for (const name of ["city", "river", "hills", "story"]) {
    if (filter !== null && !filter.split(",").includes(name)) continue;
    await ctx.progress(`Building ${name}…`);
    try {
      const module = await import(`./${name}.js`);
      modules.push(await module.build({ ...ctx, zoneGroup }));
    } catch (error) {
      if (!local) throw error;
      console.error(`First Light ${name} failed`, error);
    }
  }
  return {
    groups,
    update(frame) {
      groups.forEach((g, i) => {
        g.visible = Math.abs(i - frame.snapshot.zone) <= 1;
      });
      modules.forEach((m) => m.update(frame));
    },
    showAll() {
      groups.forEach((g) => (g.visible = true));
    },
    dispose() {
      modules.forEach((m) => m.dispose());
      groups.forEach((g) => {
        g.traverse((o) => {
          o.geometry?.dispose();
          if (o.material)
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              m.dispose();
        });
        ctx.scene.remove(g);
      });
    },
  };
}
