import * as T from "three";

// A swept impeller is shared by every fan. The curved leading edge and pitched
// blade face catch moving highlights; seven rotated copies form one rotor.
export function impellerBlade() {
  const shape = new T.Shape();
  shape.moveTo(0.025, 0.018);
  shape.bezierCurveTo(0.06, 0.025, 0.12, 0.035, 0.174, 0.09);
  shape.bezierCurveTo(0.186, 0.105, 0.17, 0.143, 0.15, 0.146);
  shape.bezierCurveTo(0.095, 0.12, 0.065, 0.075, 0.024, 0.052);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelSize: 0.0015,
    bevelThickness: 0.001,
    bevelSegments: 1,
    curveSegments: 6,
    steps: 1,
  });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setZ(i, p.getZ(i) + (p.getY(i) - 0.04) * 0.18);
  g.computeVertexNormals();
  return g;
}

// Micro-abrasions differ by metal: a machined brushed face, cast fan body, and
// powder-coated rack should not all read as the same grey plastic.
export function hardwareMaterials(m) {
  const aluminum = m.brushed.clone();
  aluminum.color.set(0xb0b5b8);
  aluminum.roughness = 0.8;
  aluminum.normalScale.set(0.13, 0.2);
  const casting = m.steel.clone();
  casting.color.set(0x414b50);
  casting.roughness = 1;
  casting.normalScale.set(0.35, 0.35);
  const ceramic = m.paint.clone();
  ceramic.color.set(0xb1b7a6);
  ceramic.metalness = 0;
  ceramic.roughness = 0.4;
  ceramic.normalScale.set(0.05, 0.05);
  return { aluminum, casting, ceramic };
}

// Thirty-two service plates share one texture and one instanced draw. Their
// serials, inspection marks and barcode-like inventory strips vary per miner.
export function serialPlates() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const c = canvas.getContext("2d");
  for (let i = 0; i < 32; i++) {
    const x = (i % 4) * 512,
      y = Math.floor(i / 4) * 128;
    c.fillStyle = i % 7 === 0 ? "#999e8e" : "#aab2aa";
    c.fillRect(x, y, 512, 128);
    c.fillStyle = "#16211e";
    c.font = "bold 25px monospace";
    c.fillText("SHA-256 / 480V", x + 18, y + 30);
    c.font = "21px monospace";
    c.fillText(
      `S08-${String(i + 1).padStart(4, "0")}   1200 W`,
      x + 18,
      y + 59,
    );
    for (let k = 0; k < 57; k++) {
      if (Math.sin(k * 7.3 + i * 31) > 0.15)
        c.fillRect(x + 20 + k * 6, y + 75, k % 4 === 0 ? 4 : 2, 30);
    }
    c.font = "18px monospace";
    c.fillText(i % 7 === 0 ? "REPAIRED" : "QC PASS", x + 379, y + 91);
    c.strokeStyle = "#7a877e";
    c.lineWidth = 2;
    c.strokeRect(x + 3, y + 3, 506, 122);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  const material = new T.MeshStandardMaterial({
    map,
    roughness: 0.85,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
      vec3 placement=instanceMatrix[3].xyz;
      float serial=floor(placement.y/.7)+floor((-placement.z-1.5)/3.)*4.+(placement.x>0.?16.:0.);
      vMapUv=(vMapUv+vec2(mod(serial,4.),7.-floor(serial/4.)))/vec2(4.,8.);
      #endif
    `,
    );
  };
  return material;
}
