// Story dispatcher. Things with game state live in two modules with two owners:
// story-items.js (pages, coins, patrol machines, hazards) and
// story-landmarks.js (genesis PC, node masts, bench, plinth and whitepaper,
// the player's shadow), each exporting the standard `build(ctx)`. On loopback a
// missing or failing part falls back to its Phase A grey box.
const PARTS = [
  ["./story-items.js", greyItems],
  ["./story-landmarks.js", greyLandmarks],
];
export async function build(ctx) {
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:";
  const built = [];
  for (const [path, fallback] of PARTS) {
    try {
      built.push(await (await import(path)).build(ctx));
    } catch (error) {
      if (!local) throw error;
      console.warn(`First Light ${path} unavailable, using grey box`, error);
      built.push(fallback(ctx));
    }
  }
  return {
    update: (frame) => built.forEach((part) => part.update(frame)),
    dispose: () => built.forEach((part) => part.dispose()),
  };
}
// A plain lit box standing in for a story object at entity `e`.
function marker({ kit, zoneGroup }, e, w, h, d, colour, glow = 0) {
  const m = kit.box(
    w,
    h,
    d,
    kit.material({ color: colour, emissive: colour, emissiveIntensity: glow }),
  );
  m.position.set(e.x, e.y + h / 2, e.z);
  m.castShadow = true;
  zoneGroup(e.zone ?? 0).add(m);
  return m;
}
// Phase A grey box: pages, coins, patrol machines and hazards.
function greyItems(ctx) {
  const { sim } = ctx;
  const pages = sim.entities.pages.map((e) => {
    const m = marker(ctx, e, 0.42, 0.6, 0.025, 0xfff2ce, 0.5);
    m.position.y = e.y;
    return m;
  });
  const coins = sim.entities.coins.map((e) => {
    const m = marker(ctx, e, 0.22, 0.22, 0.07, 0xffb634, 0.5);
    m.position.y = e.y;
    return m;
  });
  const bots = sim.entities.enemies.map((e) =>
    marker(ctx, e, 0.9, 0.9, 0.9, 0x55565b),
  );
  sim.entities.hazards.forEach((e) =>
    marker(ctx, e, ...e.size, e.kind === "fire" ? 0xe18731 : 0x8d6de8, 0.8),
  );
  return {
    update({ snapshot: s, time }) {
      pages.forEach((m, i) => {
        m.visible = !s.pagesTaken[i];
        m.rotation.y = time * 0.35;
      });
      coins.forEach((m, i) => {
        m.visible = !s.coinsTaken[i];
        m.rotation.y = time * 1.8;
      });
      bots.forEach((m, i) => {
        const e = s.enemies[i];
        m.position.set(e.x, e.y + 0.45 * (1 - e.squash * 0.9), e.z);
        m.scale.y = 1 - e.squash * 0.9;
        m.rotation.y = e.heading;
      });
    },
    dispose() {},
  };
}
// Phase A grey box: node masts, genesis PC, bench, plinth with the title page,
// and the soft blob shadow under the player.
function greyLandmarks(ctx) {
  const { T, sim, kit, zoneGroup } = ctx;
  const nodes = sim.entities.nodes.map((e) =>
    marker(ctx, e, 0.15, 4, 0.15, 0x63b88b),
  );
  marker(ctx, sim.entities.genesis, 0.5, 0.4, 0.35, 0xff9834, 0.7);
  marker(ctx, sim.entities.bench, 2, 0.6, 0.7, 0x777068);
  const plinth = marker(ctx, sim.entities.plinth, 0.8, 0.65, 0.8, 0xb9b6ab);
  const page = kit.decal(
    kit.text("Bitcoin:\nA Peer-to-Peer\nElectronic Cash System", {
      font: 30,
      background: "#e4dfd0",
      colour: "#25272b",
    }),
    0.65,
    0.85,
  );
  page.rotation.x = -Math.PI / 2;
  page.position.copy(plinth.position);
  page.position.y += 0.33;
  zoneGroup(6).add(page);
  const blob = new T.Mesh(
    new T.PlaneGeometry(0.8, 0.8),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { opacity: { value: 0.22 } },
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float opacity;void main(){gl_FragColor=vec4(.025,.035,.05,opacity*(1.-smoothstep(.12,.5,length(v-.5))));}`,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  zoneGroup(0).parent.add(blob);
  return {
    update({ snapshot: s }) {
      nodes.forEach((m, i) => {
        m.material.emissiveIntensity = s.nodes[i].lit ? 1 : 0;
      });
      const p = s.player;
      let floor = sim.groundY(p.x, p.z);
      if (p.z < -111 && p.z > -158) floor = Math.max(floor, sim.WATER_Y);
      for (const b of sim.layout)
        if (
          (b.block === undefined || s.blocks[b.block].risen >= 1) &&
          p.x >= b.min[0] &&
          p.x <= b.max[0] &&
          p.z >= b.min[2] &&
          p.z <= b.max[2] &&
          b.max[1] <= p.y + 0.05
        )
          floor = Math.max(floor, b.max[1]);
      blob.position.set(p.x, floor + 0.02, p.z);
      blob.material.uniforms.opacity.value = 0.22 * s.shadow;
    },
    dispose() {
      blob.geometry.dispose();
      blob.material.dispose();
      blob.removeFromParent();
    },
  };
}
