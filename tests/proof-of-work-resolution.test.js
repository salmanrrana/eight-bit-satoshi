const { test } = require("node:test");
const assert = require("node:assert/strict");
const { adaptiveResolution } = require("../js/proof-of-work/resolution.js");

function driver(quality) {
  const control = adaptiveResolution(quality);
  let now = 0;
  const changes = [];
  let scale = control.update(0, 17);
  control.resized(0);
  return {
    changes,
    get scale() {
      return scale;
    },
    frame(elapsed, resizeCost = 0) {
      now += elapsed;
      const next = control.update(now, elapsed);
      if (next !== scale) {
        changes.push(now);
        scale = next;
        now += resizeCost;
        control.resized(now);
      }
    },
  };
}

test("isolated long frames do not lower resolution", () => {
  const d = driver("low");
  for (let i = 0; i < 600; i++) d.frame(i % 120 === 119 ? 1500 : 17);
  assert.ok(d.scale >= 0.65);
});

test("sustained load lowers resolution rarely and respects its floor", () => {
  const d = driver("high");
  for (let i = 0; i < 2000; i++) d.frame(40);
  assert.equal(d.scale, 0.4);
  assert.ok(d.changes.length > 1);
  for (let i = 1; i < d.changes.length; i++) {
    assert.ok(d.changes[i] - d.changes[i - 1] >= 4000);
  }
});

test("resize stalls and settling frames cannot trigger another reduction", () => {
  const d = driver("low");
  for (let i = 0; i < 200 && !d.changes.length; i++) d.frame(40, 3000);
  assert.equal(d.changes.length, 1);
  const reduced = d.scale;
  d.frame(3000); // The interval containing the expensive resized render.
  for (let i = 0; i < 600; i++) d.frame(17, 3000);
  assert.ok(d.scale >= reduced);
  assert.equal(d.changes.length, 2); // Only a slow, sustained recovery.
});

test("recovery is slow and bounded; ultra stays fixed", () => {
  for (const [tier, maximum] of [
    ["low", 0.75],
    ["high", 1],
    ["ultra", 1],
  ]) {
    const d = driver(tier);
    for (let i = 0; i < 8000; i++) d.frame(17);
    assert.equal(d.scale, maximum);
    for (let i = 1; i < d.changes.length; i++) {
      assert.ok(d.changes[i] - d.changes[i - 1] >= 8000);
    }
    if (tier === "ultra") {
      for (let i = 0; i < 1000; i++) d.frame(100);
      assert.equal(d.scale, 1);
      assert.equal(d.changes.length, 0);
    }
  }
});
