// All PCM and outdoor responses are synthesized once, during createAudio(), before
// play. Hits only start a buffer on a free, already-connected voice strip.
const RATE = 24000;
const TAU = Math.PI * 2;
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const clamp = (value, low = 0, high = 1) =>
  Math.max(low, Math.min(high, finite(value, low)));
const random = (low, high) => low + Math.random() * (high - low);

function noiseSamples() {
  const white = new Float32Array(Math.ceil(RATE * 6.13));
  const pink = new Float32Array(white.length);
  let seed = 0x215a70,
    slow = 0,
    middle = 0;
  for (let i = 0; i < white.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const w = (seed >>> 0) / 2147483648 - 1;
    white[i] = w;
    slow = slow * 0.995 + w * 0.005;
    middle = middle * 0.94 + w * 0.06;
    pink[i] = slow * 5 + middle * 1.7 + w * 0.08;
  }
  return { white, pink };
}

// A half-cosine attack and release give even the mechanical ticks smooth ends.
function envelope(t, duration, attack) {
  if (t < 0 || t >= duration) return 0;
  const release = Math.min(0.045, duration * 0.22);
  const inGain = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1;
  const outGain =
    t > duration - release
      ? 0.5 - 0.5 * Math.cos((Math.PI * (duration - t)) / release)
      : 1;
  return inGain * outGain;
}

function finish(data, peak) {
  // Remove the integral without introducing a nonzero first/last sample.
  let sum = 0,
    weight = 0,
    maximum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    const t = i / (data.length - 1);
    weight += t * (1 - t);
  }
  for (let i = 0; i < data.length; i++) {
    const t = i / (data.length - 1);
    data[i] -= (sum / weight) * t * (1 - t);
    maximum = Math.max(maximum, Math.abs(data[i]));
  }
  const scale = peak / (maximum || 1);
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  data[0] = data[data.length - 1] = 0;
  return data;
}

function makeLibrary(ctx, noise) {
  const library = new Map();
  let seed = 197;
  function sound(name, duration, peak, recipe) {
    const data = new Float32Array(Math.ceil(duration * RATE));
    function tone(
      frequency,
      end,
      length,
      level,
      delay = 0,
      attack = 0.004,
      rough = false,
      decay = 4.5,
    ) {
      let phase = 0,
        hz = frequency,
        amplitude = level;
      const sweep = (end / frequency) ** (1 / (length * RATE));
      const release = Math.exp(-decay / (length * RATE));
      const offset = Math.round(delay * RATE);
      for (let i = 0; i < length * RATE && i + offset < data.length; i++) {
        const t = i / RATE;
        phase += (TAU * hz) / RATE;
        hz *= sweep;
        const wave =
          Math.sin(phase) +
          (rough ? Math.sin(phase * 3) / 9 + Math.sin(phase * 5) / 25 : 0);
        data[i + offset] += wave * amplitude * envelope(t, length, attack);
        amplitude *= release;
      }
    }
    function hiss(
      frequency,
      length,
      level,
      delay = 0,
      attack = 0.004,
      q = 0.7,
      decay = 4.5,
    ) {
      // A pre-rendered biquad, so there is no filter allocation on a hit.
      const omega = (TAU * frequency) / RATE;
      const alpha = Math.sin(omega) / (2 * q);
      const b0 = alpha / (1 + alpha);
      const a1 = (-2 * Math.cos(omega)) / (1 + alpha);
      const a2 = (1 - alpha) / (1 + alpha);
      let x1 = 0,
        x2 = 0,
        y1 = 0,
        y2 = 0;
      const offset = Math.round(delay * RATE);
      const start = (seed++ * 7919) % noise.white.length;
      let amplitude = level;
      const release = Math.exp(-decay / (length * RATE));
      for (let i = 0; i < length * RATE && i + offset < data.length; i++) {
        const x = noise.white[(start + i) % noise.white.length];
        const y = b0 * (x - x2) - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        data[i + offset] += y * amplitude * envelope(i / RATE, length, attack);
        amplitude *= release;
      }
    }
    recipe(tone, hiss);
    const buffer = ctx.createBuffer(1, data.length, RATE);
    buffer.copyToChannel(finish(data, peak), 0);
    library.set(name, buffer);
  }
  // Each weapon has its own body, spectrum, cycle and envelope. The small
  // variants are rendered here, never assembled on the firing frame.
  for (const weapon of ["carbine", "scatter", "rail", "arc"]) {
    for (let variant = 0; variant < 4; variant++) {
      const p = 0.97 + variant * 0.02;
      const duration = { carbine: 0.24, scatter: 0.58, rail: 0.43, arc: 0.14 }[
        weapon
      ];
      sound(
        `shot-${weapon}-${variant}`,
        duration,
        { carbine: 0.68, scatter: 0.82, rail: 0.8, arc: 0.52 }[weapon],
        (t, n) => {
          if (weapon === "carbine") {
            t(158 * p, 54, 0.16, 0.52, 0, 0.0025, true);
            n(2900 * p, 0.044, 1.2, 0, 0.0018);
            n(850, 0.12, 0.6, 0.003);
            n(4700, 0.025, 0.25, 0.045);
            t(1350, 990, 0.048, 0.08, 0.06);
          } else if (weapon === "scatter") {
            t(92 * p, 31, 0.44, 1, 0, 0.004, true);
            n(410, 0.29, 1.3, 0, 0.003);
            n(1700, 0.095, 0.95, 0.002, 0.002);
            n(3200, 0.05, 0.5, 0.012);
            n(950, 0.1, 0.25, 0.31);
            t(310, 160, 0.16, 0.13, 0.34);
          } else if (weapon === "rail") {
            // A tight electrical shear over a hard falling rail/body mode.
            t(330 * p, 48, 0.31, 0.7, 0, 0.0025, true);
            n(5900 * p, 0.025, 1.5, 0, 0.0015);
            n(1800, 0.08, 0.8, 0.004);
            t(2780 * p, 410, 0.23, 0.22, 0.018);
            t(790, 170, 0.28, 0.19, 0.04);
          } else {
            // No ballistic bass/bolt: a brief high, inharmonic electric snap.
            t(1850 * p, 640, 0.095, 0.6, 0, 0.002);
            t(3110 * p, 1270, 0.075, 0.3, 0.006, 0.002);
            n(4300, 0.035, 0.65, 0, 0.0018);
            n(2200, 0.06, 0.3, 0.04);
          }
        },
      );
    }
    const pitch = { carbine: 1, scatter: 0.65, rail: 1.4, arc: 1.9 }[weapon];
    for (const [event, delay, peak] of [
      ["dry", 0, 0.1],
      ["reload-out", 0.08, 0.16],
      ["reload-in", 0.05, 0.22],
      ["reload-rack", 0.13, 0.2],
    ]) {
      sound(`${event}-${weapon}`, 0.32, peak, (t, n) => {
        n(2100 * pitch, 0.042, 0.7);
        t(420 * pitch, 170 * pitch, 0.13, 0.22, delay);
        if (event !== "dry") n(850 * pitch, 0.12, 0.5, delay, 0.012);
        if (event === "reload-rack") n(3400, 0.04, 0.65, 0.19);
      });
    }
  }
  const materials = {
    sand: [610, 0.1, 0.23],
    wet: [1500, 0.2, 0.24],
    grass: [2300, 0.14, 0.19],
    rock: [1450, 0.13, 0.3],
    metal: [3100, 0.27, 0.3],
    concrete: [1080, 0.11, 0.28],
  };
  for (const [surface, [f, length, peak]] of Object.entries(materials)) {
    const hard = surface === "metal";
    sound(`impact-${surface}`, length + 0.07, peak, (t, n) => {
      n(f, length, 0.8, 0, 0.0025);
      t(surface === "wet" ? 320 : 170, 65, 0.07, 0.15);
      if (hard)
        for (const ratio of [1, 1.63, 2.37])
          t(f * ratio * 0.47, f * ratio * 0.465, length, 0.14 / ratio);
      else n(f * 1.7, length * 0.7, 0.22, 0.024, 0.006);
    });
    sound(`casing-${surface}`, 0.39, hard ? 0.12 : 0.065, (t, n) => {
      for (let i = 0; i < 3; i++) {
        const delay = [0, 0.105, 0.19][i],
          strength = 1 / (i + 1);
        n(f * 1.3, 0.03, 0.25 * strength, delay, 0.002);
        t(
          3420,
          3350,
          hard ? 0.13 : 0.045,
          (hard ? 0.1 : 0.015) * strength,
          delay,
        );
      }
    });
    sound(`step-${surface}`, 0.23, 0.13, (t, n) => {
      t(87, 40, 0.12, 0.24, 0, 0.009);
      n(f * 0.8, 0.16, 0.7, 0.002, 0.009);
      n(f * 1.4, 0.1, 0.2, 0.055, 0.008);
      if (hard) t(417, 407, 0.19, 0.08);
    });
  }
  sound("jump", 0.22, 0.1, (t, n) => {
    n(700, 0.19, 1, 0, 0.02);
    t(100, 60, 0.15, 0.2);
  });
  sound("land", 0.32, 0.25, (t, n) => {
    t(94, 35, 0.27, 0.7, 0, 0.007);
    n(500, 0.22, 1);
  });
  sound("rail-charge", 0.34, 0.17, (t, n) => {
    t(440, 2300, 0.32, 0.45, 0, 0.04, false, -0.8);
    t(653, 3410, 0.32, 0.16, 0, 0.04, false, -0.8);
    n(3700, 0.3, 0.16, 0, 0.05, 0.7, -0.5);
  });
  sound("arc-heat", 0.25, 0.12, (t, n) => {
    t(980, 1450, 0.23, 0.5, 0, 0.025);
    n(4300, 0.23, 0.35, 0, 0.03);
  });
  sound("arc-vent", 0.95, 0.22, (t, n) => {
    n(3900, 0.85, 1, 0, 0.025, 0.6, 2.2);
    n(900, 0.65, 0.5, 0.04, 0.04);
    t(790, 210, 0.7, 0.12);
  });
  for (const [name, f, peak] of [
    ["swap", 670, 0.12],
    ["pickup-weapon", 940, 0.18],
    ["pickup-ammo", 1450, 0.13],
    ["charge-throw", 490, 0.12],
    ["charge-bounce", 2100, 0.17],
    ["hit", 2400, 0.13],
  ])
    sound(name, 0.3, peak, (t, n) => {
      n(f, 0.16, 0.7, 0, 0.007);
      t(f * 0.6, f * 0.3, 0.21, 0.2);
      if (name === "pickup-weapon") t(440, 660, 0.19, 0.15, 0.08);
    });
  for (const [kind, pitch] of Object.entries(machinePitch)) {
    sound(`alert-${kind}`, 0.5, 0.17, (t, n) => {
      t(260 * pitch, 400 * pitch, 0.24, 0.45, 0, 0.025, true);
      t(390 * pitch, 530 * pitch, 0.22, 0.35, 0.24, 0.02);
      n(1300 * pitch, 0.12, 0.3);
    });
    for (const type of ["kill", "explode"]) {
      const duration =
        kind === "gnat"
          ? 0.62
          : kind === "bulwark" || kind === "siege"
            ? 1.55
            : 0.95;
      sound(
        `${type}-${kind}`,
        duration,
        type === "kill" ? 0.36 : 0.53,
        (t, n) => {
          if (type === "kill") {
            t(690 * pitch, 72, duration * 0.6, 0.35, 0, 0.008, true);
            n(2100 * pitch, duration * 0.24, 0.6);
          } else {
            t(120 * pitch, 29, duration * 0.5, 0.8, 0, 0.006, true);
            n(250 * pitch, duration * 0.65, 1.2, 0, 0.008);
            n(1800, 0.2, 0.6);
          }
          for (let i = 0; i < 4; i++) {
            n(
              1200 + i * 470,
              0.1,
              0.25 / (1 + i * 0.3),
              duration * (0.12 + i * 0.17),
            );
            t(
              (420 + i * 137) * pitch,
              190,
              0.13,
              0.11,
              duration * (0.1 + i * 0.17),
            );
          }
        },
      );
    }
  }
  sound("gnat-shot", 0.18, 0.24, (t, n) => {
    t(2900, 870, 0.13, 0.6);
    n(4100, 0.045, 0.5);
  });
  sound("strider-shot", 0.25, 0.3, (t, n) => {
    t(1240, 260, 0.22, 0.6);
    t(2130, 790, 0.12, 0.25);
    n(3200, 0.06, 0.6);
  });
  sound("watcher-aim", 1.5, 0.18, (t, n) => {
    t(510, 2100, 1.48, 0.35, 0, 0.12, false, -1.4);
    t(765, 3150, 1.48, 0.1, 0, 0.12, false, -1.4);
    n(3200, 1.48, 0.14, 0, 0.12, 0.7, -1);
  });
  sound("watcher-shot", 0.36, 0.42, (t, n) => {
    n(5200, 0.026, 1);
    t(420, 53, 0.28, 0.6);
    t(2900, 430, 0.2, 0.2);
  });
  sound("bulwark-mortar", 0.48, 0.4, (t, n) => {
    t(140, 38, 0.4, 0.7, 0, 0.005, true);
    n(600, 0.26, 0.9);
    n(1900, 0.17, 0.3, 0.08);
  });
  sound("mortar-land", 1.05, 0.6, (t, n) => {
    t(90, 27, 0.72, 0.8);
    n(310, 0.85, 1.1);
    n(2400, 0.21, 0.7);
  });
  sound("bulwark-step", 0.4, 0.2, (t, n) => {
    t(63, 29, 0.3, 0.8, 0, 0.009);
    n(800, 0.15, 0.6);
    t(290, 120, 0.19, 0.1, 0.04);
  });
  sound("hurt", 0.35, 0.28, (t, n) => {
    t(130, 43, 0.32, 0.6);
    n(430, 0.28, 0.9);
  });
  for (const [name, scale, peak] of [
    ["shield-hit", 1, 0.26],
    ["shield-impact", 1.45, 0.25],
  ])
    sound(name, 0.3, peak, (t, n) => {
      for (const f of [510, 811, 1321])
        t(f * scale, f * scale * 0.65, 0.27, 0.18);
      n(3600, 0.09, 0.5);
    });
  for (const [name, scale] of [
    ["shield-break", 1],
    ["enemy-shield-break", 1.4],
  ])
    sound(name, 0.65, 0.36, (t, n) => {
      t(1600 * scale, 70, 0.55, 0.4);
      n(4300, 0.55, 0.8, 0, 0.007);
      n(700, 0.4, 0.7, 0.05);
    });
  for (const [name, base, peak] of [
    ["shield-up", 330, 0.17],
    ["checkpoint", 220, 0.15],
    ["station-clear", 294, 0.16],
    ["station-relight", 165, 0.25],
  ])
    sound(name, 1.55, peak, (t, n) => {
      for (let i = 0; i < 3; i++) {
        const f = base * [1, 1.5, 2.5][i];
        t(f, f, 1.1, 0.32, i * 0.13, 0.03);
        t(f * 2.003, f * 2, 0.55, 0.07, i * 0.13, 0.025);
      }
      n(2900, 0.65, 0.12, 0, 0.08);
    });
  for (let stage = 0; stage < 3; stage++) {
    sound(`hashrate-drop-${stage}`, 2.5, 0.23, (t) => {
      // An original five-note ascent, widening its last interval as stations return.
      for (const [i, ratio] of [
        1,
        1.25,
        1.5,
        2.25,
        [2.5, 3, 4][stage],
      ].entries()) {
        const f = 164.81 * ratio;
        t(f, f, 1.15, 0.3, i * 0.23, 0.045);
        t(f * 2.002, f * 2, 0.8, 0.06, i * 0.23, 0.05);
      }
    });
  }
  sound("coin", 0.38, 0.095, (t, n) => {
    t(1740, 1738, 0.35, 0.4);
    t(2781, 2775, 0.29, 0.2);
    n(4100, 0.025, 0.1);
  });
  sound("page", 0.85, 0.13, (t, n) => {
    for (let i = 0; i < 3; i++) n(1800 + i * 630, 0.23, 0.5, i * 0.11, 0.04);
    t(659, 659, 0.6, 0.14, 0.08, 0.04);
  });
  for (const [name, end] of [
    ["hauler-arrive", 72],
    ["hauler-leave", 32],
  ])
    sound(name, 2.2, 0.3, (t, n) => {
      t(name.endsWith("arrive") ? 32 : 72, end, 2.15, 0.55, 0, 0.3, true, 1.5);
      n(370, 2.1, 0.8, 0, 0.35, 0.7, 1.3);
      n(2200, 1.8, 0.2, 0, 0.4);
    });
  sound("clamp-break", 1.2, 0.5, (t, n) => {
    t(130, 28, 0.7, 0.8);
    n(290, 0.9, 1.2);
    n(3100, 0.28, 0.65);
    for (let i = 0; i < 4; i++) n(1600 + i * 440, 0.16, 0.3, 0.22 + i * 0.2);
  });
  sound("boss-die", 4.4, 0.57, (t, n) => {
    t(86, 26, 3.8, 0.8, 0, 0.04, true);
    n(250, 3.7, 1.2, 0, 0.05);
    n(2100, 0.9, 0.7);
    for (let i = 0; i < 7; i++) {
      t(180 - i * 16, 30, 0.4, 0.25, i * 0.47);
      n(1200, 0.2, 0.3, i * 0.49);
    }
  });
  sound("beacon", 5.2, 0.24, (t, n) => {
    for (const [i, ratio] of [1, 1.5, 2.5, 3, 4, 5].entries())
      t(82.41 * ratio, 82.41 * ratio, 4.1, 0.3, i * 0.16, 0.55);
    n(2300, 2.6, 0.15, 0, 0.5);
  });
  sound("death", 1.7, 0.24, (t, n) => {
    t(196, 32, 1.5, 0.65, 0, 0.018, true);
    n(450, 1.5, 0.8, 0, 0.03);
  });
  sound("pulse", 0.32, 0.12, (t, n) => {
    t(73.4, 49, 0.29, 0.7, 0, 0.018);
    n(290, 0.12, 0.2, 0, 0.014);
  });
  sound("heartbeat", 0.42, 0.14, (t) => {
    t(67, 40, 0.15, 0.6, 0, 0.018);
    t(59, 36, 0.16, 0.4, 0.2, 0.02);
  });
  return library;
}

// Response, send, surf, grass, river, waterfall, steam, station audibility.
const spaces = {
  cove: ["open", 0.09, 1, 0.12, 0, 0, 0.08, 0],
  pipeline: ["open", 0.06, 0.08, 1, 0.75, 0, 0.5, 0.6],
  causeway: ["causeway", 0.18, 0.03, 0.12, 0.3, 1, 0.08, 0.12],
  fins: ["open", 0.045, 0, 1, 0.1, 0.08, 0.65, 1],
  gate: ["gate", 0.2, 0, 0.15, 0, 0.05, 0.4, 1],
  summit: ["open", 0.025, 0.08, 0.55, 0.04, 0, 0.1, 0.1],
  cliffs: ["cliffs", 0.18, 0.5, 0.2, 0.12, 0, 0.08, 0],
};
const machinePitch = {
  gnat: 1.8,
  strider: 1.05,
  watcher: 1.4,
  bulwark: 0.65,
  hauler: 0.5,
  siege: 0.4,
  charge: 0.85,
};
const personal = new Set([
  "step",
  "jump",
  "land",
  "shot",
  "dry",
  "reload-out",
  "reload-in",
  "reload-rack",
  "rail-charge",
  "arc-heat",
  "arc-vent",
  "swap",
  "pickup-weapon",
  "pickup-ammo",
  "charge-throw",
  "hit",
  "hurt",
  "shield-hit",
  "shield-break",
  "shield-up",
  "coin",
  "page",
  "checkpoint",
  "hashrate-drop",
  "beacon",
  "death",
]);
const critical = new Set([
  "station-clear",
  "station-relight",
  "clamp-break",
  "boss-die",
  "beacon",
  "death",
]);
const weaponKinds = new Set(["carbine", "scatter", "rail", "arc"]);
function weaponKind(value) {
  if (value === "scattergun") return "scatter";
  if (value === "rail-rifle") return "rail";
  if (value === "arc-caster") return "arc";
  return weaponKinds.has(value) ? value : "carbine";
}

// The caller owns the AudioContext and mute destination. Never resume
// or close that context here. Optional active=false silences pause/title screens.
export function createAudio(ctx, destination) {
  let disposed = false,
    active = true;
  let player = {},
    snapshot = {};
  let space = "cove",
    beaconLit = false,
    hashrateStage = 0,
    lastHashrate = 51.3;
  let master, input, bedBus, machineBus;
  let samples = noiseSamples();
  const library = makeLibrary(ctx, samples);
  const graph = new Set(),
    sources = new Set(),
    targets = new WeakMap();
  const voices = [],
    machines = [],
    reverbs = new Map();
  const beds = {},
    pad = [];
  let nextPulse = 0,
    nextHeart = 0,
    lastStep = -1;
  let lastUpdate = -1;

  function keep(node) {
    graph.add(node);
    return node;
  }
  function gain(value = 0) {
    const n = keep(ctx.createGain());
    n.gain.value = value;
    return n;
  }
  function filter(type, frequency) {
    const n = keep(ctx.createBiquadFilter());
    n.type = type;
    n.frequency.value = frequency;
    n.Q.value = 0.65;
    return n;
  }
  function target(param, value, seconds = 0.12) {
    if (Math.abs((targets.get(param) ?? Infinity) - value) < 0.0001) return;
    targets.set(param, value);
    param.setTargetAtTime(value, ctx.currentTime, seconds);
  }
  function panner() {
    const p = keep(ctx.createPanner());
    p.panningModel = "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = 4;
    p.maxDistance = 100;
    p.rolloffFactor = 1.15;
    return p;
  }
  function place(pan, p) {
    pan.positionX.value = finite(p?.x);
    pan.positionY.value = finite(p?.y);
    pan.positionZ.value = finite(p?.z);
  }
  function loop(buffer, type, frequency, bus) {
    const source = keep(ctx.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    const tone = filter(type, frequency),
      level = gain();
    source.connect(tone).connect(level).connect(bus);
    source.start(ctx.currentTime, random(0, buffer.duration));
    sources.add(source);
    return { source, tone, level };
  }
  function drone(frequency, bus, type = "sine") {
    const source = keep(ctx.createOscillator()),
      level = gain();
    source.type = type;
    source.frequency.value = frequency;
    source.connect(level).connect(bus);
    source.start();
    sources.add(source);
    return { source, level };
  }
  function noiseBuffer(colour) {
    const data = samples[colour];
    const overlap = 512;
    const buffer = ctx.createBuffer(2, data.length - overlap, RATE);
    for (let channel = 0; channel < 2; channel++) {
      const out = buffer.getChannelData(channel);
      const shift = channel * 31793;
      for (let i = 0; i < out.length; i++)
        out[i] = data[(i + shift) % data.length];
      // Overlap adjacent noise at the wrap without fading the bed out.
      for (let i = 0; i < overlap; i++) {
        const t = i / overlap;
        const blend = t * t * (3 - 2 * t);
        out[i] =
          data[(out.length + i + shift) % data.length] * (1 - blend) +
          out[i] * blend;
      }
    }
    return buffer;
  }
  function response(seconds, seed) {
    // Convolution responses must match the caller's sample rate (unlike clips).
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(2, Math.ceil(seconds * rate), rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let energy = 0,
        smooth = 0;
      for (let i = 0; i < data.length; i++) {
        smooth =
          smooth * 0.62 +
          samples.white[(i + seed + channel * 11333) % samples.white.length] *
            0.38;
        const t = i / rate;
        const attack = Math.min(1, t / 0.012);
        data[i] =
          smooth *
          attack *
          Math.exp((-7 * t) / seconds) *
          Math.min(1, (seconds - t) / 0.04);
        energy += data[i] * data[i];
      }
      const scale = 0.65 / Math.sqrt(energy || 1);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
      // Open air is sparse slap-back. Only rock, gorge and gate responses
      // contain a little diffuse energy; no indoor hall/vault response remains.
      if (seconds < 0.2) data.fill(0);
      for (let i = 1; i <= 3; i++)
        data[Math.floor((0.035 + seconds * i * 0.18) * rate)] += 0.28 / i;
    }
    return buffer;
  }
  function initialize() {
    input = gain(1);
    master = gain();
    bedBus = gain(0.5);
    machineBus = gain(0.7);
    const highpass = filter("highpass", 30),
      lowpass = filter("lowpass", 10800);
    const limiter = keep(ctx.createDynamicsCompressor());
    limiter.threshold.value = -8;
    limiter.knee.value = 5;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    // The compressor controls normal fights; this oversampled soft knee also
    // bounds pathological simultaneous bursts. Below 0.8 it is transparent.
    const safety = keep(ctx.createWaveShaper());
    const curve = new Float32Array(8193);
    for (let i = 0; i < curve.length; i++) {
      const x = ((i / (curve.length - 1)) * 2 - 1) * 2;
      const a = Math.abs(x);
      curve[i] =
        Math.sign(x) *
        (a <= 0.8 ? a : 0.8 + 0.2 * (1 - Math.exp(-(a - 0.8) / 0.2)));
    }
    safety.curve = curve;
    safety.oversample = "2x";
    const headroom = gain(0.5),
      dc = filter("highpass", 18);
    input
      .connect(highpass)
      .connect(lowpass)
      .connect(limiter)
      .connect(headroom)
      .connect(safety)
      .connect(dc)
      .connect(master)
      .connect(destination);
    bedBus.connect(input);
    machineBus.connect(input);
    let seed = 0;
    for (const [name, seconds] of [
      ["open", 0.16],
      ["cliffs", 0.48],
      ["causeway", 0.62],
      ["gate", 0.75],
    ]) {
      const send = gain(),
        convolver = keep(ctx.createConvolver());
      convolver.normalize = false;
      convolver.buffer = response(seconds, seed++ * 7193);
      send.connect(convolver).connect(input);
      reverbs.set(name, send);
    }
    // Sixteen strips belong to player weapons, eight to story/player cues, and
    // forty to everything else. Saturated debris can never steal a shot.
    for (let i = 0; i < 64; i++) {
      const level = gain(1),
        pan = panner(),
        direct = gain(1),
        positioned = gain();
      level.connect(direct).connect(input);
      level.connect(pan).connect(positioned).connect(input);
      voices.push({
        level,
        pan,
        direct,
        positioned,
        source: null,
        until: 0,
        wet: null,
      });
    }
    const white = noiseBuffer("white"),
      pink = noiseBuffer("pink");
    beds.wind = loop(pink, "lowpass", 580, bedBus);
    beds.grass = loop(white, "bandpass", 2700, bedBus);
    beds.surf = loop(pink, "bandpass", 680, bedBus);
    beds.river = loop(white, "bandpass", 1700, bedBus);
    beds.waterfall = loop(pink, "bandpass", 1100, bedBus);
    beds.steam = loop(white, "bandpass", 3400, bedBus);
    beds.stationAir = loop(pink, "bandpass", 310, bedBus);
    beds.station = drone(61.7, bedBus, "triangle");
    beds.stationHigh = drone(123.6, bedBus);
    beds.siege = drone(31, bedBus, "triangle");
    beds.shield = drone(740, bedBus);
    beds.arcHeat = drone(980, bedBus);
    for (const f of [82.41, 123.47, 206.02, 247.21]) pad.push(drone(f, bedBus));
    const haulerPan = panner(),
      haulerBus = gain(1);
    haulerBus.connect(haulerPan).connect(machineBus);
    beds.hauler = drone(44, haulerBus, "triangle");
    beds.haulerAir = loop(pink, "bandpass", 420, haulerBus);
    beds.hauler.pan = haulerPan;
    // A fixed six-machine pool, nearest first; stable IDs survive fresh snapshots.
    for (let i = 0; i < 6; i++) {
      const pan = panner(),
        bus = gain(1);
      bus.connect(pan).connect(machineBus);
      machines.push({
        id: null,
        pan,
        hum: drone(70, bus, "triangle"),
        air: loop(pink, "bandpass", 550, bus),
        charge: drone(600, bus),
      });
    }
    samples = null;
  }

  function play(name, position, strength = 1, group = "effect", rate = 1) {
    const buffer = library.get(name);
    if (!buffer) return;
    const now = ctx.currentTime;
    const start = group === "shot" ? 0 : group === "critical" ? 16 : 24;
    const end = group === "shot" ? 16 : group === "critical" ? 24 : 64;
    let voice;
    for (let i = start; i < end; i++) {
      if (voices[i].until <= now) {
        voice = voices[i];
        break;
      }
    }
    // Never cut a live waveform to steal a voice. Excess debris is inaudible.
    if (!voice) return;
    if (voice.source) {
      voice.source.onended = null;
      voice.source.disconnect();
      sources.delete(voice.source);
    }
    if (voice.wet) {
      voice.direct.disconnect(voice.wet);
      voice.positioned.disconnect(voice.wet);
    }
    const local =
      !position || !Number.isFinite(position.x) || !Number.isFinite(position.z);
    voice.direct.gain.value = local ? 1 : 0;
    voice.positioned.gain.value = local ? 0 : 1;
    if (!local) place(voice.pan, position);
    voice.level.gain.value = clamp(strength, 0, 1.5);
    voice.wet = reverbs.get(spaces[space][0]);
    voice.direct.connect(voice.wet);
    voice.positioned.connect(voice.wet);
    // AudioBufferSourceNodes are single-use by WebAudio design. This tiny node
    // is the only per-hit audio allocation; PCM, gains, panners and IRs are reused.
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(voice.level);
    sources.add(source);
    voice.source = source;
    voice.until = now + buffer.duration / rate + 0.005;
    source.onended = () => {
      source.disconnect();
      sources.delete(source);
      if (voice.source === source) {
        voice.source = null;
        voice.until = 0;
      }
    };
    source.start();
  }

  function kind(value) {
    return Object.hasOwn(machinePitch, value) ? value : "strider";
  }
  function surface(value) {
    if (typeof value !== "string") return "concrete";
    const normalized = value.toLowerCase();
    const aliases = {
      stone: "rock",
      basalt: "rock",
      cutstone: "rock",
      blockstone: "rock",
      brick: "rock",
      steel: "metal",
      galvanized: "metal",
      paintedmetal: "metal",
      "painted-steel": "metal",
      rustedsteel: "metal",
      chain: "metal",
      enemy: "metal",
      weak: "metal",
      water: "wet",
      puddle: "wet",
      dirt: "sand",
      gravel: "rock",
      asphalt: "concrete",
    };
    const name = Object.hasOwn(aliases, normalized)
      ? aliases[normalized]
      : normalized;
    return library.has(`impact-${name}`) ? name : "concrete";
  }
  function hit(type, position, detail) {
    if (disposed || !active || ctx.state !== "running") return;
    let name = type === "turret-shot" ? "strider-shot" : type;
    const weapon = weaponKind(
      typeof detail === "string"
        ? detail
        : (detail?.weapon ?? snapshot.weapon?.kind),
    );
    if (type === "shot") name = `shot-${weapon}-${Math.floor(random(0, 4))}`;
    else if (["dry", "reload-out", "reload-in", "reload-rack"].includes(type))
      name = `${type}-${weapon}`;
    else if (["impact", "casing", "step"].includes(type))
      name = `${type}-${surface(typeof detail === "string" ? detail : (detail?.surface ?? position?.surface ?? player.surface))}`;
    else if (["alert", "kill", "explode"].includes(type))
      name = `${type}-${kind(typeof detail === "string" ? detail : detail?.kind)}`;
    else if (type === "hashrate-drop") {
      // The hook can precede this frame's snapshot. Count the three relights
      // when no explicit new share is supplied, rather than reading stale state.
      const share = detail?.hashrate;
      const stage = Number.isFinite(share)
        ? share < 49
          ? 2
          : share < 50.2
            ? 1
            : 0
        : hashrateStage;
      name = `hashrate-drop-${Math.min(2, stage)}`;
      hashrateStage = Math.min(2, stage + 1);
    }
    if (
      !library.has(name) ||
      type === "pulse" ||
      type === "heartbeat" ||
      type === "bulwark-step"
    )
      return;
    if (lastUpdate < 0) target(master.gain, 0.8, 0.015);
    if (type === "step") {
      if (ctx.currentTime - lastStep < 0.16) return;
      lastStep = ctx.currentTime;
    }
    if (type === "beacon") beaconLit = true;
    const local = personal.has(type);
    const group =
      type === "shot"
        ? "shot"
        : critical.has(type) || local
          ? "critical"
          : "effect";
    const strength = clamp(detail?.strength ?? detail?.volume ?? 1, 0, 1.5);
    play(
      name,
      local ? null : position,
      strength,
      group,
      type === "shot" ? random(0.99, 1.01) : random(0.98, 1.02),
    );
  }

  function listener() {
    const l = ctx.listener,
      yaw = finite(player.yaw),
      pitch = clamp(player.pitch ?? 0, -1.5, 1.5);
    const x = finite(player.x),
      y = finite(player.y) + 1.68,
      z = finite(player.z);
    const fx = -Math.sin(yaw) * Math.cos(pitch),
      fy = Math.sin(pitch),
      fz = -Math.cos(yaw) * Math.cos(pitch);
    const ux = Math.sin(yaw) * Math.sin(pitch),
      uy = Math.cos(pitch),
      uz = Math.cos(yaw) * Math.sin(pitch);
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = ux;
      l.upY.value = uy;
      l.upZ.value = uz;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  function updateMachines(enemies, allow) {
    // Assign IDs before selecting replacements, keeping already audible machines
    // on their strips. Reassignment fades out before changing pitch/position.
    const nearest = enemies
      .filter(
        (e) =>
          e &&
          e.alive !== false &&
          finite(e.hp, 1) > 0 &&
          finite(e.dead) <= 0 &&
          Math.hypot(
            finite(e.x) - finite(player.x),
            finite(e.z) - finite(player.z),
          ) < 35,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - finite(player.x), a.z - finite(player.z)) -
          Math.hypot(b.x - finite(player.x), b.z - finite(player.z)),
      )
      .slice(0, 6);
    const selected = new Set(nearest.map((e) => e.id ?? enemies.indexOf(e)));
    for (const m of machines) {
      let e = nearest.find((e) => (e.id ?? enemies.indexOf(e)) === m.id);
      if (!e) {
        target(m.hum.level.gain, 0, 0.045);
        target(m.air.level.gain, 0, 0.045);
        target(m.charge.level.gain, 0, 0.025);
        if (m.id !== null && !m.retire) m.retire = ctx.currentTime + 0.3;
        if (m.retire > ctx.currentTime) continue;
        m.id = null;
        m.retire = 0;
        e = nearest.find(
          (e) =>
            !machines.some(
              (other) => other.id === (e.id ?? enemies.indexOf(e)),
            ),
        );
        if (!e) continue;
        m.id = e.id ?? enemies.indexOf(e);
      }
      if (!selected.has(m.id)) continue;
      m.retire = 0;
      const k = kind(e.kind),
        f = {
          gnat: 181,
          strider: 73,
          watcher: 112,
          bulwark: 42,
          siege: 31,
          hauler: 44,
          charge: 80,
        }[k];
      place(m.pan, { x: finite(e.x), y: finite(e.y) + 0.8, z: finite(e.z) });
      target(
        m.hum.source.frequency,
        f + Math.sin(ctx.currentTime * 2.2) * 1.4,
        0.1,
      );
      target(
        m.air.tone.frequency,
        k === "gnat"
          ? 2400
          : k === "watcher"
            ? 1450
            : k === "strider"
              ? 780
              : 330,
      );
      target(m.hum.level.gain, allow ? (k === "bulwark" ? 0.027 : 0.012) : 0);
      target(m.air.level.gain, allow ? (k === "gnat" ? 0.04 : 0.065) : 0);
      // Watchers have an explicit 1.5 s aim cue; do not duplicate it here.
      target(
        m.charge.level.gain,
        allow && k !== "watcher" ? clamp(e.charge) * 0.017 : 0,
        0.04,
      );
      target(m.charge.source.frequency, f * 4 + clamp(e.charge) * 320, 0.05);
      if (m.owner !== m.id) {
        m.walked = 0;
        m.x = finite(e.x);
        m.z = finite(e.z);
        m.owner = m.id;
      }
      const distance = Math.hypot(finite(e.x) - m.x, finite(e.z) - m.z);
      m.walked += distance < 2 ? distance : 0; // no checkpoint/teleport footfall
      m.x = finite(e.x);
      m.z = finite(e.z);
      if (allow && k === "bulwark" && m.walked > 1.1) {
        play("bulwark-step", { x: m.x, y: finite(e.y), z: m.z }, 0.85);
        m.walked = 0;
      }
    }
  }

  function update(next = {}, dt = 0) {
    if (disposed || ctx.state !== "running") return;
    snapshot = next ?? {};
    active = snapshot.active !== false;
    if (!active) {
      if (master) target(master.gain, 0, 0.035);
      return;
    }
    player = snapshot.player ?? {};
    const share = finite(snapshot.hashrate, lastHashrate);
    const returnedStations = share > 51 ? 0 : share > 50 ? 1 : 2;
    if (share > lastHashrate + 0.01) hashrateStage = returnedStations;
    else hashrateStage = Math.max(hashrateStage, returnedStations);
    lastHashrate = share;
    const zone = Math.round(clamp(snapshot.zone, 0, 5));
    const fallback = ["cove", "pipeline", "causeway", "fins", "gate", "summit"][
      zone
    ];
    // Optional space refines the acoustics at a cliff. Zone alone is sufficient.
    space = Object.hasOwn(spaces, snapshot.space) ? snapshot.space : fallback;
    const [room, send, surf, grass, river, waterfall, steam, station] =
      spaces[space];
    for (const [name, bus] of reverbs)
      target(bus.gain, name === room ? send : 0, 0.08);
    listener();
    const now = ctx.currentTime,
      combat = clamp(snapshot.combat);
    target(master.gain, 0.8 * (1 - clamp(snapshot.fade)), 0.065);
    const gust = 0.78 + 0.22 * Math.sin(now * 0.43);
    target(beds.wind.level.gain, (zone === 5 ? 0.065 : 0.035) * gust, 0.6);
    target(beds.grass.level.gain, grass * 0.065 * gust, 0.55);
    target(
      beds.surf.level.gain,
      surf * 0.14 * (0.64 + 0.36 * Math.sin(now * 0.72)),
      0.4,
    );
    target(beds.river.level.gain, river * 0.09, 0.45);
    target(beds.waterfall.level.gain, waterfall * 0.21, 0.45);
    target(beds.steam.level.gain, steam * 0.045, 0.35);
    const stationIndex = zone < 3 ? 0 : zone === 3 ? 1 : 2;
    const state = snapshot.stations?.[stationIndex];
    const relit = state?.state === "keeper" ? 1 : clamp(state?.relight);
    const cleared = state?.state === "clear";
    target(beds.station.source.frequency, 61.7 + relit * 20.7, 0.6);
    target(
      beds.station.level.gain,
      station * (cleared ? 0.002 : 0.009 + relit * 0.007),
      0.45,
    );
    target(beds.stationHigh.level.gain, station * (0.002 + relit * 0.007), 0.5);
    target(
      beds.stationAir.level.gain,
      station * (cleared ? 0.018 : 0.095 - relit * 0.04),
      0.4,
    );
    target(
      beds.siege.level.gain,
      zone === 4 && snapshot.boss?.alive ? 0.024 : 0,
      0.3,
    );
    const hauler = snapshot.hauler;
    if (hauler) place(beds.hauler.pan, hauler);
    target(
      beds.hauler.level.gain,
      hauler ? 0.07 * (0.85 + 0.15 * Math.sin(now * 17)) : 0,
      0.15,
    );
    target(beds.haulerAir.level.gain, hauler ? 0.2 : 0, 0.25);
    target(
      beds.shield.level.gain,
      0.0015 * clamp(finite(player.shield) / 100),
      0.3,
    );
    const heat =
      snapshot.weapon?.kind === "arc" && !snapshot.weapon?.venting
        ? clamp(snapshot.weapon?.heat)
        : 0;
    target(beds.arcHeat.source.frequency, 980 + heat * 650, 0.09);
    target(beds.arcHeat.level.gain, Math.max(0, heat - 0.4) * 0.012, 0.08);
    if (zone < 5 && !snapshot.ending && !snapshot.complete) beaconLit = false;
    const warmth =
      zone === 5 && (beaconLit || snapshot.ending || snapshot.complete)
        ? 1 - combat * 0.8
        : 0;
    for (let i = 0; i < pad.length; i++)
      target(pad[i].level.gain, warmth * (i ? 0.009 : 0.012), 1.2);
    // Below 51% the tense pulse relaxes slightly; explicit sfx owns each ascent.
    const relief = clamp((51.3 - finite(snapshot.hashrate, 51.3)) / 3.1);
    target(bedBus.gain, 0.5 * (1 - combat * 0.3), 0.25);
    updateMachines(
      Array.isArray(snapshot.enemies) ? snapshot.enemies : [],
      !snapshot.complete && clamp(snapshot.fade) < 0.5,
    );
    // No timer or catch-up burst. All sequencing is driven by the caller's update.
    if (lastUpdate < 0 || now - lastUpdate > 0.6 || finite(dt) > 0.6) {
      nextPulse = now + 0.1;
      nextHeart = now + 0.15;
    }
    if (now >= nextPulse) {
      if (combat > 0.05 && !snapshot.complete)
        play("pulse", null, combat * (0.65 - relief * 0.15));
      nextPulse = now + 0.74 - combat * 0.22 + relief * 0.06;
    }
    const health = clamp(finite(player.health, 100), 0, 100);
    if (now >= nextHeart) {
      if (health > 0 && health < 35 && !snapshot.complete)
        play("heartbeat", null, (1 - health / 40) * 0.7, "critical");
      nextHeart = now + 0.57 + health * 0.012;
    }
    lastUpdate = now;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const now = ctx.currentTime;
    const cleanup = () => {
      for (const source of sources) {
        source.onended = null;
        source.disconnect();
        if ("buffer" in source) source.buffer = null;
      }
      for (const node of graph) {
        node.disconnect();
        if ("buffer" in node) node.buffer = null;
      }
      for (const voice of voices) {
        voice.source = null;
        voice.wet = null;
      }
      sources.clear();
      graph.clear();
      library.clear();
      reverbs.clear();
      voices.length = 0;
      machines.length = 0;
      pad.length = 0;
      for (const name of Object.keys(beds)) delete beds[name];
      samples = null;
      player = {};
      snapshot = {};
      master = input = bedBus = machineBus = null;
    };
    if (master && ctx.state === "running") {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.035);
      // A permanent bed's onended releases the graph after the output fade.
      beds.wind.source.onended = cleanup;
      for (const source of sources) source.stop(now + 0.045);
    } else {
      for (const source of sources) {
        source.onended = null;
        source.stop();
      }
      cleanup();
    }
  }
  // Prepare the silent graph even if the context is suspended. No hit is queued
  // until running, and the first round performs no setup work.
  initialize();
  return { update, hit, dispose };
}
