// Genesis is a volume of warm light: feathered shells, suspended hash strata,
// and slowly drifting points. Every variant is ready before the first E press.
export function genesisLight({ T, kit, c, parent, clock }) {
  const hash = c.canvas(512, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.font = "12px monospace";
    let seed = 0x19d6689;
    for (let row = 0; row < 22; row++) {
      x.fillStyle = `rgba(255,199,111,${row % 4 === 0 ? 0.52 : 0.22})`;
      let line = "";
      for (let col = 0; col < 64; col++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        line += "0123456789abcdef"[(seed >>> 28) & 15];
      }
      x.fillText(line, 8, 18 + row * 23);
    }
  });
  const shellMaterial = c.own(
    new T.MeshBasicMaterial({
      color: new T.Color(0xffa641).multiplyScalar(1.7),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      opacity: 0.55,
    }),
  );
  shellMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 genesisUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ngenesisUv=uv;",
    );
    shader.fragmentShader = "varying vec2 genesisUv;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
vec2 edge=abs(genesisUv-.5)*2.;
float rim=pow(max(edge.x,edge.y),13.);
float haze=.5+.5*sin(genesisUv.x*11.+sin(genesisUv.y*9.));
diffuseColor.a *= .028+haze*.015+rim*.48;
#include <opaque_fragment>`,
    );
  };
  shellMaterial.customProgramCacheKey = () => "genesis-radiant-shell-v1";
  for (let i = 0; i < 3; i++) {
    const size = 0.3 - i * 0.056;
    c.box(parent, [size, size, size], [0, 0, 0], shellMaterial, 0.009);
  }
  const hashMaterial = c.own(
    new T.MeshBasicMaterial({
      map: hash,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      color: 0xffbe6d,
    }),
  );
  const sheet = c.own(new T.PlaneGeometry(0.24, 0.24));
  for (let i = 0; i < 5; i++) {
    const mesh = new T.Mesh(sheet, hashMaterial);
    if (i % 2) mesh.position.x = (i - 2) * 0.045;
    else mesh.position.z = (i - 2) * 0.045;
    mesh.rotation.y = ((i % 2) * Math.PI) / 2;
    parent.add(mesh);
  }
  const points = kit.particles(28, {
    colour: 0xffc57b,
    size: 0.012,
    opacity: 0.6,
  });
  const pos = points.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(
      i,
      Math.sin(i * 19) * 0.115,
      Math.sin(i * 7) * 0.115,
      Math.cos(i * 13) * 0.115,
    );
  const prior = points.material.onBeforeCompile;
  points.material.onBeforeCompile = (shader) => {
    prior(shader);
    shader.uniforms.genesisClock = clock;
    shader.vertexShader = "uniform float genesisClock;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed += .012*sin(vec3(1.3,1.,.7)*genesisClock*.35+position.zxy*35.);",
    );
  };
  points.material.customProgramCacheKey = () => "genesis-inner-motes-v1";
  parent.add(points);
  const air = kit.particles(1, { colour: 0xffae53, size: 0.44, opacity: 0.09 });
  air.material.blending = T.AdditiveBlending;
  parent.add(air);
  return { shellMaterial, hashMaterial, air };
}

// Folded jersey has compressed layers, a collapsed hood and a cuff, rather
// than rounded boxes. The silhouette and folds are modelled in metres.
export function foldedHoodie({ T, c, parent, material, cord }) {
  function patch(w, d, level, phase) {
    const geometry = c.own(new T.PlaneGeometry(w, d, 36, 26));
    geometry.rotateX(-Math.PI / 2);
    const a = geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i),
        z = a.getZ(i),
        u = (x / w) * 2,
        v = (z / d) * 2;
      const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 8);
      const ridge =
        0.012 *
        Math.exp(-Math.pow((z + 0.04 + Math.sin(x * 12) * 0.012) / 0.026, 2));
      a.setXYZ(
        i,
        x + 0.004 * Math.sin(z * 39 + phase),
        level +
          0.006 * Math.sin(x * 45 + z * 16 + phase) * (1 - edge * 0.7) +
          ridge -
          0.015 * edge,
        z + 0.006 * Math.sin(x * 25 + phase),
      );
    }
    geometry.computeVertexNormals();
    parent.add(new T.Mesh(geometry, material));
  }
  patch(0.4, 0.3, 0.025, 0);
  patch(0.38, 0.29, 0.045, 1.2);
  patch(0.34, 0.265, 0.067, 2.3);
  // One sleeve folds diagonally across the body, with a puckered stitched cuff.
  const sleeve = new T.Group();
  sleeve.rotation.y = -0.33;
  sleeve.position.set(-0.025, 0.026, 0.015);
  parent.add(sleeve);
  const geo = c.own(new T.PlaneGeometry(0.28, 0.105, 28, 12));
  geo.rotateX(-Math.PI / 2);
  const a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i),
      z = a.getZ(i);
    a.setY(
      i,
      0.067 +
        0.009 * Math.cos(z * 26) +
        0.003 * Math.sin(x * 86) -
        0.01 * Math.pow(x / 0.14, 6),
    );
  }
  geo.computeVertexNormals();
  sleeve.add(new T.Mesh(geo, material));
  const hood = c.own(new T.PlaneGeometry(0.245, 0.19, 30, 24));
  hood.rotateX(-Math.PI / 2);
  const h = hood.attributes.position;
  for (let i = 0; i < h.count; i++) {
    const x = h.getX(i),
      z = h.getZ(i),
      v = (z + 0.095) / 0.19;
    h.setXYZ(
      i,
      x * (0.7 + 0.3 * v),
      0.089 +
        0.014 * Math.cos(x * 15) * Math.sin(v * Math.PI) -
        0.018 * Math.exp(-Math.pow((z - 0.045) / 0.025, 2)) +
        0.004 * Math.sin(x * 47 + z * 31),
      z - 0.045,
    );
  }
  hood.computeVertexNormals();
  parent.add(new T.Mesh(hood, material));
  for (const sign of [-1, 1])
    c.cable(
      parent,
      [
        [sign * 0.035, 0.087, 0.025],
        [sign * 0.065, 0.068, 0.09],
        [sign * 0.1, 0.035, 0.155],
      ],
      0.0018,
      cord,
    );
  c.merge(parent);
}
