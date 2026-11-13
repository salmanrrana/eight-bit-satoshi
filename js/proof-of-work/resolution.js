// Use sustained frame times, not individual hitches, to choose render scale.
export function adaptiveResolution(quality) {
  let scale = quality === "ultra" ? 1 : quality === "high" ? 0.8 : 0.65;
  const maximum = quality === "low" ? 0.75 : 1;
  let samples = [],
    settleUntil = 0,
    windowStart = 0,
    fastSince = null,
    skipNext = true;
  return {
    // Call after the resized frame has rendered: allocation/upload work can
    // finish during rendering or appear in the following frame's interval.
    resized(now) {
      samples = [];
      fastSince = null;
      settleUntil = now + 2000;
      windowStart = settleUntil;
      skipNext = true;
    },
    update(now, elapsed) {
      if (quality === "ultra") return scale;
      if (skipNext) {
        skipNext = false;
        return scale;
      }
      if (now < settleUntil) return scale;
      samples.push(elapsed);
      if (samples.length > 120) samples.shift();
      if (now - windowStart < 2000 || samples.length < 30) return scale;
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      samples = [];
      windowStart = now;
      if (median > 30) {
        scale = Math.max(0.4, scale * 0.85);
        fastSince = null;
      } else if (median < 20) {
        fastSince ??= now;
        if (now - fastSince >= 6000) {
          scale = Math.min(maximum, scale * 1.04);
          fastSince = now;
        }
      } else {
        fastSince = null;
      }
      return scale;
    },
  };
}
