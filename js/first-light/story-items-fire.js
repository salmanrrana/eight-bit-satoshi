// Upright billboards: noisy alpha, rather than a mesh outline, defines each tongue.
// All layers stay in the hazard's horizontal footprint, including the leaning smoke.
export function buildFire(ctx, own, root, w, d, reduced) {
  const { T, kit, quality } = ctx;
  const layers = quality === "low" ? 14 : quality === "high" ? 22 : 30;
  const vertexShader = `varying vec2 v;varying float seed,life;
    void main(){v=uv;seed=instanceMatrix[3].z*71.+instanceMatrix[3].x*37.;
      life=instanceMatrix[3].y;
      vec4 centre=modelMatrix*vec4(instanceMatrix[3].xyz,1.);
      vec3 right=normalize(vec3(viewMatrix[0][0],0.,viewMatrix[2][0]));
      centre.xyz+=right*position.x*length(instanceMatrix[0].xyz);
      centre.y+=position.y*length(instanceMatrix[1].xyz);
      gl_Position=projectionMatrix*viewMatrix*centre;}`;
  const material = (kind) =>
    own(
      new T.ShaderMaterial({
        uniforms: {
          time: kit.uniforms.time,
          wind: kit.uniforms.wind,
          ambient: kit.uniforms.skyAmbient,
          motion: { value: reduced ? 0 : 1 },
        },
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        vertexShader:
          kind === "fire"
            ? "attribute float lifted;varying float freeFlame;\n" +
              vertexShader.replace(
                "void main(){",
                "void main(){freeFlame=lifted;",
              )
            : vertexShader,
        fragmentShader: `uniform float time,wind,motion;uniform vec3 ambient;
      varying vec2 v;varying float seed,life;
      ${kind === "fire" ? "varying float freeFlame;" : ""}
      ${kit.noiseGLSL}
      void main(){float t=time*motion;vec2 p=v;
      ${
        kind === "fire"
          ? `
        float n=noise3(vec3(p.x*4.+seed,p.y*3.-t*.8,seed*.11));
        float detail=noise3(vec3(p.x*10.+seed,p.y*9.-t*1.5,seed));
        float bend=(n-.5)*.75*p.y+sin(p.y*9.-t*.9+seed)*.13*p.y;
        float taper=mix(.46,.1,smoothstep(.05,.95,p.y));
        float edge=abs(p.x-.5+bend)/max(.02,taper);
        float field=(1.-edge)*(.9-p.y*.5)+(n-.5)*.7+(detail-.5)*.25;
        field-=smoothstep(.35,.95,p.y)*(.25+.5*noise3(vec3(p*5.-vec2(t*.25,t*.6),seed+17.)));
        float alpha=smoothstep(.05,.42,field)*smoothstep(0.,.13,p.y)*(1.-smoothstep(.65,1.,p.y));
        float temperature=clamp((1.-p.y)*.9+(1.-edge)*.18+(n-.5)*.2,0.,1.);
        temperature=clamp(temperature-freeFlame*.3,0.,1.);
        vec3 colour=mix(vec3(.55,.008,.0004),vec3(1.3,.12,.002),smoothstep(.1,.5,temperature));
        colour=mix(colour,vec3(2.4,1.05,.06),smoothstep(.45,.78,temperature));
        colour=mix(colour,vec3(3.,2.5,1.4),smoothstep(.91,.995,temperature));
        colour*=.75+detail*.25;
        gl_FragColor=vec4(colour,alpha*.72);
      `
          : kind === "smoke"
            ? `
        float n=fbm(vec3(p*4.+vec2(seed,-t*.1),seed));
        float radial=length((p-.5)*vec2(1.8,1.65));
        float alpha=smoothstep(.9,.12,radial)*smoothstep(.22,.65,n);
        alpha*=smoothstep(.15,.5,life)*(1.-smoothstep(1.4,3.1,life));
        // Grey from the sky's brightness, not its colour: blue daylight made a flat band.
        vec3 colour=mix(vec3(.014,.012,.010),vec3(dot(ambient,vec3(.2126,.7152,.0722)))*vec3(.86,.84,.8),clamp(life*.38,0.,.85));
        colour+=vec3(.08,.025,.006)*exp(-life*3.);
        gl_FragColor=vec4(colour,alpha*.3);
      `
            : `
        float n=noise3(vec3(p*12.,t*.3));
        float wave=sin(p.y*70.-t*2.+n*6.);
        float alpha=pow(max(0.,1.-length((p-.5)*2.)),3.)*abs(wave)*.024;
        gl_FragColor=vec4(ambient*1.2,alpha);
      `
      }
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
      }),
    );
  const plane = own(new T.PlaneGeometry(1, 1));
  const firePlane = own(plane.clone());
  firePlane.setAttribute(
    "lifted",
    new T.InstancedBufferAttribute(
      Float32Array.from({ length: layers }, (_, n) => (n % 4 === 2 ? 1 : 0)),
      1,
    ),
  );
  const fire = new T.InstancedMesh(firePlane, material("fire"), layers);
  const smoke = new T.InstancedMesh(plane, material("smoke"), 16);
  const heat = new T.InstancedMesh(plane, material("heat"), 3);
  const embers = new T.InstancedMesh(
    own(new T.SphereGeometry(0.006, 4, 3)),
    kit.material({ color: 0xffb22d, emissive: 0xff7b12, emissiveIntensity: 2 }),
    quality === "low" ? 12 : 24,
  );
  for (const mesh of [fire, smoke, heat, embers]) {
    mesh.userData.noReflect = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  const dummy = new T.Object3D();
  function put(mesh, n, x, y, z, sx, sy, sz = 1) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
  }
  return {
    update(time, env) {
      const t = reduced ? 0 : time;
      for (let n = 0; n < layers; n++) {
        const a = n * 2.39996,
          r = Math.sqrt((n + 0.5) / layers) * 0.25;
        const f = (n / layers + t * 0.19) % 1;
        // Cooler detached wisps rise away from the grounded combustion front.
        const lifted = n % 4 === 2;
        const envelope = Math.pow(Math.sin(f * Math.PI), 0.65);
        const h =
          (lifted ? 0.26 + (n % 3) * 0.05 : 0.76 + Math.sin(n * 7.1) * 0.2) *
          envelope;
        put(
          fire,
          n,
          Math.cos(a) * r + (lifted ? Math.sin(f * 4 + n) * 0.06 : 0),
          (lifted ? 0.12 + f * 0.72 : 0.045 + f * 0.12) + h * 0.49,
          Math.sin(a) * r + (lifted ? Math.cos(f * 5 + n) * 0.04 : 0),
          (lifted ? 0.1 + (n % 3) * 0.018 : 0.16 + (n % 3) * 0.045) *
            (lifted ? envelope : 1),
          h,
        );
      }
      for (let n = 0; n < 16; n++) {
        const f = (n / 16 + t * 0.054) % 1,
          size = 0.3 + f * 0.55;
        const lean = Math.min(0.22, (env.wind ?? 0.4) * 0.5) * f;
        put(
          smoke,
          n,
          Math.sin(n * 8) * 0.08 + lean,
          0.35 + f * 2.6,
          Math.cos(n * 7) * 0.08,
          size,
          size * 1.45,
        );
      }
      for (let n = 0; n < embers.count; n++) {
        const f = (n / embers.count + t * 0.12) % 1,
          fade = Math.sin(f * Math.PI);
        put(
          embers,
          n,
          Math.sin(n * 12 + f * 5) * 0.22 + f * 0.15,
          0.1 + f * 1.7,
          Math.cos(n * 9 + f * 4) * 0.24,
          fade,
          fade * 1.8,
          fade,
        );
      }
      for (let n = 0; n < 3; n++)
        put(heat, n, 0, 0.9 + n * 0.35, 0, Math.min(w, d) * 0.6, 0.65);
      heat.visible = !reduced;
      for (const mesh of [fire, smoke, heat, embers])
        mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
