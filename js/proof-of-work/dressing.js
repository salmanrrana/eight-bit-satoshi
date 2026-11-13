import * as T from "three";
import { gaugeFace, keyboardLegends } from "./instruments.js";

// Small-scale construction detail shares the world's batching helpers. None of
// these fixtures extend into the walkable envelope defined by the simulation.
export function dressWorld(scene, m, { box, cylinder, pipe, sign }, dark) {
  const fastener = (x, y, z, group = null) =>
    cylinder(x, y, z, 0.012, 0.012, m.steel, Math.PI / 2, 0, group);
  const paper = m.concrete.clone();
  paper.color.set(0xb8b6a6);
  const rust = m.paint.clone();
  rust.color.set(0x795040);
  // Water follows gravity: a coarse tide line, thin leaks under joints and a
  // lower damp band. Transparent stains have no effect on the wall silhouette.
  const dirt = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 v;
      float hash(float p){return fract(sin(p*127.1)*43758.5453);}
      void main(){float stripe=hash(floor(v.x*147.));float drip=pow(max(0.,sin(v.x*293.)),14.)*stripe;
      float tide=1.-smoothstep(.08,.3+sin(v.x*21.)*.04,v.y);
      float a=(tide*.52+drip*(1.-v.y)*.25);gl_FragColor=vec4(.025,.031,.027,a);}`,
  });
  for (const [edge, z, length, height] of [
    [1.49, 4, 8, 3],
    [5.99, -8, 16, 6],
    [1.99, -18.5, 5, 3.2],
  ]) {
    for (const side of [-1, 1]) {
      const stain = new T.Mesh(new T.PlaneGeometry(length, height), dirt);
      stain.position.set(side * edge, height / 2, z);
      stain.rotation.y = (-side * Math.PI) / 2;
      scene.add(stain);
      box(side * (edge - 0.035), 0.11, z, 0.065, 0.22, length, dark);
    }
  }
  // Corridor: tray, visible tube with metal end caps, cable glands, drain.
  for (const x of [-0.53, 0.53]) box(x, 2.7, 4, 0.035, 0.13, 7.8, dark);
  for (let z = 0.2; z < 8; z += 0.24)
    box(0, 2.67, z, 1.1, 0.025, 0.035, m.steel);
  for (let x = -0.42; x < 0.5; x += 0.13)
    pipe(
      [
        [x, 2.73, 0.2],
        [x + 0.05, 2.71, 3],
        [x, 2.75, 7.8],
      ],
      0.018,
      m.rubber,
    );
  cylinder(0, 2.79, 3, 0.025, 1.16, paper, 0, Math.PI / 2);
  for (const x of [-0.59, 0.59])
    cylinder(x, 2.79, 3, 0.031, 0.055, m.steel, 0, Math.PI / 2);
  for (const z of [1.8, 4.2]) {
    box(-1.4, 2.15, z, 0.15, 0.42, 0.32, m.paint);
    for (const y of [2, 2.3]) box(-1.31, y, z, 0.015, 0.018, 0.26, m.steel);
    cylinder(-1.4, 2.5, z, 0.025, 0.32, m.steel);
  }
  for (const {
    bounds: [l, r, n, s],
    height,
  } of window.ProofOfWork.layout.filter((o) => o.kind === "entry-frame"))
    box((l + r) / 2, height / 2, (n + s) / 2, r - l, height, s - n, dark);
  box(0, 2.98, 0.08, 2.9, 0.14, 0.22, dark);
  box(0, 0.01, 7.2, 2.6, 0.015, 0.28, m.rubber);
  for (let x = -1.25; x < 1.3; x += 0.075)
    box(x, 0.025, 7.2, 0.025, 0.02, 0.25, m.steel);
  sign("08 / HASH HALL", -0.02, 2.46, 0.2, 1.8, 0.16, 0, "#b2b9ad", "#142020");
  sign(
    "DANGER\nHIGH VOLTAGE",
    1.48,
    1.5,
    2.5,
    0.36,
    0.48,
    -Math.PI / 2,
    "#21221f",
    "#b9a167",
  );
  // Partition rails provide actual depth at the dirty glass boundaries.
  for (const x of [-1.94, -0.84, 0.84, 1.94])
    box(x, 1.5, -15.94, 0.06, 3, 0.16, m.paint);
  for (const y of [0.15, 1.03, 2.95])
    for (const x of [-1.4, 1.4]) box(x, y, -15.94, 1.08, 0.055, 0.16, m.paint);
  for (const x of [-1.4, 1.4]) box(x, 0.99, -15.86, 1.08, 0.045, 0.28, dark);
  box(0, 3.04, -16, 3.9, 0.15, 0.25, dark);
  // Control room perimeter trunking, panel joints and skirting.
  for (const x of [-1.94, 1.94]) {
    box(x, 2.85, -18.5, 0.09, 0.14, 4.8, m.paint);
    box(x, 0.09, -18.5, 0.08, 0.18, 4.8, dark);
    for (const z of [-17, -18, -19, -20]) {
      box(x, 1.6, z, 0.012, 2.9, 0.012, dark);
      box(x, 2.85, z, 0.11, 0.17, 0.04, m.steel);
    }
  }
  box(0, 2.85, -20.94, 3.9, 0.14, 0.09, m.paint);
  // Desk fascia, drawers, cable raceway and feet. Front is the shared solid edge.
  box(0, 0.71, -19.35, 3.5, 0.18, 0.09, dark);
  for (const x of [-1.48, 1.48]) {
    box(x, 0.41, -19.82, 0.44, 0.74, 0.86, m.paint);
    for (const y of [0.26, 0.56]) {
      box(x, y, -19.37, 0.39, 0.25, 0.025, dark);
      box(x, y + 0.04, -19.34, 0.15, 0.025, 0.04, m.steel);
    }
  }
  // Meter panel behind the lever. Each scale has real tick marks and a needle.
  const panel = new T.Group();
  panel.position.set(0.62, 1.2, -20.1);
  scene.add(panel);
  box(0, 0, 0, 1.45, 0.45, 0.12, m.paint, panel);
  for (const x of [-0.48, 0, 0.48]) {
    const bezel = new T.Mesh(
      new T.CylinderGeometry(0.14, 0.14, 0.025, 48),
      m.rubber,
    );
    bezel.position.set(x, 0.025, 0.07);
    bezel.rotation.x = Math.PI / 2;
    panel.add(bezel);
    const face = new T.Mesh(
      new T.CircleGeometry(0.118, 48),
      gaugeFace(x < 0 ? "AMPS" : x === 0 ? "VOLTS" : "TEMP"),
    );
    face.position.set(x, 0.025, 0.086);
    panel.add(face);
    const needle = box(x + 0.02, 0.055, 0.096, 0.006, 0.09, 0.003, rust, panel);
    needle.rotation.z = -0.48;
    fastener(x - 0.19, 0.16, 0.075, panel);
    fastener(x + 0.19, -0.16, 0.075, panel);
  }
  // Secondary switch deck and lever boot/slot.
  box(1.25, 1.11, -19.55, 0.35, 0.025, 0.43, m.rubber);
  for (const x of [1.08, 1.42])
    for (const z of [-19.37, -19.72])
      cylinder(x, 1.13, z, 0.016, 0.015, m.steel);
  for (let i = 0; i < 5; i++) {
    const x = -0.23 + i * 0.19;
    cylinder(x, 0.95, -19.65, 0.037, 0.035, dark);
    cylinder(x, 0.99, -19.65, 0.012, 0.07, m.steel, 0, 0);
  }
  const warning = sign(
    "MASTER / HOLD TO ISOLATE",
    1.25,
    1.13,
    -19.8,
    0.44,
    0.1,
    0,
    "#b9a167",
    "#17201f",
  );
  warning.rotation.x = -Math.PI / 2;
  // Curved CRT protective face: a shallow sphere segment over the display.
  const screenGlass = new T.MeshPhysicalMaterial({
    color: 0x54776c,
    roughness: 0.2,
    metalness: 0.2,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 0.5,
  });
  const screen = new T.Mesh(
    new T.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, 0.28),
    screenGlass,
  );
  screen.rotation.x = Math.PI / 2;
  screen.scale.set(1.1, 1, 0.75);
  screen.position.set(-0.9, 1.3, -20.62);
  scene.add(screen);
  for (let x = -1.22; x < -0.65; x += 0.035)
    box(x, 1.54, -19.675, 0.012, 0.035, 0.012, dark);
  for (const x of [-1.2, -1.1])
    cylinder(x, 1.03, -19.66, 0.023, 0.022, dark, Math.PI / 2);
  // Keyboard chassis and printed legends preserve the close-up's scale.
  box(-0.85, 0.934, -19.49, 0.82, 0.025, 0.29, dark);
  scene.add(keyboardLegends());
  // Service manuals sit above the console, outside the walking envelope.
  box(1.8, 1.94, -20.1, 0.35, 0.045, 0.9, dark);
  for (let i = 0; i < 5; i++)
    box(1.8, 2.1, -20.43 + i * 0.15, 0.26, 0.28, 0.09, i % 2 ? paper : rust);
  sign(
    "SERVICE / ARCHIVE",
    1.615,
    1.92,
    -20.1,
    0.73,
    0.07,
    -Math.PI / 2,
    "#a8afa7",
    "#18201e",
  );
  // Office dressing: pinned service notes and a clock, all in the wall envelope.
  box(-1.96, 1.85, -18.6, 0.045, 1.05, 1.5, dark);
  const cork = m.concrete.clone();
  cork.color.set(0x65533e);
  box(-1.932, 1.85, -18.6, 0.014, 0.94, 1.4, cork);
  for (const [z, y, w, h, text] of [
    [
      -18.93,
      1.95,
      0.52,
      0.64,
      "SERVICE LOG\n11 / 08\nBANK C / FAN 04\nBEARING REPLACED\nRECHECK 480V",
    ],
    [
      -18.33,
      1.98,
      0.48,
      0.55,
      "SHIFT 03\nINSULATION TEST\nDUE FRIDAY\nISOLATE FIRST",
    ],
    [-18.4, 1.58, 0.5, 0.18, "KEEP THIS DOOR CLOSED"],
  ]) {
    const note = sign(
      text,
      -1.919,
      y,
      z,
      w,
      h,
      Math.PI / 2,
      "#1e2420",
      "#aaa998",
    );
    note.rotation.x = (z + 18.6) * 0.06;
    cylinder(-1.907, y + h * 0.4, z, 0.009, 0.009, rust, 0, Math.PI / 2);
  }
  const clock = new T.Group();
  clock.position.set(1.6, 1.9, -20.9);
  scene.add(clock);
  cylinder(0, 0, 0, 0.23, 0.06, dark, Math.PI / 2, 0, clock);
  const clockFace = new T.Mesh(new T.CircleGeometry(0.205, 32), paper);
  clockFace.position.z = 0.035;
  clock.add(clockFace);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const t = box(
      Math.sin(a) * 0.17,
      Math.cos(a) * 0.17,
      0.04,
      0.012,
      0.032,
      0.005,
      dark,
      clock,
    );
    t.rotation.z = -a;
  }
  box(0, 0.055, 0.046, 0.012, 0.11, 0.005, dark, clock);
  const hand = box(0.065, 0, 0.05, 0.13, 0.009, 0.005, dark, clock);
  hand.rotation.z = -0.3;
  // Vent with layered louvers and a non-glowing utility fixture.
  box(1.97, 2.3, -17.8, 0.05, 0.52, 0.7, dark);
  for (let y = 2.1; y < 2.52; y += 0.045)
    box(1.93, y, -17.8, 0.065, 0.023, 0.61, m.steel);
  box(0, 2.96, -19, 1.65, 0.12, 0.36, dark);
  for (const z of [-18.91, -19.09])
    cylinder(0, 2.88, z, 0.027, 1.4, paper, 0, Math.PI / 2);
  // A rubber standing mat sits under the chair. Its tread is geometry, not a
  // screen-space overlay, so grazing illumination finds the raised ribs.
  box(0.15, 0.009, -18.55, 1.1, 0.016, 1.12, m.rubber);
  for (let z = -19.04; z < -18.04; z += 0.045)
    box(0.15, 0.02, z, 1, 0.008, 0.012, dark);
}
