import { surface } from "./surfaces.js";
import { buildMachines, detailBuilder } from "./story-items-bots.js";
import { buildBursts, buildHazards } from "./story-items-effects.js";

// Original explanatory typesetting, with a faint ink impression on the reverse.
function printedSheet(T, own, number, bill = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = bill ? 320 : 1024;
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  c.fillStyle = bill ? "#a7ae91" : "#f4f0e6";
  c.fillRect(0, 0, w, h);
  let seed = 93 + number;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 11000; i++) {
    c.fillStyle = `rgba(89,77,52,${random() * 0.065})`;
    c.fillRect(random() * w, random() * h, 0.8 + random(), 1 + random() * 2);
  }
  c.fillStyle = bill ? "#455443" : "#2a2a29";
  c.textAlign = "center";
  if (bill) {
    c.strokeStyle = "#607052";
    for (let n = 0; n < 7; n++)
      c.strokeRect(16 + n * 4, 16 + n * 4, w - 32 - n * 8, h - 32 - n * 8);
    c.font = "24px Georgia";
    c.fillText("THE BEARER'S PROMISE", w / 2, 74);
    c.font = "bold 116px Georgia";
    c.fillText("100", w / 2, 202);
    c.font = "18px Georgia";
    c.fillText("A NOTE OF EXCHANGE", w / 2, 257);
    for (const x of [100, w - 100]) {
      c.beginPath();
      c.ellipse(x, 167, 38, 74, 0, 0, Math.PI * 2);
      c.stroke();
    }
  } else {
    const sections = [
      "A peer-to-peer cash system",
      "Transactions",
      "A chain of timestamps",
      "Proof of work",
      "The longest chain",
      "A distributed network",
      "Incentives",
      "Independent verification",
      "A system without a centre",
    ];
    c.font = "bold 44px Georgia";
    c.fillText("Bitcoin", w / 2, 86);
    c.font = "25px Georgia";
    c.fillText(sections[number], w / 2, 126);
    c.font = "17px Georgia";
    c.fillText("Satoshi Nakamoto  ·  2008", w / 2, 167);
    c.textAlign = "left";
    const paragraphs = [
      "Transactions move between peers. Each participant can",
      "verify the history using public keys and a shared record.",
      "A timestamp places a transaction into an ordered chain.",
      "Proof of work makes changing that history expensive.",
      "Independent nodes check each block against the rules.",
      "The network needs no central bookkeeper to agree.",
      "New work extends the chain that carries the most work.",
      "An open record lets anyone verify instead of trusting.",
    ];
    c.font = "bold 21px Georgia";
    c.fillText(`${number + 1}. ${sections[number]}`, 64, 235);
    c.font = "19px Georgia";
    for (let line = 0; line < 24; line++) {
      const text = paragraphs[(line + number) % paragraphs.length];
      c.fillText(text, 64 + (line % 8 === 0 ? 18 : 0), 278 + line * 24, 640);
    }
    // A technical figure gives the sheet a real page's uneven density.
    c.fillStyle = "#f4f0e6";
    c.fillRect(60, 690, 650, 168);
    c.strokeStyle = "#74716a";
    c.lineWidth = 1.5;
    c.font = "16px Georgia";
    c.fillStyle = "#4a4741";
    for (let n = 0; n < 3; n++) {
      c.strokeRect(90 + n * 215, 720, 150, 75);
      c.fillText("Transaction", 106 + n * 215, 750);
      c.fillText("Signature", 106 + n * 215, 778);
      if (n < 2) {
        c.beginPath();
        c.moveTo(240 + n * 215, 759);
        c.lineTo(305 + n * 215, 759);
        c.stroke();
      }
    }
    c.textAlign = "center";
    c.font = "16px Georgia";
    c.fillText(`${number + 1}`, w / 2, h - 45);
  }
  const texture = own(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function mint(T, kit, own, quality, gold) {
  const b = detailBuilder(T, kit, own, quality),
    temp = new T.Group();
  const segments = quality === "low" ? 24 : 96;
  b.disc(gold, 0, 0, 0, 0.157, 0.026, undefined, segments);
  for (const side of [-1, 1]) {
    const face = new T.Group();
    const f = detailBuilder(T, kit, own, quality);
    f.torus(
      gold,
      0,
      0,
      0.015,
      0.144,
      0.005,
      undefined,
      quality === "low" ? 24 : 96,
    );
    f.torus(
      gold,
      0,
      0,
      0.016,
      0.119,
      0.0018,
      undefined,
      quality === "low" ? 24 : 96,
    );
    f.block(gold, -0.038, 0, 0.02, 0.015, 0.153, 0.008, 0.002);
    // Two round bowls and a continuous spine, all raised above the coin field.
    for (const y of [-0.037, 0.037]) {
      const g = new T.TorusGeometry(
        0.038,
        0.008,
        quality === "low" ? 3 : 6,
        quality === "low" ? 10 : 22,
        Math.PI,
      );
      f.put(g, gold, [0.005, y, 0.02], [0, 0, -Math.PI / 2]);
      g.dispose();
      for (const dy of [-0.038, 0.038])
        f.block(gold, -0.014, y + dy, 0.02, 0.052, 0.016, 0.008, 0.002);
    }
    for (const x of [-0.027, -0.005])
      for (const y of [-0.083, 0.083])
        f.block(gold, x, y, 0.019, 0.008, 0.028, 0.006, 0.001);
    for (let n = 0; n < (quality === "low" ? 0 : 36); n++) {
      const a = (n * Math.PI) / 18;
      f.disc(
        gold,
        Math.cos(a) * 0.132,
        Math.sin(a) * 0.132,
        0.017,
        0.0018,
        0.003,
        undefined,
        5,
      );
    }
    f.finish(face, false);
    face.rotation.y = side < 0 ? Math.PI : 0;
    face.updateMatrix();
    const geometry = face.children[0].geometry
      .clone()
      .applyMatrix4(face.matrix);
    b.put(geometry, gold, [0, 0, 0]);
    geometry.dispose();
  }
  for (let n = 0; n < segments; n++) {
    const a = (n / segments) * Math.PI * 2;
    b.block(
      gold,
      Math.cos(a) * 0.1567,
      Math.sin(a) * 0.1567,
      0,
      0.003,
      0.003,
      0.022,
      0.0004,
    );
  }
  b.finish(temp, false);
  return temp.children[0].geometry;
}

export async function build(ctx) {
  const { T, kit, sim, zoneGroup, quality } = ctx;
  const extras = new Set(),
    own = (resource) => {
      extras.add(resource);
      return resource;
    };
  const previousChildren = Array.from(
    { length: 7 },
    (_, n) => new Set(zoneGroup(n).children),
  );
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sheetSun = { value: new T.Vector3(0, -1, 0) };
  const sheetLight = { value: new T.Color() };
  const gold = surface(kit, "gold", { space: "object", scale: 0.14 });
  const coinGeometry = mint(T, kit, own, quality, gold);
  const billTexture = printedSheet(T, own, 0, true);
  const billMaterial = kit.material({
    color: 0xffffff,
    map: billTexture,
    side: T.DoubleSide,
    roughness: 0.94,
    emissive: 0xd5dbb7,
    emissiveMap: billTexture,
    emissiveIntensity: 0.18,
  });
  const pages = sim.entities.pages.map((e, i) => {
    const root = new T.Group();
    root.position.set(e.x, e.y, e.z);
    zoneGroup(e.zone).add(root);
    const base = surface(kit, "paper", { space: "object", scale: 0.25 });
    const material = kit.material({
      color: base.color.clone(),
      roughness: base.roughness,
      metalness: base.metalness,
    });
    material.onBeforeCompile = base.onBeforeCompile;
    material.customProgramCacheKey = base.customProgramCacheKey;
    material.map = printedSheet(T, own, i);
    material.side = T.DoubleSide;
    material.emissive.set(0xfff3d7);
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0.35;
    material.roughness = 0.87;
    const inherited = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      inherited(shader);
      shader.uniforms.itemTime = kit.uniforms.time;
      shader.uniforms.flutter = { value: reduced ? 0 : 1 };
      shader.uniforms.sheetPhase = { value: i };
      shader.uniforms.sheetSun = sheetSun;
      shader.uniforms.sheetLight = sheetLight;
      shader.fragmentShader =
        "uniform vec3 sheetSun,sheetLight;\n" + shader.fragmentShader;
      shader.vertexShader =
        "uniform float itemTime,flutter,sheetPhase;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        transformed.z+=sin(position.y*9.+itemTime*.8+sheetPhase)*.012*flutter*(position.x+.3);
        transformed.x+=sin(position.y*6.+itemTime*.6)*.004*flutter;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float through=pow(max(0.,dot(-normal,normalize(mat3(viewMatrix)*sheetSun))),2.);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.75,.68),gl_FrontFacing?0.:.55);
        totalEmissiveRadiance+=diffuseColor.rgb*sheetLight*through*.3;
        totalEmissiveRadiance+=vec3(.018,.013,.007)*(1.-abs(dot(normal,normalize(vViewPosition))));`,
      );
    };
    material.customProgramCacheKey = () => "first-light-sheet-v2";
    const geometry = own(new T.PlaneGeometry(0.43, 0.61, 18, 24));
    const p = geometry.attributes.position;
    for (let n = 0; n < p.count; n++) {
      const x = p.getX(n),
        y = p.getY(n);
      p.setZ(
        n,
        0.045 * Math.pow(x / 0.215, 2) +
          0.015 * Math.sin(y * 6) +
          Math.max(0, y - 0.19) ** 2 * 1.4 +
          Math.max(0, x - 0.12) * Math.max(0, y - 0.15) * 4,
      );
    }
    geometry.computeVertexNormals();
    const sheet = new T.Mesh(geometry, material);
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    root.add(sheet);
    const glow = kit.particles(7, {
      colour: 0xffda98,
      size: 0.022,
      opacity: 0.42,
    });
    root.add(glow);
    const halo = new T.Mesh(
      own(new T.PlaneGeometry(0.95, 1.15)),
      own(
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
          vertexShader:
            "varying vec2 v;void main(){v=uv;vec4 p=modelViewMatrix*vec4(0.,0.,-.015,1.);p.xy+=position.xy;gl_Position=projectionMatrix*p;}",
          fragmentShader:
            "varying vec2 v;void main(){float a=exp(-dot((v-.5)*3.5,(v-.5)*3.5))* .065;gl_FragColor=vec4(1.,.71,.32,a);}",
        }),
      ),
    );
    root.add(halo);
    return { root, sheet, glow, e, index: i };
  });
  const coins = Array.from({ length: 7 }, (_, zone) => {
    const entities = sim.entities.coins
      .map((e, i) => ({ ...e, index: i }))
      .filter((e) => e.zone === zone);
    if (!entities.length) return null;
    const mesh = new T.InstancedMesh(coinGeometry, gold, entities.length);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false;
    zoneGroup(zone).add(mesh);
    return { mesh, entities };
  });
  const bots = buildMachines(ctx, own, billMaterial);
  const hazards = buildHazards(ctx, own, billMaterial, reduced);
  const bursts = buildBursts(
    ctx,
    own,
    coinGeometry,
    gold,
    bots.machines,
    reduced,
  );
  const roots = [];
  // Small props and particles never enter the expensive planar mirror pass.
  for (let n = 0; n < 7; n++)
    for (const child of zoneGroup(n).children)
      if (!previousChildren[n].has(child)) {
        roots.push(child);
        child.traverse((o) => {
          o.userData.noReflect = true;
        });
      }
  const transform = new T.Object3D();
  return {
    update({ snapshot, dt, time, env }) {
      sheetSun.value.copy(env.sunDir);
      sheetLight.value
        .copy(env.sunColour)
        .multiplyScalar(Math.max(0, env.sunDir.y) * 5);
      pages.forEach(({ root, glow, e, index }) => {
        const motePositions = glow.geometry.attributes.position;
        for (let n = 0; n < motePositions.count; n++) {
          const phase = n * 2.4 + (reduced ? 0 : time * 0.13);
          motePositions.setXYZ(
            n,
            Math.sin(phase) * 0.33,
            (((n / 7 + (reduced ? 0 : time * 0.035)) % 1) - 0.5) * 0.9,
            Math.cos(phase) * 0.14,
          );
        }
        motePositions.needsUpdate = true;
        root.visible = !snapshot.pagesTaken[index];
        const t = reduced ? 0 : time;
        root.position.set(
          e.x + Math.sin(t * 0.53 + index) * 0.035,
          e.y + Math.sin(t * 0.7 + index) * 0.04,
          e.z,
        );
        root.rotation.set(
          Math.sin(t * 0.4 + index) * 0.07,
          (e.s > 45 && e.s < 65 ? -Math.PI / 2 : 0) +
            Math.sin(t * 0.23 + index) * 0.3,
          Math.sin(t * 0.6 + index) * 0.06,
        );
      });
      for (const batch of coins)
        if (batch) {
          batch.entities.forEach((e, n) => {
            const t = reduced ? 0.35 : time;
            transform.position.set(
              e.x,
              e.y + (reduced ? 0 : Math.sin(t * 1.2 + e.index) * 0.026),
              e.z,
            );
            transform.rotation.set(0.12, t * 1.15 + e.index * 0.4, 0.08);
            transform.scale.setScalar(snapshot.coinsTaken[e.index] ? 0 : 1);
            transform.updateMatrix();
            batch.mesh.setMatrixAt(n, transform.matrix);
          });
          batch.mesh.instanceMatrix.needsUpdate = true;
        }
      bots.update(snapshot, time, dt, reduced);
      hazards.update(time, env);
      bursts.update(snapshot, dt, time);
    },
    dispose() {
      hazards.dispose();
      bots.dispose();
      roots.forEach((root) => {
        root.traverse((object) => {
          if (object.isInstancedMesh) object.dispose();
        });
        root.removeFromParent();
      });
      extras.forEach((resource) => resource.dispose());
      extras.clear();
    },
  };
}
