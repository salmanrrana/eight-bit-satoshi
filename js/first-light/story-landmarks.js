import { surface } from "./surfaces.js";
import { genesisLight, foldedHoodie } from "./story-landmarks-light.js";
import { craft } from "./story-landmarks-craft.js";
import { height as hillHeight } from "./hills.js";

// Story set pieces have no independent clock for gameplay. State transitions
// start their visual envelopes; every mesh/material is allocated during build.
export async function build(ctx) {
  const { T, kit, sim, scene, zoneGroup, quality } = ctx;
  const c = craft(ctx),
    unregister = [],
    roots = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const group = (zone, e) => {
    const g = new T.Group();
    g.position.set(e.x, e.y, e.z);
    zoneGroup(zone).add(g);
    roots.push(g);
    return g;
  };
  const mat = (name, tint, scale = 0.3) =>
    surface(kit, name, { tint, scale, weather: false, space: "object" });
  const plastic = mat("plastic", 0xf0d5a3),
    dark = mat("rubber", 0x9697a0);
  const metal = mat("galvanized", 0xc3c9ca),
    wood = mat("wood", new T.Color(1.3, 2.0, 3.0), 0.83);
  const blackMetal = mat("paintedMetal", 0x515965),
    paper = mat("paper", 0xffffff);
  const ceramic = kit.material({ color: 0xc4bca5, roughness: 0.28 });
  const coffee = kit.material({ color: 0x150e08, roughness: 0.16 });
  const glaze = c.canvas(256, 256, (x, w, h) => {
    x.fillStyle = "#f5f3e9";
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = "rgba(93,80,57,.08)";
      x.beginPath();
      x.arc((i * 73) % w, (i * 137) % h, 0.35 + (i % 3) * 0.15, 0, Math.PI * 2);
      x.fill();
    }
  });
  ceramic.map = glaze;
  ceramic.bumpMap = glaze;
  ceramic.bumpScale = 0.00003;
  const coffeeFilm = c.canvas(128, 128, (x, w, h) => {
    const film = x.createRadialGradient(
      w * 0.4,
      h * 0.4,
      2,
      w / 2,
      h / 2,
      w * 0.5,
    );
    film.addColorStop(0, "#dfc9a5");
    film.addColorStop(0.65, "#fff4d1");
    film.addColorStop(1, "#a17b48");
    x.fillStyle = film;
    x.fillRect(0, 0, w, h);
  });
  coffee.map = coffeeFilm;

  // The baked plastic is charcoal. A linear multiplier gives yellowed beige
  // while preserving its microtexture, normal map and roughness.
  const beige = mat("plastic", new T.Color(14.5, 11.5, 8), 0.3);
  const orange = kit.material({
    color: 0xf7931a,
    emissive: 0xf7931a,
    emissiveIntensity: 2,
    roughness: 0.28,
  });
  const green = kit.material({
    color: 0x83c9a2,
    emissive: 0x52e99b,
    emissiveIntensity: 0,
    roughness: 0.22,
  });

  function consoleTexture(mined) {
    return c.canvas(1024, 768, (x, w, h) => {
      x.fillStyle = "#07100e";
      x.fillRect(0, 0, w, h);
      const halo = x.createRadialGradient(
        w * 0.5,
        h * 0.5,
        10,
        w * 0.5,
        h * 0.5,
        w * 0.7,
      );
      halo.addColorStop(0, "#14251e");
      halo.addColorStop(1, "#050907");
      x.fillStyle = halo;
      x.fillRect(0, 0, w, h);
      x.font = "25px monospace";
      x.fillStyle = "#8caa8e";
      const lines = mined
        ? [
            "bitcoin / version 0.1.0",
            "03/Jan/2009  18:15:05",
            "",
            "> proof of work found",
            "height: 0     transactions: 1",
            "hash: 000000000019d6689c085ae165831e93",
            "      4ff763ae46a2a6c172b3f1b60a8ce26f",
            "",
            "The Times 03/Jan/2009",
            "Chancellor on brink of second",
            "bailout for banks",
            "",
            "> accepting connections...",
          ]
        : [
            "bitcoin / version 0.1.0",
            "03/Jan/2009",
            "",
            "initialising block index...",
            "peers: 0    height: -1",
            "",
            "> waiting for proof of work",
            "",
            "Run the node. Keep a copy.",
          ];
      lines.forEach((line, i) => {
        x.font = i === 1 ? "38px monospace" : "25px monospace";
        x.fillText(line, 45, 65 + i * 45);
      });
      x.fillStyle = "#f5bd67";
      x.fillText(mined ? "GENESIS BLOCK ACCEPTED" : "READY  _", 45, 699);
      x.fillStyle = "rgba(0,0,0,.17)";
      for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
      x.strokeStyle = "rgba(100,156,121,.05)";
      x.lineWidth = 18;
      x.strokeRect(10, 10, w - 20, h - 20);
      // The curved glass catches a faint band from the garage strip light.
      x.save();
      x.globalCompositeOperation = "screen";
      const reflection = x.createLinearGradient(w * 0.75, 0, w * 0.96, h * 0.7);
      reflection.addColorStop(0, "rgba(205,218,224,.035)");
      reflection.addColorStop(0.18, "rgba(230,217,180,.075)");
      reflection.addColorStop(0.32, "rgba(200,207,213,.012)");
      reflection.addColorStop(1, "rgba(200,207,213,0)");
      x.fillStyle = reflection;
      x.beginPath();
      x.moveTo(w * 0.67, 0);
      x.lineTo(w * 0.98, 0);
      x.lineTo(w, h * 0.72);
      x.lineTo(w * 0.85, h * 0.54);
      x.closePath();
      x.fill();
      x.restore();
    });
  }
  const waiting = consoleTexture(false),
    accepted = consoleTexture(true);
  const pc = group(2, sim.entities.genesis);
  // The tower, CRT and support stay inside their .52 × .9 × .35 solid.
  c.box(pc, [0.145, 0.39, 0.315], [0.177, 0.195, -0.012], beige, 0.009);
  c.box(pc, [0.13, 0.37, 0.006], [0.177, 0.195, 0.151], plastic, 0.002);
  c.box(pc, [0.107, 0.026, 0.008], [0.177, 0.314, 0.158], dark, 0.001);
  c.box(pc, [0.103, 0.008, 0.009], [0.177, 0.309, 0.163], blackMetal, 0.001);
  for (let i = 0; i < 9; i++)
    c.box(
      pc,
      [0.092, 0.002, 0.005],
      [0.177, 0.075 + i * 0.008, 0.158],
      dark,
      0.0005,
    );
  c.cylinder(pc, 0.008, 0.004, [0.21, 0.2, 0.16], metal).rotation.x =
    Math.PI / 2;
  const diskMaterial = orange.clone();
  c.own(diskMaterial);
  c.box(pc, [0.006, 0.003, 0.003], [0.145, 0.22, 0.163], diskMaterial, 0.001);
  c.box(pc, [0.325, 0.26, 0.29], [-0.075, 0.228, -0.015], beige, 0.021);
  c.box(pc, [0.292, 0.221, 0.015], [-0.075, 0.228, 0.135], dark, 0.02);
  c.box(pc, [0.285, 0.045, 0.025], [-0.075, 0.078, 0.025], beige, 0.006);
  c.box(pc, [0.12, 0.045, 0.105], [-0.075, 0.045, -0.015], beige, 0.009);
  c.box(pc, [0.24, 0.019, 0.19], [-0.075, 0.012, 0], beige, 0.009);
  c.box(pc, [0.52, 0.018, 0.35], [0, -0.012, 0], blackMetal, 0.004);
  for (const z of [-0.12, 0.12]) {
    c.rod(pc, [0.2, -0.49, z], [0.2, -0.018, z], 0.008, blackMetal);
    c.rod(pc, [0.18, -0.49, z], [-0.21, -0.018, z], 0.008, blackMetal);
  }
  c.box(pc, [0.25, 0.015, 0.35], [0.15, -0.493, 0], blackMetal, 0.004);
  for (let i = 0; i < 7; i++)
    c.box(
      pc,
      [0.002, 0.09, 0.004],
      [0.084 + i * 0.011, 0.245, -0.172],
      dark,
      0.001,
    );
  c.merge(pc);
  // The glass bulges forward a few millimetres, catching an actual curved highlight.
  const glassGeo = c.own(new T.PlaneGeometry(0.263, 0.191, 24, 18));
  const gp = glassGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i) / 0.132,
      y = gp.getY(i) / 0.096;
    gp.setZ(i, 0.009 * (1 - x * x) * (1 - y * y));
  }
  glassGeo.computeVertexNormals();
  const screenMat = kit.material({
    map: waiting,
    emissiveMap: waiting,
    emissive: 0xffffff,
    emissiveIntensity: 0.95,
    roughness: 0.32,
    metalness: 0.08,
  });
  const minedScreen = { value: 0 };
  const screenCompile = screenMat.onBeforeCompile;
  screenMat.onBeforeCompile = (shader) => {
    screenCompile(shader);
    shader.uniforms.landmarkGenesisTexture = { value: accepted };
    shader.uniforms.landmarkGenesisMined = minedScreen;
    shader.fragmentShader =
      "uniform sampler2D landmarkGenesisTexture;uniform float landmarkGenesisMined;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
vec4 landmarkScreenTexel=mix(texture2D(map,vMapUv),texture2D(landmarkGenesisTexture,vMapUv),landmarkGenesisMined);
diffuseColor *= landmarkScreenTexel;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "totalEmissiveRadiance *= landmarkScreenTexel.rgb;",
    );
  };
  screenMat.customProgramCacheKey = () => "landmark-crt-console-v1";
  const screen = new T.Mesh(glassGeo, screenMat);
  screen.position.set(-0.075, 0.238, 0.145);
  pc.add(screen);
  // Real fan blades are behind the grille, visible obliquely at the case rear.
  const fan = new T.Group();
  fan.position.set(0.177, 0.25, -0.172);
  pc.add(fan);
  for (let i = 0; i < 7; i++)
    c.box(fan, [0.012, 0.05, 0.003], [0, 0.022, 0], metal, 0.002, [
      0,
      0,
      (i * Math.PI * 2) / 7,
    ]);
  c.merge(fan, false);
  // Worktop dressing lives over the authoritative workbench, not in the route.
  const desk = group(2, { x: 22.6, y: 0.91, z: -89.7 });
  c.box(desk, [0.47, 0.025, 0.165], [0, 0.013, 0], beige, 0.009, [0, 0.06, 0]);
  const keyTexture = c.canvas(1024, 350, (x, w, h) => {
    x.fillStyle = "#9b9585";
    x.fillRect(0, 0, w, h);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 16; col++) {
        const px = 12 + col * 62,
          py = 10 + row * 65;
        x.fillStyle = "#343630";
        x.fillRect(px, py, 57, 59);
        x.fillStyle = "#c2bfac";
        x.fillRect(px + 2, py + 1, 53, 53);
        x.fillStyle = "#4e5147";
        x.font = "15px monospace";
        x.fillText(
          String.fromCharCode(65 + ((row * 16 + col) % 26)),
          px + 8,
          py + 20,
        );
      }
    x.fillStyle = "#b7b2a0";
    x.fillRect(239, 274, 354, 49);
  });
  c.face(desk, keyTexture, 0.45, 0.15, [0, 0.027, 0], [-Math.PI / 2, 0, 0.06]);
  c.box(desk, [0.065, 0.033, 0.105], [0.36, 0.019, 0], beige, 0.025);
  c.box(desk, [0.001, 0.001, 0.044], [0.36, 0.036, -0.014], dark, 0.0003);
  c.cable(
    desk,
    [
      [0.36, 0.015, -0.05],
      [0.4, 0.005, -0.19],
      [0.13, 0.004, -0.38],
      [-0.2, 0.23, -0.43],
    ],
    0.003,
    dark,
  );
  c.cable(
    desk,
    [
      [0, 0.01, -0.08],
      [-0.05, 0.01, -0.21],
      [-0.25, 0.015, -0.3],
      [-0.4, 0.5, -0.4],
    ],
    0.003,
    dark,
  );
  c.cable(
    desk,
    [
      [-0.3, 0.5, -0.3],
      [-0.48, 0.3, -0.38],
      [-0.5, -0.5, -0.47],
      [-0.32, -0.84, -0.48],
    ],
    0.006,
    dark,
  );
  const note = c.canvas(512, 512, (x, w, h) => {
    x.fillStyle = "#cbbf8c";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#4c5045";
    x.font = "italic 29px serif";
    ["one CPU, one vote.", "", "03 / 01 / 09", "keep it running."].forEach(
      (s, i) => x.fillText(s, 30, 80 + i * 80),
    );
  });
  c.face(
    desk,
    note,
    0.18,
    0.18,
    [0.62, 0.008, -0.18],
    [-Math.PI / 2, 0, -0.16],
  );
  c.merge(desk);
  c.mug(desk, [0.5, 0.008, -0.4], ceramic, coffee);
  const lamp = group(2, { x: 23.57, y: 0.91, z: -90.5 });
  c.cylinder(lamp, 0.095, 0.015, [0, 0.009, 0], blackMetal);
  c.rod(lamp, [0, 0.02, 0], [0, 0.38, 0], 0.01, blackMetal);
  c.rod(lamp, [0, 0.38, 0], [-0.17, 0.55, 0.02], 0.012, blackMetal);
  const shade = c.cylinder(
    lamp,
    0.104,
    0.105,
    [-0.2, 0.51, 0.02],
    blackMetal,
    0.04,
    24,
  );
  shade.rotation.z = -0.32;
  c.cylinder(lamp, 0.082, 0.003, [-0.216, 0.459, 0.02], orange);
  c.merge(lamp);
  unregister.push(
    kit.addLightFixture({
      position: [23.36, 1.36, -90.48],
      colour: 0xffc47d,
      intensity: 2.3,
      kind: "desk",
    }),
  );
  unregister.push(
    kit.addLightFixture({
      position: [21.7, 1.35, -89.65],
      colour: 0xf7931a,
      intensity: 0.45,
      kind: "screen",
    }),
  );
  const moteClock = { value: 0 };
  // The block forms from a few concentric, bevelled shells, pauses, then takes
  // the direction of the river. No scene allocation occurs when E is pressed.
  const genesisBlock = group(2, { x: 22, y: 2.15, z: -90 });
  const lightVolume = genesisLight({
    T,
    kit,
    c,
    parent: genesisBlock,
    clock: moteClock,
  });
  const genesisRadiance = new T.Color(0, 0, 0);
  unregister.push(
    kit.addLightFixture({
      position: [22, 1.8, -90],
      colour: genesisRadiance,
      intensity: 2.4,
      kind: "genesis",
    }),
  );
  // Keep this visible for compile-ahead; update hides it before the first play frame.
  genesisBlock.name = "STORY genesis light block";
  genesisBlock.visible = true;
  const streak = kit.particles(48, {
    colour: 0xf7931a,
    size: 0.11,
    opacity: 0.2,
  });
  for (let i = 0; i < 48; i++)
    streak.geometry.attributes.position.setXYZ(i, 0, 0, i * 0.06);
  const trailCompile = streak.material.onBeforeCompile;
  streak.material.onBeforeCompile = (shader) => {
    trailCompile(shader);
    shader.vertexShader =
      "varying float landmarkTrailFade;\n" + shader.vertexShader;
    shader.fragmentShader =
      "varying float landmarkTrailFade;\n" + shader.fragmentShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nlandmarkTrailFade=pow(clamp(1.-position.z/2.88,0.,1.),1.5);",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "diffuseColor.a*=landmarkTrailFade;\n#include <opaque_fragment>",
    );
  };
  streak.material.customProgramCacheKey = () =>
    "landmark-soft-departure-trail-v2";
  zoneGroup(2).add(streak);
  roots.push(streak);
  const genesisMotes = kit.particles(36, {
    colour: 0xf7931a,
    size: 0.025,
    opacity: 0.35,
  });
  pc.add(genesisMotes);
  // All particle trajectories are shader uniforms over immutable seed positions.
  function drifting(points, speed, spread) {
    const a = points.geometry.attributes.position;
    for (let i = 0; i < a.count; i++)
      a.setXYZ(
        i,
        Math.sin(i * 8) * spread,
        (i * 0.071) % 1,
        Math.cos(i * 7) * spread,
      );
    const previous = points.material.onBeforeCompile;
    points.material.onBeforeCompile = (shader) => {
      previous(shader);
      shader.uniforms.landmarkMoteTime = moteClock;
      shader.vertexShader =
        "uniform float landmarkMoteTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
transformed.y = .05 + mod(position.y + landmarkMoteTime * ${speed.toFixed(3)}, 1.5);
transformed.x += sin(landmarkMoteTime*.3+position.z*11.)*.08;`,
      );
    };
    points.material.customProgramCacheKey = () =>
      `landmark-motes-${speed}-${spread}`;
  }
  drifting(genesisMotes, 0.1, 0.25);

  // Masts use merged fittings; the many distant copies are instances.
  const masts = sim.entities.nodes.map((e, i) => {
    const g = group(e.zone, e);
    c.cylinder(g, 0.062, 3.8, [0, 1.9, 0], metal, 0.043, 12);
    for (let j = 0; j < 3; j++)
      c.cylinder(
        g,
        0.068,
        0.022,
        [0, 0.5 + j * 1.25, 0],
        blackMetal,
        0.068,
        12,
      );
    c.box(g, [0.14, 0.25, 0.095], [0, 1.1, 0.052], blackMetal, 0.008);
    c.box(g, [0.126, 0.22, 0.005], [0, 1.1, 0.104], metal, 0.004);
    c.box(g, [0.31, 0.018, 0.23], [0, 2.15, 0.1], metal, 0.002, [0.45, 0, 0]);
    const solar = c.canvas(256, 192, (x, w, h) => {
      x.fillStyle = "#101e2c";
      x.fillRect(0, 0, w, h);
      for (let a = 0; a < 6; a++)
        for (let b = 0; b < 4; b++) {
          x.fillStyle = (a + b) % 2 ? "#162b42" : "#1d344a";
          x.fillRect(a * 42 + 2, b * 48 + 2, 38, 44);
        }
      x.strokeStyle = "#92a0a8";
      x.lineWidth = 1;
      for (let a = 0; a < 24; a++) {
        x.beginPath();
        x.moveTo(a * 11, 0);
        x.lineTo(a * 11, h);
        x.stroke();
      }
    });
    c.face(
      g,
      solar,
      0.29,
      0.21,
      [0, 2.162, 0.105],
      [-Math.PI / 2 + 0.45, 0, 0],
    );
    c.rod(g, [0, 3.7, 0], [0, 4, 0], 0.008, metal);
    c.rod(g, [-0.27, 3.62, 0], [0.27, 3.62, 0], 0.006, metal);
    for (const a of [-0.2, 0, 0.2])
      c.rod(g, [a, 3.59, -0.1], [a, 3.59, 0.1], 0.004, metal);
    for (const side of [-1, 1])
      c.rod(g, [0, 2.9, 0], [side * 0.85, 0.02, 0.55], 0.0022, metal);
    const label = kit.text(`NODE 0${i + 1}\nKEEP ONLINE`, {
      width: 256,
      height: 128,
      font: 24,
      background: "#bdb9a1",
      colour: "#303e3c",
    });
    c.face(g, label, 0.106, 0.053, [0, 1.14, 0.108]);
    c.merge(g);
    const beaconMaterial = green.clone();
    c.own(beaconMaterial);
    const beacon = c.cylinder(
      g,
      0.048,
      0.115,
      [0, 3.85, 0],
      beaconMaterial,
      0.048,
      16,
    );
    const glow = kit.particles(1, {
      colour: 0x70ffc1,
      size: 0.28,
      opacity: 0.35,
    });
    glow.geometry.attributes.position.setXYZ(0, 0, 3.85, 0);
    g.add(glow);
    return { g, beacon, glow };
  });
  const far = new T.Group();
  scene.add(far);
  roots.push(far);
  const distant = Array.from(
    { length: quality === "low" ? 24 : 42 },
    (_, i) => {
      const side = i % 2 ? 1 : -1,
        x = 20 + side * (22 + ((i * 17.77) % 105)),
        z = -165 - ((i * 23.13) % 150);
      return new T.Vector3(x, hillHeight(sim, x, z) + 4.2 + (i % 5) * 0.7, z);
    },
  );
  const dummy = new T.Object3D();
  const poleGeo = c.own(new T.CylinderGeometry(0.047, 0.06, 1, 5));
  const poles = c.own(new T.InstancedMesh(poleGeo, metal, distant.length));
  distant.forEach((p, i) => {
    dummy.position.copy(p);
    const h = 4.2 + (i % 5) * 0.7;
    dummy.position.y -= h / 2;
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  far.add(poles);
  const farBeacons = Array.from({ length: 5 }, (_, index) => {
    const positions = distant.filter((_, i) => i % 5 === index);
    const points = kit.particles(positions.length, {
      colour: 0x72e9b1,
      size: 0.32,
      opacity: 0.55,
    });
    positions.forEach((p, i) =>
      points.geometry.attributes.position.setXYZ(i, p.x, p.y, p.z),
    );
    far.add(points);
    return points;
  });
  // A crossed pair of wide, alpha-feathered planes gives each connection depth
  // in air. There is no hard Line primitive or visible endpoint quad.
  const beamTexture = c.canvas(32, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const gradient = x.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "rgba(136,255,199,0)");
    gradient.addColorStop(0.42, "rgba(136,255,199,.025)");
    gradient.addColorStop(0.5, "rgba(136,255,199,.24)");
    gradient.addColorStop(0.58, "rgba(136,255,199,.025)");
    gradient.addColorStop(1, "rgba(136,255,199,0)");
    x.fillStyle = gradient;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "destination-in";
    const end = x.createLinearGradient(0, 0, 0, h);
    end.addColorStop(0, "transparent");
    end.addColorStop(0.12, "white");
    end.addColorStop(0.88, "white");
    end.addColorStop(1, "transparent");
    x.fillStyle = end;
    x.fillRect(0, 0, w, h);
  });
  const beamMat = c.own(
    new T.MeshBasicMaterial({
      map: beamTexture,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      color: 0x98c9b0,
      toneMapped: true,
      depthTest: true,
    }),
  );
  beamMat.onBeforeCompile = (shader) => {
    shader.uniforms.landmarkAirTime = moteClock;
    shader.vertexShader = "varying vec3 beamWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nbeamWorld=(modelMatrix*vec4(position,1.)).xyz;",
    );
    shader.fragmentShader =
      "uniform float landmarkAirTime; varying vec3 beamWorld;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
diffuseColor.a *= smoothstep(1.5,7.,distance(cameraPosition,beamWorld)) * (.68+.32*sin(vMapUv.y*19.+landmarkAirTime*.04)*sin(vMapUv.y*8.+.6));`,
    );
  };
  beamMat.customProgramCacheKey = () => "landmark-soft-air-links-v1";
  const beamGeo = c.own(new T.PlaneGeometry(1, 1));
  function beam(a, b, index, other = -1) {
    const g = new T.Group(),
      v = b.clone().sub(a);
    g.position.copy(a).add(b).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      v.clone().normalize(),
    );
    for (let j = 0; j < 2; j++) {
      const mesh = new T.Mesh(beamGeo, beamMat);
      mesh.scale.set(0.16, v.length(), 1);
      mesh.rotation.y = (j * Math.PI) / 2;
      g.add(mesh);
    }
    c.merge(g, false);
    far.add(g);
    return { g, index, other };
  }
  const mastTop = sim.entities.nodes.map(
    (e) => new T.Vector3(e.x, e.y + 3.85, e.z),
  );
  // Low-detail copies keep the five trail nodes present in the summit view
  // after their detailed zone chunk has been culled.
  const mastBackdrop = new T.Group();
  far.add(mastBackdrop);
  const proxyPoles = c.own(new T.InstancedMesh(poleGeo, metal, 5));
  sim.entities.nodes.forEach((e, i) => {
    dummy.position.set(e.x, e.y + 1.9, e.z);
    dummy.scale.set(1, 3.8, 1);
    dummy.updateMatrix();
    proxyPoles.setMatrixAt(i, dummy.matrix);
  });
  proxyPoles.instanceMatrix.needsUpdate = true;
  mastBackdrop.add(proxyPoles);
  const proxyGlow = kit.particles(5, {
    colour: 0x72e9b1,
    size: 0.28,
    opacity: 0.5,
  });
  mastTop.forEach((p, i) =>
    proxyGlow.geometry.attributes.position.setXYZ(i, p.x, p.y, p.z),
  );
  mastBackdrop.add(proxyGlow);
  const beams = [];
  mastTop.forEach((a, i) => {
    for (let j = Math.max(0, i - 2); j < i; j++)
      beams.push(beam(a, mastTop[j], i, j));
  });
  const remoteBatches = Array.from({ length: 5 }, () => new T.Group());
  distant.forEach((p, i) => {
    if (i % 3 !== 0) return;
    const index = i % 5;
    for (const a of [mastTop[index], ...(i > 1 ? [distant[i - 2]] : [])]) {
      const link = beam(a, p, index);
      link.g.updateMatrix();
      for (const mesh of [...link.g.children]) {
        mesh.applyMatrix4(link.g.matrix);
        remoteBatches[index].add(mesh);
      }
      link.g.removeFromParent();
    }
  });
  remoteBatches.forEach((g, index) => {
    c.merge(g, false);
    far.add(g);
    beams.push({ g, index, other: -1 });
  });

  const nodeAges = sim.entities.nodes.map(() => -1);
  for (const link of beams) {
    const material = c.own(beamMat.clone());
    material.onBeforeCompile = beamMat.onBeforeCompile;
    material.customProgramCacheKey = beamMat.customProgramCacheKey;
    link.g.traverse((mesh) => {
      if (mesh.isMesh) mesh.material = material;
    });
    link.material = material;
  }
  const bench = group(5, sim.entities.bench);
  // Low-backed oak bench; seat, backrest and props fit the .9 m solid.
  for (let j = 0; j < 4; j++) {
    const slat = c.box(
      bench,
      [1.98 - j * 0.002, 0.075, 0.158],
      [0, 0.46, -0.25 + j * 0.166],
      wood,
      0.014,
    );
    const p = slat.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      if (Math.abs(x) > 0.95)
        p.setX(
          i,
          x -
            Math.sign(x) *
              0.006 *
              Math.abs(Math.sin(Math.round(z * 10000) * 0.71 + j * 13)),
        );
    }
    slat.geometry.computeVertexNormals();
  }
  for (const x of [-0.73, 0.73]) {
    c.box(
      bench,
      [0.08, 0.445, 0.09],
      [x, 0.198, -0.23],
      blackMetal,
      0.009,
      [0.12, 0, 0],
    );
    c.box(
      bench,
      [0.08, 0.445, 0.09],
      [x, 0.198, 0.23],
      blackMetal,
      0.009,
      [-0.12, 0, 0],
    );
    c.box(bench, [0.13, 0.045, 0.62], [x, 0.415, 0], blackMetal, 0.007);
    for (const z of [-0.25, 0.25])
      c.cylinder(bench, 0.009, 0.004, [x, 0.4995, z], metal, 0.009, 10);
  }
  for (let j = 0; j < 3; j++) {
    const y = 0.625 + j * 0.11;
    c.box(
      bench,
      [1.98, 0.09, 0.045],
      [0, y, -0.3 - (y - 0.6) * 0.1],
      wood,
      0.011,
    );
  }
  for (const x of [-0.73, 0.73])
    c.rod(bench, [x, 0.36, -0.27], [x, 0.88, -0.325], 0.021, blackMetal);
  c.box(bench, [1.5, 0.06, 0.06], [0, 0.22, 0], wood, 0.005);
  const seatWear = c.canvas(512, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = "rgba(36,37,29,.4)";
    x.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const side = i % 2,
        px = side ? w : 0,
        py = 10 + ((i * 31) % 110);
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (side ? -1 : 1) * (25 + i * 3), py + Math.sin(i) * 2);
      x.lineTo(px + (side ? -1 : 1) * (33 + i * 5), py - 2);
      x.stroke();
    }
    for (let i = 0; i < 75; i++) {
      const px = (i * 73) % w;
      if (px > 80 && px < w - 80) continue;
      x.fillStyle = i % 2 ? "rgba(148,153,114,.32)" : "rgba(78,88,59,.3)";
      x.fillRect(px, (i * 47) % h, 1 + (i % 3), 1 + (i % 4));
    }
  });
  for (let j = 0; j < 4; j++) {
    const wear = c.face(
      bench,
      seatWear,
      1.95,
      0.151,
      [0, 0.498, -0.25 + j * 0.166],
      [-Math.PI / 2, 0, 0],
    );
    wear.material.transparent = true;
    wear.material.depthWrite = false;
    wear.material.roughness = 0.95;
  }
  c.merge(bench);
  const timber = bench.children.find((mesh) => mesh.material === wood);
  // Align real grain with each slat. Baked panel joints fall in the physical
  // gaps, while the inverse mesh transform preserves the exact collision shape.
  const grainSpace = new T.Matrix4()
    .makeTranslation(0.001, 0, 0.415)
    .multiply(new T.Matrix4().makeScale(1, 1, 0.25))
    .multiply(new T.Matrix4().makeRotationY(Math.PI / 2));
  timber.geometry.applyMatrix4(grainSpace);
  timber.applyMatrix4(grainSpace.clone().invert());
  const laptop = new T.Group();
  laptop.position.set(-0.15, 0.4985, 0);
  laptop.rotation.y = -0.16;
  bench.add(laptop);
  c.box(laptop, [0.33, 0.018, 0.23], [0, 0.009, 0], blackMetal, 0.009);
  c.box(laptop, [0.265, 0.002, 0.092], [0, 0.02, -0.036], dark, 0.002);
  for (let j = 0; j < 5; j++)
    for (let k = 0; k < 13; k++)
      c.box(
        laptop,
        [0.016, 0.002, 0.013],
        [-0.118 + k * 0.019, 0.022, -0.071 + j * 0.017],
        plastic,
        0.001,
      );
  c.box(laptop, [0.083, 0.001, 0.052], [0, 0.02, 0.063], metal, 0.002);
  const lid = new T.Group();
  lid.position.set(0, 0.018, -0.11);
  lid.rotation.x = -0.24;
  laptop.add(lid);
  c.box(lid, [0.333, 0.224, 0.011], [0, 0.112, 0], blackMetal, 0.008);
  const terminal = c.canvas(1024, 640, (x, w, h) => {
    x.fillStyle = "#0d191a";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#7aafa0";
    x.font = "42px monospace";
    [
      "bitcoin / node running",
      "",
      "connections: 8",
      "blocks: synchronised",
      "",
      "> the network is still here.",
      "",
      "_",
    ].forEach((l, i) => x.fillText(l, 40, 58 + i * 64));
  });
  c.face(lid, terminal, 0.306, 0.191, [0, 0.112, 0.006], [0, 0, 0], 0.55);
  c.merge(lid, false);
  c.merge(laptop);
  c.mug(bench, [0.4, 0.4985, 0.09], ceramic, coffee);
  const teaRing = c.canvas(128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = "rgba(91,58,26,.42)";
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(w / 2, h / 2, 48, 45, 0.12, 0.25, 5.7);
    x.stroke();
  });
  const ring = c.face(
    bench,
    teaRing,
    0.092,
    0.092,
    [0.4, 0.4981, 0.09],
    [-Math.PI / 2, 0, 0],
  );
  ring.material.transparent = true;
  ring.material.depthWrite = false;
  const clothTexture = c.canvas(512, 512, (x, w, h) => {
    x.fillStyle = "#6b777b";
    x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      x.strokeStyle = y % 9 ? "#718086" : "#59666c";
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
    }
    for (let a = 0; a < 1000; a++) {
      x.fillStyle = "rgba(192,193,180,.08)";
      x.fillRect((a * 73) % w, (a * 37) % h, 1, 3);
    }
  });
  clothTexture.wrapS = clothTexture.wrapT = T.RepeatWrapping;
  clothTexture.repeat.set(3, 3);
  const fabric = kit.material({
    map: clothTexture,
    color: 0xe0e3e1,
    bumpMap: clothTexture,
    bumpScale: 0.0005,
    roughness: 1,
  });
  const hoodie = new T.Group();
  hoodie.position.set(0.69, 0.49, -0.04);
  hoodie.rotation.y = 0.1;
  bench.add(hoodie);
  foldedHoodie({ T, c, parent: hoodie, material: fabric, cord: paper });
  const leafTexture = c.canvas(128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = "#8e5427";
    x.beginPath();
    x.moveTo(w * 0.5, 8);
    x.bezierCurveTo(w * 1.25, h * 0.35, w * 0.83, h * 0.85, w * 0.5, h - 8);
    x.bezierCurveTo(w * 0.12, h * 0.8, -w * 0.16, h * 0.3, w * 0.5, 8);
    x.fill();
    x.strokeStyle = "#bd8b45";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(w * 0.5, 9);
    x.lineTo(w * 0.5, h - 5);
    x.stroke();
  });
  const leafMaterial = kit.material({
    map: leafTexture,
    transparent: true,
    alphaTest: 0.3,
    side: T.DoubleSide,
    roughness: 0.9,
  });
  for (let i = 0; i < 8; i++) {
    const leaf = new T.Mesh(
      c.own(new T.PlaneGeometry(0.035 + (i % 3) * 0.01, 0.08)),
      leafMaterial,
    );
    leaf.position.set(
      -0.87 + ((i * 0.173) % 1.8),
      0.5005,
      -0.26 + ((i * 0.137) % 0.5),
    );
    leaf.rotation.set(-Math.PI / 2, 0, i * 2.3);
    bench.add(leaf);
  }

  const plinth = group(6, sim.entities.plinth);
  // Warm light reflected by the stone landing, using the shared fixed light pool.
  const stoneBounce = new T.Color();
  unregister.push(
    kit.addLightFixture({
      position: [
        sim.entities.plinth.x + 1.3,
        sim.entities.plinth.y + 1.7,
        sim.entities.plinth.z + 1.5,
      ],
      colour: stoneBounce,
      intensity: 7,
      kind: "stone-bounce",
      downward: false,
    }),
  );
  const stone = mat("cutStone", new T.Color(1, 0.98, 0.94), 8);
  c.box(plinth, [0.8, 0.09, 0.8], [0, 0.045, 0], stone, 0.025);
  // One carved octagonal shaft: a chamfered foot, tapered body and neck moulding.
  const profile = [
    [0.34, 0.09],
    [0.34, 0.15],
    [0.285, 0.2],
    [0.27, 0.88],
    [0.29, 0.94],
    [0.35, 0.98],
  ];
  const shaft = new T.Mesh(
    c.own(
      new T.LatheGeometry(
        profile.map(([r, y]) => new T.Vector2(r, y)),
        8,
      ),
    ),
    stone,
  );
  shaft.rotation.y = Math.PI / 8;
  plinth.add(shaft);
  const cap = c.box(plinth, [0.8, 0.1, 0.8], [0, 1.03, 0], stone, 0.035);
  const capP = cap.geometry.attributes.position;
  for (let i = 0; i < capP.count; i++)
    capP.setY(
      i,
      -0.05 + (0.1 - capP.getZ(i) * 0.24) * ((capP.getY(i) + 0.05) / 0.1),
    );
  cap.geometry.computeVertexNormals();
  const carved = c.canvas(1024, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.textAlign = "center";
    x.font = "42px serif";
    x.fillStyle = "#c3c1b2";
    x.fillText("THE CODE LIVES ON", w / 2, h * 0.47);
    x.fillStyle = "#484e47";
    x.fillText("THE CODE LIVES ON", w / 2 + 1, h * 0.47 - 2);
    x.font = "24px serif";
    x.fillText("3 JANUARY 2009", w / 2, h * 0.72);
  });
  const inscription = c.face(plinth, carved, 0.43, 0.14, [0, 0.57, 0.263]);
  inscription.material.transparent = true;
  inscription.material.depthWrite = false;
  inscription.material.bumpMap = carved;
  inscription.material.bumpScale = -0.002;
  c.merge(plinth);
  // Shift only the local stone grain, keeping the geometry in the same world
  // position. This selects a single cut block instead of a mortar intersection.
  for (const mesh of plinth.children) {
    if (!mesh.isMesh) continue;
    if (mesh.material === stone) {
      const p = mesh.geometry.attributes.position,
        n = mesh.geometry.attributes.normal;
      const colours = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const seed = Math.abs(
          Math.sin(
            Math.round(x * 10000) * 1.13 +
              Math.round(y * 10000) * 0.71 +
              Math.round(z * 10000) * 0.39,
          ),
        );
        if (
          Math.abs(n.getX(i)) + Math.abs(n.getY(i)) + Math.abs(n.getZ(i)) >
          1.08
        ) {
          p.setX(i, x - Math.sign(x) * seed * 0.005);
          p.setZ(i, z - Math.sign(z) * seed * 0.005);
          if (n.getY(i) > 0.1) p.setY(i, y - seed * 0.003);
        }
        const dirt = Math.max(0, 1 - y / 0.18),
          shade = 0.95 + seed * 0.05;
        colours.set(
          [
            shade * (1 - dirt * 0.11),
            shade * (1 - dirt * 0.07),
            shade * (1 - dirt * 0.15),
          ],
          i * 3,
        );
      }
      mesh.geometry.setAttribute("color", new T.BufferAttribute(colours, 3));
      stone.vertexColors = true;
      mesh.geometry.translate(1, 1.3, 1.5);
      mesh.position.set(-1, -1.3, -1.5);
    } else mesh.castShadow = false;
  }
  const lichen = c.canvas(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) {
      const px = (i * 73 + 11) % w,
        py = (i * 47 + 17) % h;
      if (Math.abs(px - w / 2) < w * 0.35 && Math.abs(py - h / 2) < h * 0.44)
        continue;
      x.fillStyle =
        i % 3 === 0 ? "rgba(161,162,129,.36)" : "rgba(97,113,91,.30)";
      x.beginPath();
      for (let j = 0; j < 12; j++) {
        const a = (j * Math.PI) / 6,
          r = (2 + (i % 4)) * (0.7 + 0.3 * Math.sin(i * 7 + j * 13));
        const u = px + Math.cos(a) * r,
          v = py + Math.sin(a) * r;
        if (j === 0) x.moveTo(u, v);
        else x.lineTo(u, v);
      }
      x.closePath();
      x.fill();
    }
  });
  const crust = c.face(
    plinth,
    lichen,
    0.74,
    0.74,
    [0, 1.0806, 0],
    [-Math.PI / 2 + Math.atan(0.24), 0, 0],
  );
  crust.material.transparent = true;
  crust.material.depthWrite = false;
  crust.material.roughness = 1;
  crust.material.bumpMap = lichen;
  crust.material.bumpScale = 0.0005;
  const mossTexture = c.canvas(256, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 550; i++) {
      const px = (i * 73) % w,
        py = h - ((i * 47) % h) * (0.2 + 0.5 * Math.abs(Math.sin(i * 0.7)));
      x.fillStyle = i % 3 ? "rgba(74,86,49,.32)" : "rgba(139,143,93,.27)";
      x.beginPath();
      x.ellipse(px, py, 1 + (i % 4), 1 + (i % 3), 0.3, 0, Math.PI * 2);
      x.fill();
    }
  });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const moss = c.face(
      plinth,
      mossTexture,
      0.75,
      0.085,
      [Math.sin(a) * 0.4005, 0.044, Math.cos(a) * 0.4005],
      [0, a, 0],
    );
    moss.material.transparent = true;
    moss.material.depthWrite = false;
    moss.material.roughness = 1;
  }
  const titleTexture = c.canvas(1024, 1450, (x, w, h) => {
    x.fillStyle = "#ece8d9";
    x.fillRect(0, 0, w, h);
    // Fibres, tiny age spots and slightly darker edges, not a distressed poster.
    for (let i = 0; i < 4000; i++) {
      x.fillStyle = i % 2 ? "rgba(97,76,36,.025)" : "rgba(255,255,255,.15)";
      x.fillRect((i * 139) % w, (i * 277) % h, 1 + (i % 3), 1);
    }
    x.textAlign = "center";
    x.fillStyle = "#252821";
    x.font = "bold 76px Georgia, serif";
    x.fillText("Bitcoin: A Peer-to-Peer", w / 2, 150);
    x.fillText("Electronic Cash System", w / 2, 209);
    x.font = "28px Georgia, serif";
    x.fillText("Satoshi Nakamoto", w / 2, 278);
    x.font = "22px Georgia, serif";
    x.fillText("www.bitcoin.org", w / 2, 315);
    x.textAlign = "left";
    x.font = "bold 26px Georgia, serif";
    x.fillText("Abstract.", 95, 409);
    x.font = "25px Georgia, serif";
    const lines = [
      "Electronic cash can move directly between people,",
      "without a financial institution in the middle. A shared",
      "chain of proof of work records the order of transactions",
      "and lets the network agree on a single history.",
      "Each participant can verify that history independently.",
      "The system remains open: nodes may leave and return,",
      "accepting the longest chain as proof of what happened.",
    ];
    lines.forEach((l, i) => x.fillText(l, 95, 458 + i * 40));
    x.font = "bold 32px Georgia, serif";
    x.fillText("1   Introduction", 95, 848);
    x.font = "25px Georgia, serif";
    [
      "Commerce on the Internet has come to rely on trust.",
      "Cryptographic proof offers another way: transactions",
      "that can be verified by anyone, without permission.",
      "",
      "The network timestamps transactions by hashing",
      "them into an ongoing chain of proof of work.",
    ].forEach((l, i) => x.fillText(l, 95, 900 + i * 40));
    x.textAlign = "center";
    x.font = "22px Georgia, serif";
    x.fillText("1", w / 2, h - 70);
  });
  const flutter = { value: 0 };
  const stack = new T.Group();
  stack.position.set(0, 1.0804, 0);
  stack.rotation.set(Math.atan(0.24), 0, 0);
  plinth.add(stack);
  const underPaper = mat("paper", 0xfdfdfb);
  const underCompile = underPaper.onBeforeCompile;
  underPaper.side = T.DoubleSide;
  underPaper.onBeforeCompile = (shader) => {
    underCompile(shader);
    shader.uniforms.landmarkWind = flutter;
    shader.vertexShader = "uniform float landmarkWind;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed.y += .001 * pow(abs(position.x)/.25,3.) * (.5+.5*sin(landmarkWind+position.y*1300.+position.z*7.));",
    );
  };
  underPaper.customProgramCacheKey = () =>
    `${paper.customProgramCacheKey()}|landmark-under-sheets-v1`;
  const underGeo = c.own(new T.PlaneGeometry(0.54, 0.72, 12, 20));
  underGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const sheet = new T.Mesh(underGeo, underPaper);
    sheet.position.set(((i % 3) - 1) * 0.001, i * 0.00018, 0);
    sheet.rotation.y = (i % 2) * 0.004;
    stack.add(sheet);
  }
  c.merge(stack, false);
  const pageMaterial = kit.material({
    map: titleTexture,
    emissiveMap: titleTexture,
    emissive: 0xffd49a,
    emissiveIntensity: 0,
    roughness: 0.92,
    side: T.DoubleSide,
  });
  const pageGeo = c.own(new T.PlaneGeometry(0.54, 0.72, 12, 20));
  const topPage = new T.Mesh(pageGeo, pageMaterial);
  topPage.rotation.x = -Math.PI / 2;
  topPage.position.y = 0.0025;
  stack.add(topPage);
  const originalPageCompile = pageMaterial.onBeforeCompile;
  pageMaterial.onBeforeCompile = (shader) => {
    originalPageCompile(shader);
    shader.uniforms.landmarkWind = flutter;
    shader.vertexShader = "uniform float landmarkWind;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed.z += .012 * pow(abs(position.x)/.25, 3.) * (.55+.45*sin(position.y*10.+landmarkWind));",
    );
  };
  pageMaterial.customProgramCacheKey = () => "first-light-landmark-paper-v1";
  const flying = sim.entities.pages.map((_, i) => {
    const mesh = new T.Mesh(pageGeo, pageMaterial);
    mesh.name = `STORY collected page ${i + 1}`;
    scene.add(mesh);
    mesh.visible = false;
    roots.push(mesh);
    return { mesh, age: -1, index: i, from: new T.Vector3() };
  });
  const finale = kit.particles(64, {
    colour: 0xffdca5,
    size: 0.025,
    opacity: 0.25,
  });
  plinth.add(finale);
  for (let i = 0; i < 64; i++)
    finale.geometry.attributes.position.setXYZ(
      i,
      Math.sin(i * 9) * 1.4,
      0.3 + ((i * 0.037) % 1.8),
      Math.cos(i * 7) * 1.4,
    );

  // A projected silhouette only, never a humanoid model in the world.
  const shadowTexture = c.canvas(256, 1024, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = "#050a13";
    x.shadowColor = "#050a13";
    x.shadowBlur = 7;
    x.beginPath();
    x.moveTo(108, 984);
    x.lineTo(88, 720);
    x.lineTo(56, 405);
    x.bezierCurveTo(27, 354, 57, 285, 84, 266);
    x.bezierCurveTo(69, 232, 68, 165, 87, 125);
    x.bezierCurveTo(103, 102, 112, 78, 128, 68);
    x.bezierCurveTo(144, 78, 151, 102, 169, 125);
    x.bezierCurveTo(189, 165, 187, 232, 173, 266);
    x.bezierCurveTo(202, 285, 230, 352, 200, 407);
    x.lineTo(169, 723);
    x.lineTo(150, 984);
    x.lineTo(136, 984);
    x.lineTo(127, 763);
    x.lineTo(121, 984);
    x.closePath();
    x.fill();
  });
  const softShadow = c.canvas(256, 1024, (x, w, h) => {
    x.filter = "blur(15px)";
    x.drawImage(shadowTexture.image, 0, 0, w, h);
  });
  const silhouetteMaterial = c.own(
    new T.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      color: 0x172139,
    }),
  );
  const silhouette = new T.Mesh(
    c.own(new T.PlaneGeometry(1.15, 8.5, 8, 48)),
    silhouetteMaterial,
  );
  silhouette.geometry.rotateX(-Math.PI / 2);
  silhouette.geometry.translate(0, 0, -4.25);
  const shadowRoot = new T.Group();
  scene.add(shadowRoot);
  roots.push(shadowRoot);
  shadowRoot.add(silhouette);
  shadowRoot.name = "STORY hooded shadow";
  // Bake the actual terrain once: projection follows groundY (and the outer
  // hill relief) without copying the simulation's formula into a shader.
  const resolution = 512,
    heights = new Uint16Array(resolution * resolution);
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++)
      heights[z * resolution + x] = T.DataUtils.toHalfFloat(
        hillHeight(
          sim,
          -8 + ((x + 0.5) * 50) / resolution,
          -140 - ((z + 0.5) * 160) / resolution,
        ),
      );
  const groundTexture = c.own(
    new T.DataTexture(
      heights,
      resolution,
      resolution,
      T.RedFormat,
      T.HalfFloatType,
    ),
  );
  groundTexture.minFilter = groundTexture.magFilter = T.LinearFilter;
  groundTexture.needsUpdate = true;
  silhouette.frustumCulled = false;
  const shadowAmount = { value: 1 };
  silhouetteMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.landmarkShadow = shadowAmount;
    shader.uniforms.landmarkPenumbra = { value: softShadow };
    shader.uniforms.landmarkGround = { value: groundTexture };
    shader.vertexShader =
      "uniform sampler2D landmarkGround;\n" + shader.vertexShader;
    shader.fragmentShader =
      "uniform float landmarkShadow;uniform sampler2D landmarkPenumbra;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
diffuseColor.a=mix(diffuseColor.a,texture2D(landmarkPenumbra,vMapUv).a*opacity,smoothstep(.1,.9,vMapUv.y));
float erosion=fract(sin(dot(floor(vMapUv*vec2(43.,127.)),vec2(12.9898,78.233)))*43758.5453);
diffuseColor.a *= smoothstep(erosion*.85,erosion*.85+.15,landmarkShadow);`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 wp=modelMatrix*vec4(transformed,1.);
wp.y=texture2D(landmarkGround,vec2((wp.x+8.)/50.,(-wp.z-140.)/160.)).r+.024;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;`,
    );
  };
  silhouetteMaterial.customProgramCacheKey = () =>
    "first-light-hooded-shadow-v3";
  const blobTexture = c.canvas(128, 128, (x, w, h) => {
    const gradient = x.createRadialGradient(
      w / 2,
      h / 2,
      3,
      w / 2,
      h / 2,
      w / 2,
    );
    gradient.addColorStop(0, "rgba(3,9,18,.65)");
    gradient.addColorStop(1, "rgba(3,9,18,0)");
    x.fillStyle = gradient;
    x.fillRect(0, 0, w, h);
  });
  const blobMaterial = c.own(
    new T.MeshBasicMaterial({
      map: blobTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
    }),
  );
  const blob = new T.Mesh(c.own(new T.PlaneGeometry(0.8, 0.8)), blobMaterial);
  blob.name = "STORY landing blob";
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);
  roots.push(blob);
  const shadowMotes = kit.particles(48, {
    colour: 0xbac9b1,
    size: 0.025,
    opacity: 0.2,
  });
  drifting(shadowMotes, 0.13, 1.1);
  const shadowSeeds = shadowMotes.geometry.attributes.position;
  for (let i = 0; i < shadowSeeds.count; i++)
    shadowSeeds.setXYZ(
      i,
      Math.sin(i * 8) * 0.42,
      (i * 0.071) % 1,
      (-i / shadowSeeds.count) * 8.5,
    );
  const shadowMoteCompile = shadowMotes.material.onBeforeCompile;
  shadowMotes.material.onBeforeCompile = (shader) => {
    shadowMoteCompile(shader);
    shader.uniforms.landmarkGround = { value: groundTexture };
    shader.vertexShader =
      "uniform sampler2D landmarkGround;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "vec4 wp=modelMatrix*vec4(transformed,1.);wp.y=texture2D(landmarkGround,vec2((wp.x+8.)/50.,(-wp.z-140.)/160.)).r+transformed.y+.08;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;",
    );
  };
  shadowMotes.material.customProgramCacheKey = () =>
    "landmark-shadow-motes-on-terrain-v1";
  shadowMotes.frustumCulled = false;
  scene.add(shadowMotes);
  roots.push(shadowMotes);
  let minedBefore = false,
    genesisAge = -1,
    shadowBefore = 1,
    dissolveAge = -1;
  const shadowOrigin = new T.Vector3();
  const v = new T.Vector3();
  for (const root of roots)
    root.traverse((object) => {
      object.userData.noReflect = true;
    });
  return {
    update({ snapshot: s, dt, time, env }) {
      if (s.genesisMined && !minedBefore) genesisAge = 0;
      if (!s.genesisMined) genesisAge = -1;
      minedBefore = s.genesisMined;
      if (genesisAge >= 0) genesisAge += dt;
      minedScreen.value = s.genesisMined ? 1 : 0;
      screenMat.emissiveIntensity = s.genesisMined ? 1.05 : 0.65;
      diskMaterial.emissiveIntensity = s.genesisMined
        ? reduced
          ? 1.2
          : 1 + 0.6 * Math.sin(time * 4) * Math.sin(time * 2.3)
        : 0.12;
      if (s.genesisMined && !reduced) fan.rotation.z += dt * 18;
      genesisBlock.visible = genesisAge >= 0 && genesisAge < 4.4;
      const form = T.MathUtils.smoothstep(genesisAge, 0, 1.4),
        flight = T.MathUtils.smoothstep(genesisAge, 2.6, 4.4);
      genesisBlock.scale.setScalar(Math.max(0.001, form * (1 - flight * 0.75)));
      // Leave through the west-facing garage door before arcing to the river.
      const exit = T.MathUtils.smoothstep(flight, 0, 0.25),
        river = T.MathUtils.smoothstep(flight, 0.25, 1);
      genesisBlock.position.set(
        22 - 1.6 * exit - 0.4 * river,
        T.MathUtils.lerp(1.64, 2.05, form) + Math.sin(river * Math.PI) * 1.5,
        -89.84 - river * 24,
      );
      genesisRadiance
        .set(0xffa641)
        .multiplyScalar(genesisBlock.visible ? form * (1 - flight) * 0.7 : 0);
      lightVolume.shellMaterial.opacity = 0.5 + 0.1 * form;
      lightVolume.air.material.opacity = 0.09 * form * (1 - flight);
      genesisBlock.rotation.set(0.12, reduced ? 0.2 : genesisAge * 0.16, 0.06);
      streak.visible = !reduced && genesisBlock.visible && flight > 0;
      streak.position.copy(genesisBlock.position);
      streak.rotation.y = T.MathUtils.lerp(
        Math.PI / 2,
        0.017,
        T.MathUtils.smoothstep(flight, 0.16, 0.38),
      );
      streak.scale.setScalar(Math.max(0.001, Math.sin(flight * Math.PI)));
      streak.material.opacity = 0.16 * Math.sin(flight * Math.PI);
      moteClock.value = reduced ? 0 : time;
      genesisMotes.visible = genesisAge >= 0 && genesisAge < 4.4;
      masts.forEach(({ beacon, glow }, i) => {
        const lit = !!s.nodes[i]?.lit;
        nodeAges[i] = lit ? Math.max(0, nodeAges[i]) + dt : -1;
        beacon.material.emissiveIntensity = lit ? 1.6 : 0;
        glow.visible = lit;
      });
      far.visible = s.zone >= 3;
      mastBackdrop.visible = s.zone === 6;
      proxyGlow.visible = s.nodes.every((node) => node.lit);
      farBeacons.forEach((points, i) => {
        points.visible = nodeAges[i] > 0.8;
        points.material.opacity =
          0.7 * T.MathUtils.smoothstep(nodeAges[i], 0.8, 3.5);
      });
      beams.forEach(({ g, index, other, material }) => {
        g.visible =
          !!s.nodes[index]?.lit && (other < 0 || !!s.nodes[other]?.lit);
        const age =
          other < 0
            ? nodeAges[index] - 0.8
            : Math.min(nodeAges[index], nodeAges[other]);
        material.opacity =
          T.MathUtils.smoothstep(age, 0, 1.2) *
          (0.14 + 0.16 * Math.exp(-Math.max(0, age - 1.2) * 0.5));
      });
      stoneBounce
        .copy(env.sunColour)
        .multiplyScalar(T.MathUtils.smoothstep(env.sunDir.y, 0, 0.15) * 0.6);
      flutter.value = reduced ? 0 : time * 0.8;
      const dist = Math.hypot(
        s.player.x - sim.entities.plinth.x,
        s.player.z - sim.entities.plinth.z,
      );
      flying.forEach((f) => {
        if (!s.pagesTaken[f.index]) {
          f.age = -1;
          f.mesh.visible = false;
          return;
        }
        if (dist < 10 && f.age < 0) {
          f.age = 0;
          f.from.set(
            s.player.x + Math.sin(f.index) * 0.5,
            s.player.y + 1.2,
            s.player.z,
          );
        }
        if (f.age < 0) return;
        f.age += dt;
        const t = T.MathUtils.clamp((f.age - f.index * 0.1) / 2.15, 0, 1),
          ease = t * t * (3 - 2 * t);
        f.mesh.visible = !reduced && t > 0 && t < 1;
        v.set(
          sim.entities.plinth.x,
          sim.entities.plinth.y + 1.0844,
          sim.entities.plinth.z,
        );
        f.mesh.position.copy(f.from).lerp(v, ease);
        f.mesh.position.y += Math.sin(t * Math.PI) * 0.8;
        f.mesh.rotation.set(
          -Math.PI / 2 + Math.atan(0.24) * ease + Math.sin(t * Math.PI) * 0.4,
          0,
          (1 - ease) * Math.sin(f.index) * 0.9,
        );
      });
      pageMaterial.emissiveIntensity =
        0.06 * T.MathUtils.smoothstep(s.ending, 0, 2);
      finale.material.opacity =
        0.18 *
        T.MathUtils.smoothstep(s.ending, 0, 1.2) *
        (1 - 0.3 * T.MathUtils.smoothstep(s.ending, 1.6, 2.4));
      finale.visible = s.ending > 0;
      finale.rotation.y = reduced ? 0 : time * 0.012;
      finale.position.y = reduced
        ? 0
        : 0.12 * T.MathUtils.smoothstep(s.ending, 0, 2.4);
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
      blob.position.set(p.x, floor + 0.025, p.z);
      blob.visible = !p.grounded;
      blobMaterial.opacity = 0.35 / (1 + Math.max(0, p.y - floor) * 0.25);
      shadowRoot.position.set(p.x, 0, p.z);
      shadowRoot.rotation.y = Math.atan2(env.sunDir.x, env.sunDir.z);
      shadowAmount.value = s.shadow;
      silhouetteMaterial.opacity =
        0.68 * T.MathUtils.smoothstep(env.sunDir.y, -0.025, 0.04);
      shadowRoot.visible = s.zone >= 4 && s.shadow > 0;
      silhouette.scale.z = T.MathUtils.clamp(
        1.65 / (8.5 * Math.max(0.06, env.sunDir.y)),
        0.8,
        2.8,
      );
      if (s.shadow > shadowBefore + 0.5) dissolveAge = -1;
      if (s.shadow < shadowBefore && dissolveAge < 0) {
        dissolveAge = 0;
        shadowOrigin.set(p.x, 0, p.z);
        shadowMotes.rotation.y = shadowRoot.rotation.y;
        shadowMotes.scale.z = silhouette.scale.z;
      }
      shadowBefore = s.shadow;
      if (dissolveAge >= 0) dissolveAge += dt;
      shadowMotes.visible = !reduced && dissolveAge >= 0 && dissolveAge < 8;
      if (shadowMotes.visible) {
        shadowMotes.position.copy(shadowOrigin);
        shadowMotes.position.x += dissolveAge * 0.12;
        shadowMotes.material.opacity =
          0.18 * Math.sin(Math.min(1, dissolveAge / 8) * Math.PI);
      }
    },
    dispose() {
      unregister.forEach((f) => f());
      roots.forEach((g) => g.removeFromParent());
      c.dispose();
    },
  };
}
