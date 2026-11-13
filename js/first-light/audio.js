// Weather PCM is generated once at module import (the level's loading stage).
// There are no audio nodes or timers here. 24 kHz covers the weather bands;
// unequal long buffers, independent stereo and wrap overlaps hide repetition.
function synthNoise(seconds, coloured) {
  const length = Math.ceil(24000 * seconds);
  const overlap = 512;
  const channels = [];
  for (let channel = 0; channel < 2; channel++) {
    const data = new Float32Array(length);
    const extension = new Float32Array(overlap);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      sum = 0;
    // One seed per channel; a local PRNG keeps first-use synthesis cheap.
    let seed = (Math.random() * 0xffffffff) | 1;
    for (let i = 0; i < length + overlap; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const w = (seed >>> 0) / 2147483648 - 1;
      let sample = w;
      if (coloured) {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        sample = (b0 + b1 + b2 + w * 0.1848) * 0.19;
      }
      if (i < length) data[i] = sample;
      else extension[i - length] = sample;
    }
    for (let i = 0; i < overlap; i++) {
      const fraction = i / overlap;
      const t = fraction * fraction * (3 - 2 * fraction);
      data[i] = extension[i] * (1 - t) + data[i] * t;
    }
    for (let i = 0; i < data.length; i++) sum += data[i];
    const mean = sum / data.length;
    for (let i = 0; i < data.length; i++) data[i] -= mean;
    channels.push(data);
  }
  return channels;
}

const noiseSamples = {
  white: synthNoise(7.37, false),
  pink: synthNoise(11.13, true),
};

// All sound is local synthesis, routed through the game's existing mute path.
// Sources are lazy: a suspended context never builds a graph or queues a hit.
export function createAudio(ctx, destination) {
  const clamp = (value, low = 0, high = 1) =>
    Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
  const number = (value, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;
  const random = (low, high) => low + Math.random() * (high - low);
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
  };
  const graph = new Set();
  const sources = new Set();
  const voices = new Set();
  const targets = new WeakMap();
  const machines = new Map();
  let disposed = false,
    active = true;
  let bus, dry, wet, white, pink, beds, neon, pad;
  let player = {};
  let footPhase = 0,
    footSide = 1,
    lastFoot = -10,
    lastExplicit = -10;
  let nextDrip = 0,
    nextThunder = 0,
    nextPress = 0,
    nextBird = 0;
  let lastUpdate = -1,
    lastProgress = 0;
  const anchors = new Map();

  function keep(node) {
    graph.add(node);
    return node;
  }

  // Don't add redundant automation events at the render-frame rate.
  function target(param, value, seconds = 0.25) {
    if (Math.abs((targets.get(param) ?? Infinity) - value) < 0.0005) return;
    targets.set(param, value);
    param.setTargetAtTime(value, ctx.currentTime, seconds);
  }

  function point(position) {
    return {
      x: number(position?.x),
      y: number(position?.y),
      z: number(position?.z),
    };
  }

  function panner(position, reference = 3) {
    const pan = ctx.createPanner();
    // Equal-power is inexpensive for many simultaneous little water impacts.
    pan.panningModel = "equalpower";
    pan.distanceModel = "inverse";
    pan.refDistance = reference;
    pan.rolloffFactor = 1;
    pan.maxDistance = 110;
    const p = point(position);
    pan.positionX.value = p.x;
    pan.positionY.value = p.y;
    pan.positionZ.value = p.z;
    return pan;
  }

  // Only AudioBuffers are context-owned. Reuse PCM prepared during the lazy
  // module import, before START, rather than blocking the first movement frame.
  function noiseBuffer(coloured) {
    const channels = coloured ? noiseSamples.pink : noiseSamples.white;
    const buffer = ctx.createBuffer(2, channels[0].length, 24000);
    channels.forEach((data, channel) => buffer.copyToChannel(data, channel));
    return buffer;
  }

  function filter(type, frequency, q = 0.65) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  function bed(buffer, type, frequency, position, highcut) {
    const source = keep(ctx.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = random(0.93, 1.07);
    const tone = keep(filter(type, frequency));
    const gain = keep(ctx.createGain());
    gain.gain.value = 0;
    source.connect(tone);
    let shade;
    if (highcut) {
      shade = keep(filter("lowpass", highcut));
      tone.connect(shade).connect(gain);
    } else tone.connect(gain);
    let pan;
    if (position) {
      pan = keep(panner(position, 5));
      gain.connect(pan).connect(dry);
    } else gain.connect(dry);
    source.start(ctx.currentTime, random(0, buffer.duration));
    sources.add(source);
    return { source, tone, gain, pan, shade };
  }

  function drone(frequency, type, position) {
    const source = keep(ctx.createOscillator());
    source.type = type;
    source.frequency.value = frequency;
    const gain = keep(ctx.createGain());
    gain.gain.value = 0;
    source.connect(gain);
    let pan;
    if (position) {
      pan = keep(panner(position, 5));
      gain.connect(pan).connect(dry);
    } else gain.connect(dry);
    source.start();
    sources.add(source);
    return { source, gain, pan };
  }

  function initialize() {
    if (bus) return;
    bus = keep(ctx.createGain());
    bus.gain.value = 0;
    dry = keep(ctx.createGain());
    const highpass = keep(filter("highpass", 28));
    const lowpass = keep(filter("lowpass", 12500));
    const limiter = keep(ctx.createDynamicsCompressor());
    limiter.threshold.value = -13;
    limiter.knee.value = 8;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;
    dry.connect(highpass).connect(limiter).connect(lowpass).connect(bus);
    bus.connect(destination);
    // A quiet, filtered two-tap space, shared by all one-shots. No large IR.
    wet = keep(ctx.createGain());
    wet.gain.value = 0.12;
    for (const [delayTime, feedback] of [
      [0.137, 0.22],
      [0.211, 0.17],
    ]) {
      const delay = keep(ctx.createDelay(0.3));
      delay.delayTime.value = delayTime;
      const damping = keep(filter("lowpass", 2100));
      const back = keep(ctx.createGain());
      back.gain.value = feedback;
      wet.connect(delay).connect(damping).connect(dry);
      damping.connect(back).connect(delay);
    }
    white = noiseBuffer(false);
    pink = noiseBuffer(true);
    beds = {
      rain: bed(white, "highpass", 850, undefined, 6800),
      gutter: bed(pink, "bandpass", 380),
      river: bed(pink, "lowpass", 2900),
      riverAir: bed(white, "bandpass", 1800),
      wind: bed(pink, "lowpass", 920),
      grass: bed(white, "bandpass", 2400),
    };
    neon = [drone(59.8, "triangle", {}), drone(119.9, "sine", {})];
    pad = [drone(130.81, "sine"), drone(196.14, "sine"), drone(261.57, "sine")];
    const now = ctx.currentTime;
    nextDrip = now + 0.4;
    nextThunder = now + random(4, 9);
    nextPress = now + 0.5;
    nextBird = now + random(2, 4);
  }

  // Each voice owns every node it creates; stopping or ending frees all of it.
  function voice(position, delay, duration, level, attack, makeSource) {
    if (voices.size >= 112) return;
    const at = ctx.currentTime + delay;
    const gain = ctx.createGain();
    const tail = Math.min(0.04, duration * 0.12);
    const peak = Math.min(attack, duration * 0.4);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + peak);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration - tail);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    const parts = [gain];
    const source = makeSource(at, gain, parts);
    parts.push(source);
    if (
      position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.z)
    ) {
      const pan = panner(position);
      parts.push(pan);
      gain.connect(pan);
      pan.connect(dry);
      pan.connect(wet);
    } else {
      gain.connect(dry);
      gain.connect(wet);
    }
    const item = { source, parts };
    voices.add(item);
    source.onended = () => {
      for (const node of parts) node.disconnect();
      voices.delete(item);
    };
    source.start(
      at,
      source.buffer
        ? random(
            0,
            source.buffer.duration - (duration % source.buffer.duration),
          )
        : 0,
    );
    source.stop(at + duration + 0.002);
  }

  function rustle(
    position,
    frequency,
    duration,
    level,
    delay = 0,
    attack = 0.006,
    q = 0.65,
    type = "bandpass",
  ) {
    voice(position, delay, duration, level, attack, (at, gain, parts) => {
      const source = ctx.createBufferSource();
      source.buffer = frequency < 500 ? pink : white;
      source.loop = true;
      source.playbackRate.value = random(0.87, 1.14);
      const tone = filter(type, frequency, q);
      parts.push(tone);
      source.connect(tone).connect(gain);
      return source;
    });
  }

  function note(
    position,
    frequency,
    end,
    duration,
    level,
    delay = 0,
    attack = 0.007,
    type = "sine",
  ) {
    voice(position, delay, duration, level, attack, (at, gain) => {
      const source = ctx.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(frequency, at);
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, end),
        at + duration * 0.8,
      );
      source.connect(gain);
      return source;
    });
  }

  function beside(distance, height = 0) {
    const angle = random(0, Math.PI * 2);
    return {
      x: number(player.x) + Math.sin(angle) * distance,
      y: number(player.y) + height,
      z: number(player.z) + Math.cos(angle) * distance,
    };
  }

  const textures = {
    asphalt: [1050, 0.13, 0.26],
    puddle: [2100, 0.23, 0.31],
    metal: [2700, 0.09, 0.16],
    wood: [680, 0.12, 0.19],
    stone: [1500, 0.11, 0.23],
    dirt: [820, 0.18, 0.27],
    grass: [3100, 0.21, 0.19],
  };

  function footstep(position, surface = "asphalt", strength = 1) {
    const pitch = random(0.87, 1.15);
    const p = position ?? point(player);
    // Body weight plus several soft grains rather than a repeated sample.
    note(p, 84 * pitch, 40, 0.13, 0.12 * strength);
    const [frequency, duration, level] = Object.hasOwn(textures, surface)
      ? textures[surface]
      : textures.asphalt;
    rustle(p, frequency * pitch, duration, level * strength);
    rustle(
      p,
      frequency * 1.8 * pitch,
      duration * 0.65,
      level * strength * 0.4,
      random(0.022, 0.046),
    );
    if (surface === "puddle") {
      note(p, 460 * pitch, 170, 0.07, 0.07 * strength, 0.035);
      rustle(p, 4600, 0.17, 0.12 * strength, 0.03);
    } else if (surface === "metal") {
      for (const f of [310, 817, 1373])
        note(p, f * pitch, f * pitch * 0.97, 0.21, 0.026 * strength);
    } else if (surface === "wood") {
      note(p, 178 * pitch, 122, 0.17, 0.09 * strength);
      note(p, 347 * pitch, 310, 0.08, 0.035 * strength);
    } else if (surface === "dirt" || surface === "grass") {
      rustle(
        p,
        surface === "grass" ? 4300 : 1700,
        0.16,
        0.11 * strength,
        0.055,
        0.023,
      );
    }
  }

  function thunder() {
    const p = beside(random(28, 46), 16);
    rustle(p, 100, 5.5, 1.0, 0, 0.55, 0.6, "lowpass");
    rustle(p, 210, 3.8, 0.7, 0.5, 0.7, 0.7, "lowpass");
  }

  function bird() {
    const p = beside(random(7, 17), random(3, 8));
    const base = random(2100, 3400);
    const count = Math.floor(random(2, 5));
    for (let i = 0; i < count; i++) {
      const delay = i * random(0.13, 0.19);
      note(
        p,
        base * random(0.9, 1.1),
        base * random(1.1, 1.5),
        random(0.065, 0.15),
        0.07,
        delay,
        0.014,
      );
      note(p, base * 1.8, base * 1.6, 0.065, 0.009, delay + 0.025, 0.01);
    }
  }

  function press(position, level = 1) {
    note(position, random(76, 89), 44, 0.21, 0.16 * level);
    rustle(position, 720, 0.16, 0.26 * level);
    rustle(position, 2500, 0.1, 0.17 * level, 0.08);
    note(position, 223, 204, 0.12, 0.035 * level, 0.11, 0.006, "triangle");
    rustle(position, 1200, 0.22, 0.12 * level, 0.2, 0.035);
  }

  const knownHits = new Set([
    "step",
    "jump",
    "land",
    "coin",
    "page",
    "checkpoint",
    "stomp",
    "hurt",
    "splash",
    "genesis",
    "block-rise",
    "block-lock",
    "node-link",
    "whitepaper",
  ]);
  function hit(type, position) {
    if (disposed || !active || ctx.state !== "running" || !knownHits.has(type))
      return;
    initialize();
    // Hits can precede the first rendered update (e.g. landing after loading).
    if (lastUpdate < 0) target(bus.gain, 0.55, 0.03);
    const p = position;
    const now = ctx.currentTime;
    switch (type) {
      case "step":
        lastExplicit = now;
        footPhase = 0;
        // Also catches a sim step arriving just after an automatic step.
        if (now - lastFoot < 0.16) return;
        lastFoot = now;
        footstep(p, position?.surface ?? player.surface);
        break;
      case "jump":
        rustle(p, 550, 0.19, 0.18, 0, 0.02);
        note(p, 93, 58, 0.15, 0.09);
        break;
      case "land":
        footstep(p, player.surface, 1.45);
        lastFoot = now;
        footPhase = 0;
        rustle(p, 160, 0.27, 0.23, 0, 0.012, 0.6, "lowpass");
        break;
      case "coin":
        // Inharmonic partials give a small metal object, not an arcade beep.
        for (const [f, level] of [
          [1740, 0.055],
          [2781, 0.028],
          [4103, 0.012],
        ])
          note(p, f, f * 0.997, 0.45, level);
        rustle(p, 4100, 0.035, 0.08);
        break;
      case "page":
        for (let i = 0; i < 3; i++)
          rustle(p, random(1600, 3400), 0.19, 0.16, i * 0.1, 0.032);
        note(p, 659.25, 660, 0.6, 0.035, 0.08, 0.045);
        note(p, 987.77, 988, 0.5, 0.02, 0.19, 0.04);
        break;
      case "checkpoint":
      case "node-link": {
        const base = type === "checkpoint" ? 261.63 : 392;
        for (let i = 0; i < 3; i++) {
          const f = base * [1, 1.5, 2][i];
          note(p, f, f, 0.85, 0.045, i * 0.12, 0.035);
          note(p, f * 2.003, f * 2, 0.46, 0.012, i * 0.12, 0.014);
        }
        rustle(p, 2900, 0.4, 0.055, 0, 0.05);
        break;
      }
      case "stomp":
        press(p, 1.5);
        for (let i = 0; i < 4; i++)
          rustle(p, random(900, 3800), 0.09, 0.15, 0.1 + i * 0.045);
        note(p, 180, 32, 0.35, 0.14, 0.03, 0.008, "triangle");
        break;
      case "hurt":
        rustle(p, 380, 0.38, 0.39, 0, 0.009);
        note(p, 140, 43, 0.44, 0.19, 0, 0.01, "triangle");
        rustle(p, 2200, 0.16, 0.13, 0.025);
        break;
      case "splash":
        rustle(p, 650, 0.7, 0.6, 0, 0.018);
        rustle(p, 3800, 0.85, 0.35, 0.025, 0.04);
        for (let i = 0; i < 5; i++)
          note(
            p,
            random(250, 750),
            random(100, 200),
            0.09,
            0.055,
            0.12 + i * 0.07,
          );
        break;
      case "genesis":
        // Fan spin-up, seeking heads, then a grounded harmonic bloom.
        rustle(p, 900, 3.6, 0.28, 0, 0.9, 0.7, "lowpass");
        note(p, 46, 122, 3.4, 0.055, 0, 0.7, "triangle");
        for (let i = 0; i < 12; i++) {
          const delay = 0.42 + i * 0.13 + random(0, 0.06);
          rustle(p, random(1800, 3500), 0.035, 0.12, delay, 0.003, 1.7);
          note(p, random(440, 600), 350, 0.045, 0.022, delay);
        }
        for (const f of [65.41, 98, 130.81, 196])
          note(p, f, f, 4.6, 0.055, 0.8, 1.3);
        break;
      case "block-rise":
        rustle(p, 140, 2.6, 0.62, 0, 0.24, 0.7, "lowpass");
        rustle(p, 650, 2.2, 0.38, 0.04, 0.22);
        rustle(p, 3100, 1.9, 0.33, 0.15, 0.12);
        for (let i = 0; i < 4; i++)
          rustle(p, random(600, 1500), 0.21, 0.22, i * 0.26, 0.012);
        break;
      case "block-lock":
        note(p, 77, 39, 0.55, 0.29);
        rustle(p, 360, 0.24, 0.31);
        note(p, 261.63, 261.63, 0.95, 0.055, 0.08, 0.024);
        note(p, 523.8, 523.25, 0.65, 0.022, 0.09, 0.016);
        break;
      case "whitepaper":
        for (let i = 0; i < 7; i++) {
          const f = [130.81, 196, 261.63, 329.63, 392, 523.25, 659.25][i];
          note(p, f, f, 6.4 - i * 0.2, 0.045, i * 0.16, 1.2);
        }
        rustle(p, 2100, 3.5, 0.12, 0.1, 0.9);
        for (let i = 0; i < 5; i++) rustle(p, 3200, 0.3, 0.12, i * 0.18, 0.08);
        break;
    }
  }

  function movePan(pan, position) {
    target(pan.positionX, number(position.x), 0.05);
    target(pan.positionY, number(position.y), 0.05);
    target(pan.positionZ, number(position.z), 0.05);
  }

  function removeMachine(machine) {
    for (const layer of machine.layers) {
      layer.source.stop();
      sources.delete(layer.source);
      for (const node of [
        layer.source,
        layer.gain,
        layer.pan,
        layer.tone,
        layer.shade,
      ]) {
        if (!node) continue;
        node.disconnect();
        graph.delete(node);
      }
    }
  }

  function updateMachines(enemies) {
    const present = new Set();
    // Stable index keys survive simulations that create fresh snapshot objects.
    for (let i = 0; i < Math.min(enemies.length, 16); i++) {
      const enemy = enemies[i];
      if (!enemy || enemy.alive === false || number(enemy.squash) > 0.5)
        continue;
      const p = point(enemy);
      const distance = Math.hypot(
        p.x - number(player.x),
        p.z - number(player.z),
      );
      if (distance > 38) continue;
      present.add(i);
      let machine = machines.get(i);
      if (!machine) {
        const kind = enemy.kind ?? "banker";
        const frequency = kind === "miner" ? 91 : kind === "printer" ? 48 : 67;
        machine = {
          layers: [
            drone(frequency, "triangle", p),
            bed(pink, "bandpass", frequency * 8, p),
          ],
        };
        machines.set(i, machine);
      }
      for (let j = 0; j < machine.layers.length; j++) {
        const layer = machine.layers[j];
        movePan(layer.pan, { ...p, y: p.y + 0.55 });
        target(
          layer.gain.gain,
          (j ? 0.045 : 0.014) * smooth(38, 28, distance),
          0.25,
        );
      }
    }
    for (const [key, machine] of machines) {
      if (present.has(key)) continue;
      // Release before stopping; never disconnect an audible machine mid-wave.
      if (!machine.retiring) {
        machine.retiring = ctx.currentTime + 0.4;
        for (const layer of machine.layers) target(layer.gain.gain, 0, 0.045);
      }
      if (ctx.currentTime >= machine.retiring) {
        removeMachine(machine);
        machines.delete(key);
      }
    }
    for (const key of present) machines.get(key).retiring = 0;
  }

  function update(snapshot = {}, dt = 0) {
    if (disposed || ctx.state !== "running") return;
    const s = snapshot ?? {};
    // The renderer may supply active=false for pause/title screens. This is
    // optional; callers following only the public snapshot contract work too.
    active = s.active !== false;
    if (!active) {
      if (bus) target(bus.gain, 0, 0.06);
      footPhase = 0;
      return;
    }
    initialize();
    player = s.player ?? {};
    const progress = clamp(s.progress);
    if (progress < lastProgress - 0.2) anchors.clear();
    lastProgress = progress;
    const zone = Math.round(clamp(s.zone ?? progress * 6, 0, 6));
    const rain = clamp(s.rain ?? 1 - smooth(0.3, 0.43, progress));
    const now = ctx.currentTime;
    const delta = clamp(dt, 0, 0.1);
    // Long pauses do not produce a backlog of weather events or footsteps.
    if (lastUpdate >= 0 && now - lastUpdate > 0.6) {
      footPhase = 0;
      nextDrip = now + random(0.15, 0.8);
      nextBird = now + random(1, 3);
      nextThunder = now + random(5, 12);
      nextPress = now + 0.4;
    }
    lastUpdate = now;
    target(bus.gain, 0.55 * (1 - clamp(s.fade)), 0.1);
    const l = ctx.listener;
    const yaw = number(player.yaw),
      pitch = clamp(player.pitch ?? 0, -1.5, 1.5);
    const x = number(player.x),
      y = number(player.y) + 1.55,
      z = number(player.z);
    const forward = [
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    const up = [
      Math.sin(yaw) * Math.sin(pitch),
      Math.cos(pitch),
      Math.cos(yaw) * Math.sin(pitch),
    ];
    if (l.positionX) {
      // Listener values track the camera immediately; smoothing belongs to the sim.
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = forward[0];
      l.forwardY.value = forward[1];
      l.forwardZ.value = forward[2];
      l.upX.value = up[0];
      l.upY.value = up[1];
      l.upZ.value = up[2];
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(...forward, ...up);
    }
    // Zone-entry anchors keep city fixtures fixed in world space without
    // importing the simulation or assuming its eventual route coordinates.
    if (!anchors.has(zone)) {
      anchors.set(zone, {
        x: x - Math.sin(yaw) * 14 - Math.cos(yaw) * 6,
        y: y + 1,
        z: z - Math.cos(yaw) * 14 + Math.sin(yaw) * 6,
      });
    }
    const city = 1 - smooth(0.27, 0.43, progress);
    const alley = zone === 1 ? 1 : zone === 0 || zone === 2 ? 0.12 : 0;
    const hills = smooth(0.55, 0.78, progress) * (zone >= 4 ? 1 : 0.35);
    // Lower bridge landings bring the rushing surface closer to the ears.
    // The route has water close to y=0; tolerate an optional explicit waterY.
    const waterDistance = Math.abs(number(player.y) - number(s.waterY));
    const river =
      zone === 3
        ? 0.72 + 0.28 * (1 - smooth(0.5, 4, waterDistance))
        : (1 - smooth(0, 0.11, Math.abs(progress - 0.515))) * 0.75;
    const gust =
      0.68 +
      0.19 * Math.sin(now * 0.39 + Math.sin(now * 0.13)) +
      0.13 * Math.sin(now * 0.91);
    target(beds.rain.gain.gain, rain * 0.145);
    target(beds.gutter.gain.gain, rain * city * 0.18);
    target(beds.river.gain.gain, river * 0.19, 0.8);
    target(beds.riverAir.gain.gain, river * 0.075, 0.8);
    target(beds.wind.gain.gain, (0.018 + hills * 0.11) * gust, 0.9);
    target(beds.wind.tone.frequency, 400 + 850 * gust + hills * 250, 1);
    target(beds.grass.gain.gain, hills * gust * 0.027, 0.9);
    const neonPosition = anchors.get(1) ?? anchors.get(zone);
    for (let i = 0; i < neon.length; i++) {
      movePan(neon[i].pan, neonPosition);
      target(neon[i].gain.gain, alley * (i ? 0.016 : 0.028), 0.6);
    }
    const warmth = smooth(0.61, 1, progress) * (zone >= 4 ? 1 : 0);
    for (let i = 0; i < pad.length; i++)
      target(pad[i].gain.gain, warmth * (i ? 0.007 : 0.011), 2.5);

    if (now >= nextDrip) {
      if (zone <= 2 && (rain > 0.1 || zone === 2)) {
        const p = beside(random(2, 7), random(-0.1, 0.4));
        note(p, random(650, 1400), random(230, 480), 0.075, 0.045);
        rustle(p, random(2100, 4200), 0.09, 0.08);
      }
      nextDrip = now + (zone === 2 ? random(0.8, 2.4) : random(0.14, 0.55));
    }
    if (now >= nextThunder) {
      if (rain > 0.45 && zone <= 2) thunder();
      nextThunder = now + random(13, 26);
    }
    if (now >= nextPress) {
      if (zone === 0 && city > 0.2) press(anchors.get(0), 0.9);
      nextPress = now + random(0.64, 0.86);
    }
    if (now >= nextBird) {
      if (zone >= 4) bird();
      nextBird =
        now +
        (zone === 4
          ? random(4, 9)
          : zone === 5
            ? random(2.8, 5.6)
            : random(1.3, 3.6));
    }
    if (clamp(s.fade) < 0.25)
      updateMachines(Array.isArray(s.enemies) ? s.enemies : []);
    const speed = Math.hypot(number(player.vx), number(player.vz));
    if (
      player.grounded &&
      speed > 0.45 &&
      clamp(s.fade) < 0.2 &&
      !s.ending &&
      !s.complete
    ) {
      if (now - lastExplicit > 0.85) {
        footPhase += delta * (1.25 + Math.min(speed, 7) * 0.3);
        if (footPhase >= 1 && now - lastFoot > 0.22) {
          footPhase %= 1;
          lastFoot = now;
          footSide *= -1;
          footstep(
            {
              x: x + Math.cos(yaw) * 0.13 * footSide,
              y: y - 1.5,
              z: z - Math.sin(yaw) * 0.13 * footSide,
            },
            player.surface,
            random(0.88, 1.1),
          );
        }
      }
    } else footPhase = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    // Ramp the single output first, then stop all tracked sources. The brief
    // release also avoids a teardown click when a level is changed mid-impact.
    const now = ctx.currentTime;
    if (bus) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.035);
    }
    for (const source of sources) source.stop(now + 0.04);
    for (const item of voices) {
      item.source.onended = null;
      item.source.stop(now + 0.04);
    }
    // Suspended contexts cannot execute stop/onended. Disconnect immediately
    // there; running graphs release in audio time, with no JS timers to leak.
    const disconnect = () => {
      for (const item of voices)
        for (const node of item.parts) node.disconnect();
      for (const node of graph) node.disconnect();
      voices.clear();
      sources.clear();
      graph.clear();
      machines.clear();
      white = null;
      pink = null;
      beds = null;
      neon = null;
      pad = null;
      bus = null;
      dry = null;
      wet = null;
      anchors.clear();
      player = {};
    };
    if (ctx.state !== "running" || !bus) disconnect();
    else {
      // Reuse one tracked source's end event rather than allocate a timer node.
      const source = sources.values().next().value;
      source.onended = disconnect;
    }
  }

  return { update, hit, dispose };
}
