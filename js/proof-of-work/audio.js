// Uses the game's context and mute path. All sources are synthesized locally.
export function createAudio(ctx, destination) {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(destination);
  const nodes = [],
    sources = [];
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + Math.random() * 0.04 - 0.02) / 1.02;
    d[i] = last * 5;
  }
  const seam = d[d.length - 1] - d[0];
  for (let i = 0; i < d.length; i++) d[i] -= (seam * i) / (d.length - 1);
  const rain = ctx.createBufferSource();
  rain.buffer = noise;
  rain.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  rain.connect(filter);
  filter.connect(bus);
  rain.start();
  sources.push(rain);
  nodes.push(filter);
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 58;
  const gain = ctx.createGain();
  gain.gain.value = 0.008;
  hum.connect(gain);
  const fanPan = ctx.createPanner();
  fanPan.positionX.value = -3;
  fanPan.positionY.value = 1.5;
  fanPan.positionZ.value = -7;
  fanPan.refDistance = 6;
  gain.connect(fanPan);
  fanPan.connect(bus);
  nodes.push(fanPan);
  hum.start();
  sources.push(hum);
  nodes.push(gain);
  // Each bank has its own bearing tone and moving-air band. Bringing one
  // bank online changes both the room spectrum and the sound's location.
  const banks = [
    [-3, 1.5, -4.5],
    [3, 1.5, -4.5],
    [0, 1.5, -11],
  ].map((position, i) => {
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 360 + i * 140;
    filter.Q.value = 0.5;
    const rotor = ctx.createOscillator();
    rotor.type = "sine";
    rotor.frequency.value = 72 + i * 9.7;
    const rotorGain = ctx.createGain();
    rotorGain.gain.value = 0.015;
    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    const pan = ctx.createPanner();
    pan.panningModel = "HRTF";
    pan.refDistance = 4;
    [pan.positionX.value, pan.positionY.value, pan.positionZ.value] = position;
    air.connect(filter);
    filter.connect(envelope);
    rotor.connect(rotorGain);
    rotorGain.connect(envelope);
    envelope.connect(pan);
    pan.connect(bus);
    air.start();
    rotor.start();
    sources.push(air, rotor);
    nodes.push(filter, rotorGain, envelope, pan);
    return envelope;
  });
  // Filtered noise transients give a contact sound its surface, while the
  // oscillator beneath supplies the weight or metallic resonance.
  function transient(position, frequency, duration, delay = 0, level = 0.12) {
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain(),
      pan = ctx.createPanner();
    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    pan.positionX.value = position.x;
    pan.positionY.value = position.y || 0;
    pan.positionZ.value = position.z;
    pan.refDistance = 3;
    const t = ctx.currentTime + delay;
    envelope.gain.setValueAtTime(level, t);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(pan);
    pan.connect(bus);
    source.start(t);
    source.stop(t + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      pan.disconnect();
    };
  }
  function hit(type, position) {
    if (type === "breaker") {
      transient(position, 850, 0.12, 0, 0.7);
      for (let i = 0; i < 4; i++)
        transient(position, 1800 + i * 240, 0.035, 0.12 + i * 0.065, 0.2);
    }
    if (type === "step") transient(position, 650, 0.12, 0, 0.3);
    if (type === "wet") transient(position, 2400, 0.23, 0, 0.45);
    if (type === "steel") transient(position, 3400, 0.08, 0, 0.23);
    const duration = type === "power" ? 2.4 : 0.3;
    const osc = ctx.createOscillator(),
      g = ctx.createGain(),
      p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.positionX.value = position.x;
    p.positionY.value = position.y || 0;
    p.positionZ.value = position.z;
    p.refDistance = 2;
    osc.type = type === "coin" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(
      type === "coin"
        ? 880
        : type === "steel"
          ? 230
          : type === "step"
            ? 65
            : 180,
      ctx.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(
      type === "coin" ? 1760 : type === "power" ? 720 : 35,
      ctx.currentTime + duration * 0.75,
    );
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(p);
    p.connect(bus);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }
  let step = 0;
  return {
    hit,
    update(s, active) {
      bus.gain.setTargetAtTime(active ? 0.16 : 0, ctx.currentTime, 0.1);
      gain.gain.setTargetAtTime(0.008 + s.stage * 0.012, ctx.currentTime, 0.3);
      banks.forEach((g, i) =>
        g.gain.setTargetAtTime(
          s.breakers[i] ? (s.mining ? 0.38 : 0.24) : 0,
          ctx.currentTime,
          1.2,
        ),
      );
      const p = s.player;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.value = p.x;
        l.positionY.value = p.y;
        l.positionZ.value = p.z;
        l.forwardX.value = -Math.sin(p.yaw) * Math.cos(p.pitch);
        l.forwardY.value = Math.sin(p.pitch);
        l.forwardZ.value = -Math.cos(p.yaw) * Math.cos(p.pitch);
        l.upX.value = Math.sin(p.yaw) * Math.sin(p.pitch);
        l.upY.value = Math.cos(p.pitch);
        l.upZ.value = Math.cos(p.yaw) * Math.sin(p.pitch);
      }
      if (s.steps < step) step = s.steps;
      if (active && s.steps - step > 0.95) {
        step = s.steps;
        hit(
          Math.abs(p.x) < 0.85 && p.z < 0 && p.z > -16
            ? "steel"
            : p.z > 4 || (p.z > -9 && p.z < -7)
              ? "wet"
              : "step",
          { ...p, y: 0.05 },
        );
      }
    },
    dispose() {
      sources.forEach((n) => {
        n.stop();
        n.disconnect();
      });
      nodes.forEach((n) => n.disconnect());
      bus.disconnect();
    },
  };
}
