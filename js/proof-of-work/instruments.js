import * as T from "three";

// Printed scales sit beneath the physical pointer, rim and protective glass.
// Shared maps keep close instrument detail inexpensive and entirely local.
export function gaugeFace(title) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d");
  c.fillStyle = "#c2c0ae";
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = "#020302";
  c.fillStyle = "#020302";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 32px monospace";
  for (let i = 0; i <= 20; i++) {
    const angle = -Math.PI * 0.75 + (i * Math.PI * 1.5) / 20;
    const major = i % 5 === 0,
      inner = major ? 157 : 171;
    c.lineWidth = major ? 4 : 2;
    c.beginPath();
    c.moveTo(256 + Math.sin(angle) * inner, 256 - Math.cos(angle) * inner);
    c.lineTo(256 + Math.sin(angle) * 188, 256 - Math.cos(angle) * 188);
    c.stroke();
    if (major)
      c.fillText(
        String(i * 5),
        256 + Math.sin(angle) * 130,
        256 - Math.cos(angle) * 130,
      );
  }
  c.strokeStyle = "#934e3c";
  c.lineWidth = 6;
  c.beginPath();
  c.arc(256, 256, 196, Math.PI * 0.08, Math.PI * 0.25);
  c.stroke();
  c.fillStyle = "#131b14";
  c.font = "34px monospace";
  c.fillText(title, 256, 356);
  c.font = "18px monospace";
  c.fillText("CLASS 1.5 / 08", 256, 395);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return new T.MeshPhysicalMaterial({
    map,
    roughness: 0.9,
    metalness: 0,
    specularIntensity: 0.12,
    envMapIntensity: 0.15,
  });
}

// A transparent legend layer leaves every bevel and the gaps between keys
// visible. Its grid matches the physical key centres in world.js.
export function keyboardLegends() {
  const canvas = document.createElement("canvas");
  canvas.width = 1152;
  canvas.height = 384;
  const c = canvas.getContext("2d");
  c.fillStyle = "#9aa8a2";
  c.font = "30px monospace";
  c.textAlign = "center";
  c.textBaseline = "middle";
  const rows = ["1234567890-=", "QWERTYUIOP[]", "ASDFGHJKL;'", "ZXCVBNM,./"];
  rows.forEach((row, y) => {
    [...row].forEach((key, x) => c.fillText(key, 48 + x * 96, 48 + y * 96));
  });
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new T.Mesh(
    new T.PlaneGeometry(0.72, 0.24),
    new T.MeshStandardMaterial({
      map,
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(-0.87, 0.973, -19.51);
  return mesh;
}
