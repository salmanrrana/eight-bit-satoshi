/** Authored wear and street furnishings. Repeated shapes share the caller's batches. */
export function streetDetails({
  T,
  kit,
  group,
  mats,
  box,
  pole,
  beam,
  batch,
  plane,
  extras,
  sign,
  low,
}) {
  // One transparent atlas for pasted paper, torn corners and aerosol marks.
  const atlas = kit.text("", {
    width: 1024,
    height: 1024,
    background: "transparent",
  });
  const c = atlas.image.getContext("2d");
  c.clearRect(0, 0, 1024, 1024);
  for (let i = 0; i < 7; i++) {
    const x = 70 + ((i * 193) % 770),
      y = 80 + ((i * 239) % 670),
      w = 120 + (i % 3) * 28;
    c.save();
    c.translate(x, y);
    c.rotate(((i % 3) - 1) * 0.09);
    c.fillStyle = ["#a49e87", "#7f8270", "#b3aa92"][i % 3];
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, 4);
    c.lineTo(w - 7, 155);
    c.lineTo(w * 0.7, 143);
    c.lineTo(w * 0.55, 166);
    c.lineTo(2, 150);
    c.fill();
    c.fillStyle = "#30332c";
    c.font = "bold 18px Georgia";
    c.fillText(
      ["PUBLIC SALE", "LAST NIGHT", "FOR LEASE"][i % 3],
      7,
      29,
      w - 14,
    );
    c.font = "10px Arial";
    c.fillText("BELL STREET / 2008", 7, 51, w - 14);
    for (let j = 0; j < 7; j++)
      c.fillRect(9, 70 + j * 7, w - 22 - (j % 3) * 13, 2);
    c.restore();
  }
  c.strokeStyle = "#c7c2ab";
  c.globalAlpha = 0.6;
  c.lineWidth = 5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(600, 730);
  c.bezierCurveTo(880, 450, 540, 980, 870, 720);
  c.moveTo(645, 800);
  c.lineTo(890, 760);
  c.stroke();
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 2400; i++) {
    c.globalAlpha = 0.15 + (i % 5) * 0.1;
    c.fillRect((i * 239) % 1024, (i * 331) % 1024, 1 + (i % 5), 1 + (i % 17));
  }
  atlas.needsUpdate = true;
  const pasted = kit.material({
    map: atlas,
    transparent: true,
    alphaTest: 0.15,
    roughness: 0.94,
    depthWrite: false,
  });
  pasted.userData.noReflect = true;
  for (const side of [-1, 1])
    for (let building = 0; building < 4; building++) {
      if (side < 0 && building === 1) continue;
      const center = -building * 10 - 4.9;
      batch(
        plane,
        pasted,
        side * 6.489,
        1.45 + (building % 2) * 0.17,
        center - 1.8 + (building % 3) * 0.19,
        2.2 + (building % 3) * 0.3,
        1.7 + (building % 2) * 0.16,
        1,
        0,
        (-side * Math.PI) / 2,
      );
    }
  // Door reveals and shallow stone thresholds remain within the front collision.
  for (const [side, z] of [
    [-1, -1.1],
    [1, -21.1],
    [-1, -31.1],
  ]) {
    box(mats.black, side * 6.72, 1.42, z, 0.08, 2.4, 0.88);
    for (const dz of [-0.5, 0.5])
      box(mats.stone, side * 6.53, 1.5, z + dz, 0.2, 2.6, 0.12);
    box(mats.stone, side * 6.54, 2.8, z, 0.2, 0.17, 1.14);
    box(mats.stone, side * 6.37, 0.27, z, 0.25, 0.14, 1.05);
    box(mats.brass, side * 6.65, 1.4, z + 0.3, 0.07, 0.18, 0.025);
  }
  // Light-well guards: an open grille over a dark inset, never an invisible hole.
  for (const z of [-29.1, -36.5]) {
    box(mats.black, -6.23, 0.202, z, 0.5, 0.008, 1.5);
    for (let dz = -0.65; dz < 0.7; dz += 0.15) {
      box(mats.steel, -6.23, 0.219, z + dz, 0.51, 0.027, 0.018);
      pole(mats.rust, -5.97, 0.6, z + dz, 0.014, 0.8);
    }
    beam(mats.steel, [-5.97, 1, z - 0.75], [-5.97, 1, z + 0.75], 0.027);
    for (const dz of [-0.75, 0.75])
      beam(mats.steel, [-5.97, 1, z + dz], [-6.5, 1, z + dz], 0.027);
  }
  for (const [x, z] of [
    [4.55, -2.1],
    [4.55, -7.3],
    [-4.6, -17.9],
  ]) {
    pole(mats.steel, x, 0.68, z, 0.085, 0.96);
    pole(mats.brass, x, 1.1, z, 0.09, 0.08);
    box(mats.steel, x, 0.24, z, 0.23, 0.08, 0.23);
  }
  // A compact hydrant and parking meter, neither on the central route.
  pole(mats.red, 5.95, 0.61, -9.6, 0.14, 0.8);
  pole(mats.red, 5.95, 1.02, -9.6, 0.19, 0.09);
  beam(mats.red, [5.95, 0.72, -9.88], [5.95, 0.72, -9.32], 0.09);
  pole(mats.steel, 4.65, 0.93, -15.8, 0.045, 1.45);
  box(mats.steel, 4.65, 1.58, -15.8, 0.27, 0.43, 0.22, false, true);
  sign("PAY & DISPLAY\nOUT OF ORDER", 4.65, 1.62, -15.682, 0.23, 0.27, 0, {
    font: 70,
    glow: 0,
    background: "#333d36",
    colour: "#c1bd9e",
  });
  sign("BELL STREET", -6.46, 3.04, -1, 1.4, 0.25, Math.PI / 2, {
    font: 92,
    glow: 0,
    colour: "#c3c3af",
    background: "#26302d",
  });
  // Recessed newspaper display surround, coin slot and pull handle.
  for (const x of [4.95, 5.55])
    box(mats.steel, x, 0.94, -5.315, 0.022, 0.62, 0.025);
  for (const y of [0.64, 1.24])
    box(mats.steel, 5.25, y, -5.315, 0.62, 0.022, 0.025);
  box(mats.brass, 5.46, 0.49, -5.315, 0.14, 0.09, 0.025);
  box(mats.black, 5.46, 0.5, -5.301, 0.09, 0.009, 0.001);
  box(mats.steel, 5.02, 0.46, -5.315, 0.18, 0.026, 0.025);
  // Black bags get seams, tied mouths and a little loose refuse at bin height.
  for (const [x, z] of [
    [6, -19.1],
    [-6.2, -31.5],
    [5.8, -34.3],
  ]) {
    for (let i = 0; i < 7; i++)
      box(
        mats.paper,
        x + Math.sin(i * 8) * 0.22,
        1.18 + (i % 3) * 0.032,
        z + Math.cos(i * 8) * 0.22,
        0.13,
        0.045,
        0.1,
      );
    for (let i = 0; i < 3; i++)
      beam(
        mats.steel,
        [x - 0.69, 0.6, z + i * 0.4],
        [x - 0.49, 0.79, z + i * 0.4],
        0.007,
      );
  }
  // Sagging utility cables against the sky use one instanced cylinder batch.
  for (const z of [-7, -33])
    for (let i = 0; i < 18; i++) {
      const x0 = -7 + (i * 14) / 18,
        x1 = -7 + ((i + 1) * 14) / 18;
      beam(
        mats.black,
        [x0, 10.2 + x0 * x0 * 0.026, z],
        [x1, 10.2 + x1 * x1 * 0.026, z],
        0.012,
      );
    }
  // Paving fissures are flat, millimetre-thick dark lines; no new collision.
  for (let i = 0; i < (low ? 18 : 48); i++) {
    const side = i % 2 ? -1 : 1,
      z = -1 - ((i * 3.17) % 37),
      x = side * (4.35 + ((i * 0.71) % 2));
    beam(mats.black, [x, 0.196, z], [x + 0.18, 0.196, z - 0.23], 0.006);
    beam(
      mats.black,
      [x + 0.18, 0.196, z - 0.23],
      [x + 0.11, 0.196, z - 0.49],
      0.004,
    );
  }
  // A low steaming basement grate uses the shared soft particle primitive.
  const steam = kit.particles(low ? 12 : 28, {
    colour: 0x81918f,
    size: 0.55,
    opacity: 0.09,
  });
  steam.frustumCulled = false;
  steam.userData.noReflect = true;
  group.add(steam);
  const shards = new T.BufferGeometry();
  shards.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [0, 0, 0, -0.03, 0.025, 0.13, 0.07, 0.012, 0.09],
      3,
    ),
  );
  shards.computeVertexNormals();
  extras.push(shards);
  for (let i = 0; i < 25; i++)
    batch(
      shards,
      mats.glass,
      -6.45 + (i % 3) * 0.08,
      0.377,
      -11.6 - i * 0.24,
      1,
      1,
      1,
      0,
      i * 2,
    );
  return {
    update(time) {
      const p = steam.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const life = (time * 0.13 + i / p.count) % 1;
        p.setXYZ(
          i,
          -6.2 + life * 0.55,
          0.22 + life * 1.6,
          -29.1 + Math.sin(i * 7) * 0.4 + life * 0.4,
        );
      }
      p.needsUpdate = true;
    },
  };
}
