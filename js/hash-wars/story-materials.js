/** STORY owns these canvases. Only the four pylon displays change after build. */
export function materials({ T, kit }) {
  const resources = [];
  function canvas(width, height) {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    const context = element.getContext("2d");
    const texture = new T.CanvasTexture(element);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    resources.push(texture);
    return { context, texture, width, height };
  }
  const metal = kit.material({
    color: 0x343d42,
    roughness: 0.62,
    metalness: 0.65,
  });
  const ceramic = kit.material({
    color: 0xd0c9b6,
    roughness: 0.68,
    metalness: 0.15,
  });
  const amber = kit.material({
    color: 0xfab75b,
    emissive: 0xf7931a,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });
  const cyan = kit.material({
    color: 0xb2edec,
    emissive: 0x57dbef,
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const glow = canvas(64, 256);
  const gradient = glow.context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "rgba(255,235,192,0)");
  gradient.addColorStop(0.45, "rgba(255,235,192,.4)");
  gradient.addColorStop(0.8, "rgba(255,235,192,.65)");
  gradient.addColorStop(1, "rgba(255,235,192,0)");
  glow.context.fillStyle = gradient;
  glow.context.fillRect(0, 0, 64, 256);
  const cross = glow.context.createLinearGradient(0, 0, 64, 0);
  cross.addColorStop(0, "transparent");
  cross.addColorStop(0.38, "transparent");
  cross.addColorStop(0.5, "white");
  cross.addColorStop(0.62, "transparent");
  cross.addColorStop(1, "transparent");
  glow.context.globalCompositeOperation = "destination-in";
  glow.context.fillStyle = cross;
  glow.context.fillRect(0, 0, 64, 256);
  glow.context.globalCompositeOperation = "source-over";
  glow.texture.needsUpdate = true;
  function effect(texture = glow.texture, opacity = 0.25) {
    return kit.material({
      map: texture,
      color: 0xfff4d8,
      emissive: 0xffddb0,
      emissiveIntensity: 0.45,
      roughness: 1,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      opacity,
    });
  }
  const glint = effect();
  const halo = canvas(128, 128);
  const radial = halo.context.createRadialGradient(64, 64, 0, 64, 64, 64);
  radial.addColorStop(0, "rgba(255,224,158,.28)");
  radial.addColorStop(0.35, "rgba(255,224,158,.12)");
  radial.addColorStop(1, "rgba(255,224,158,0)");
  halo.context.fillStyle = radial;
  halo.context.fillRect(0, 0, 128, 128);
  halo.texture.needsUpdate = true;
  const soft = effect(halo.texture);
  const paper = canvas(1024, 1408),
    c = paper.context;
  c.fillStyle = "#efe9d8";
  c.fillRect(0, 0, 1024, 1408);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = i % 3 ? "rgba(106,83,46,.035)" : "rgba(255,255,255,.12)";
    c.fillRect((i * 197) % 1024, (i * 311) % 1408, 2, 5);
  }
  c.fillStyle = "#292b2a";
  c.textAlign = "center";
  c.font = "bold 38px Georgia";
  c.fillText("Bitcoin: A Peer-to-Peer", 512, 112);
  c.fillText("Electronic Cash System", 512, 158);
  c.font = "25px Georgia";
  c.fillText("Satoshi Nakamoto", 512, 220);
  c.font = "italic 22px Georgia";
  c.fillText("Keeper archive / first-page study", 512, 262);
  c.textAlign = "left";
  c.font = "bold 27px Georgia";
  c.fillText("Abstract", 100, 350);
  c.font = "25px Georgia";
  function paragraph(text, y) {
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? line + " " + word : word;
      if (c.measureText(next).width > 824) {
        c.fillText(line, 100, y);
        y += 36;
        line = word;
      } else line = next;
    }
    c.fillText(line, 100, y);
    return y + 65;
  }
  let y = paragraph(
    "A network can transfer value directly between people. Its shared history is secured by computational work, allowing participants to agree on the order of payments without a central clearing house.",
    400,
  );
  c.font = "bold 29px Georgia";
  c.fillText("1. Introduction", 100, y);
  c.font = "25px Georgia";
  y = paragraph(
    "The proposal replaces reliance on a trusted intermediary with publicly verifiable evidence. Transactions are announced to the network. Nodes gather them into blocks, and each block commits to the block before it.",
    y + 54,
  );
  y = paragraph(
    "Changing an earlier payment requires repeating the work of the blocks that follow. The longest chain of accumulated work gives honest nodes a common record. Security depends on honest participants controlling more computing power than an attacker.",
    y,
  );
  paragraph(
    "In 2140, the Keepers preserve this principle: independent stations, open verification, and a history no army can rewrite. These nine recovered sheets remember why the chain was built.",
    y,
  );
  c.font = "italic 19px Georgia";
  c.fillText(
    "Archive annotation / original summary of the first page",
    100,
    1290,
  );
  c.textAlign = "center";
  c.fillText("1", 512, 1355);
  paper.texture.needsUpdate = true;
  const page = kit.material({
    map: paper.texture,
    color: 0xfff8e9,
    emissive: 0xcab477,
    emissiveIntensity: 0.16,
    roughness: 0.94,
    transparent: true,
    depthWrite: false,
  });
  const stamp = canvas(256, 256),
    g = stamp.context;
  g.fillStyle = "#b97c20";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#f2cd69";
  g.lineWidth = 9;
  g.beginPath();
  g.arc(128, 128, 107, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 94, 128 + Math.sin(a) * 94);
    g.lineTo(128 + Math.cos(a) * 101, 128 + Math.sin(a) * 101);
    g.stroke();
  }
  // Draw the Bitcoin mark explicitly, independent of the user's font coverage.
  g.save();
  g.translate(128, 128);
  g.rotate(0.18);
  g.strokeStyle = "#ffe19a";
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(-23, -58);
  g.lineTo(-23, 58);
  g.moveTo(-36, -56);
  g.lineTo(6, -56);
  g.bezierCurveTo(58, -56, 58, -3, 5, -3);
  g.lineTo(-23, -3);
  g.moveTo(-23, -3);
  g.lineTo(9, -3);
  g.bezierCurveTo(68, -3, 60, 57, 8, 57);
  g.lineTo(-36, 57);
  g.moveTo(-10, -73);
  g.lineTo(-10, -58);
  g.moveTo(10, -73);
  g.lineTo(10, -58);
  g.moveTo(-10, 58);
  g.lineTo(-10, 73);
  g.moveTo(10, 58);
  g.lineTo(10, 73);
  g.stroke();
  g.restore();
  stamp.texture.needsUpdate = true;
  const coin = kit.material({
    map: stamp.texture,
    color: 0xf2c267,
    roughness: 0.35,
    metalness: 0.8,
    emissive: 0x9e5b08,
    emissiveIntensity: 0.08,
    transparent: true,
  });
  function display() {
    const screen = canvas(512, 320);
    screen.material = kit.material({
      map: screen.texture,
      color: 0xffffff,
      roughness: 0.5,
      emissive: 0x929b9c,
      emissiveIntensity: 0.22,
      transparent: true,
    });
    screen.key = "";
    return screen;
  }
  return {
    metal,
    ceramic,
    amber,
    cyan,
    page,
    coin,
    glint,
    soft,
    canvas,
    display,
    effect,
    dispose() {
      resources.forEach((r) => r.dispose());
    },
  };
}

/** Integer progress/height keys prevent texture uploads on unchanged frames. */
export function drawDisplay(screen, state, progress, hashrate, height, index) {
  const key = `${state}/${progress}/${hashrate}/${height}`;
  if (screen.key === key) return;
  screen.key = key;
  const c = screen.context;
  const color =
    state === "cartel" ? "#ff8c82" : state === "clear" ? "#e6e9dc" : "#ffc174";
  c.fillStyle = "#101c20";
  c.fillRect(0, 0, 512, 320);
  c.fillStyle = color;
  c.fillRect(24, 26, 5, 36);
  c.font = "bold 24px monospace";
  c.fillText(
    index === 3 ? "SUMMIT / BEACON" : `HASH STATION / 0${index + 1}`,
    44,
    52,
  );
  c.font = "bold 52px monospace";
  c.fillText(
    state === "cartel"
      ? "CARTEL HELD"
      : state === "clear"
        ? "HOLD E"
        : progress < 100
          ? "RELIGHTING"
          : "CHAIN HOLDS",
    24,
    125,
  );
  c.font = "28px monospace";
  c.fillText(
    state === "cartel"
      ? `ATTACKER  ${hashrate}%`
      : state === "clear"
        ? "KEEPER AUTH REQUIRED"
        : `BLOCK  ${height.toLocaleString("en-US")}`,
    24,
    179,
  );
  c.fillStyle = "#2c3a3e";
  c.fillRect(24, 218, 464, 16);
  c.fillStyle = color;
  c.fillRect(
    24,
    218,
    464 * (state === "cartel" ? 0.513 : state === "clear" ? 0 : progress / 100),
    16,
  );
  c.font = "19px monospace";
  c.fillText(
    state === "cartel"
      ? "GRID LINK / OCCUPIED"
      : state === "clear"
        ? "AREA SECURE / READY"
        : progress < 100
          ? `LINK RESTORE  ${progress}%`
          : "CONSENSUS VERIFIED",
    24,
    280,
  );
  screen.texture.needsUpdate = true;
}
