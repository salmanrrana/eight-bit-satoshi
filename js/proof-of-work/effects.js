import * as T from "three";
export function effects(scene) {
  const uniforms = { time: { value: 0 } };
  const flashlightPosition = { value: new T.Vector3() };
  const flashlightDirection = { value: new T.Vector3(0, 0, -1) };
  const flashlightPower = { value: 1 };
  const beamMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    uniforms: { ...uniforms, tint: { value: new T.Color(0x7caec2) } },
    vertexShader: `varying vec2 v;varying vec3 n;varying vec3 w;void main(){v=uv;n=normalize(mat3(modelMatrix)*normal);w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader: `varying vec2 v;varying vec3 n;varying vec3 w;uniform vec3 tint;uniform float time;void main(){float edge=smoothstep(0.,.65,abs(dot(normalize(n),normalize(cameraPosition-w))));float a=edge*sin(v.y*3.14159)*.075;gl_FragColor=vec4(tint,a);}`,
  });
  const beam = new T.Mesh(
    new T.CylinderGeometry(0.65, 1.8, 5.5, 48, 1, true),
    beamMat,
  );
  beam.position.set(0.5, 2.9, -8);
  scene.add(beam);
  const count = 850,
    positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = ((Math.sin(i * 127.1) * 43758.5) % 1) * 5;
    positions[i * 3 + 1] = ((i * 1.618) % 1) * 5.5;
    positions[i * 3 + 2] = -1 - ((i * 2.414) % 1) * 14;
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(positions, 3));
  const dust = new T.Points(
    g,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...uniforms,
        flashlightPosition,
        flashlightDirection,
        flashlightPower,
      },
      vertexShader: `uniform float time;uniform vec3 flashlightPosition;uniform vec3 flashlightDirection;uniform float flashlightPower;varying float a;
        void main(){vec3 p=position;p.y=mod(p.y+time*.025,5.5);p.x+=sin(time*.07+p.z)*.08;
        vec3 delta=p-flashlightPosition;float distanceToLight=length(delta);
        float cone=smoothstep(.86,.96,dot(normalize(delta),flashlightDirection));
        float moon=exp(-dot(p.xz-vec2(.5,-8.),p.xz-vec2(.5,-8.))*.5);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(14./-mv.z,1.,3.);a=.015+moon*.12+flashlightPower*cone*.35/(1.+distanceToLight*.3);}`,
      fragmentShader: `varying float a;void main(){gl_FragColor=vec4(.7,.85,.84,a*(1.-smoothstep(.1,.5,length(gl_PointCoord-.5))));}`,
    }),
  );
  scene.add(dust);
  const rainPositions = new Float32Array(240 * 6);
  for (let i = 0; i < 240; i++) {
    const x = -0.7 + ((i * 0.618) % 1) * 2.4,
      z = -9 + ((i * 0.414) % 1) * 2,
      y = (i * 0.32) % 5.6;
    rainPositions.set([x, y, z, x - 0.014, y + 0.12, z], i * 6);
  }
  const rg = new T.BufferGeometry();
  rg.setAttribute("position", new T.BufferAttribute(rainPositions, 3));
  const rain = new T.LineSegments(
    rg,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: `uniform float time;void main(){vec3 p=position;p.y=mod(p.y-time*3.,5.6);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `void main(){gl_FragColor=vec4(.55,.7,.8,.16);}`,
    }),
  );
  scene.add(rain);
  const steam = new T.Mesh(
    new T.PlaneGeometry(2, 3),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms,
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float time;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){float x=v.x-.5-sin(v.y*8.-time*.6)*.08;
        vec2 flow=vec2(x*4.,v.y*3.-time*.25);
        float n=noise(flow*3.)*.6+noise(flow*7.+time*.08)*.27+noise(flow*15.)*.13;
        float a=exp(-x*x/(.005+v.y*.05))*sin(v.y*3.14159)*smoothstep(.24,.72,n)*.38;
        gl_FragColor=vec4(.65,.73,.7,a);}`,
    }),
  );
  steam.position.set(5.1, 2, -12.5);
  scene.add(steam);
  // Small ballistic impacts accompany the expanding rings. Their per-drop
  // phase prevents the whole puddle from splashing in unison.
  const splashPositions = new Float32Array(72 * 3);
  for (let i = 0; i < 72; i++) {
    splashPositions.set(
      [
        -0.7 + ((i * 0.618) % 1) * 2.4,
        (i * 0.414) % 1,
        -9 + ((i * 0.732) % 1) * 2,
      ],
      i * 3,
    );
  }
  const splashGeometry = new T.BufferGeometry();
  splashGeometry.setAttribute(
    "position",
    new T.BufferAttribute(splashPositions, 3),
  );
  scene.add(
    new T.Points(
      splashGeometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms,
        vertexShader: `uniform float time;varying float a;void main(){float f=fract(time*1.4+position.y);vec3 p=position;
      p.y=.03+sin(f*3.14159)*.12;p.x+=sin(position.y*93.)*f*.08;p.z+=cos(position.y*93.)*f*.08;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(9./-mv.z,1.,2.5);a=(1.-f)*.35;}`,
        fragmentShader: `varying float a;void main(){gl_FragColor=vec4(.65,.78,.83,a*(1.-smoothstep(.1,.5,length(gl_PointCoord-.5))));}`,
      }),
    ),
  );
  const ripples = [];
  for (let i = 0; i < 8; i++) {
    const r = new T.Mesh(
      new T.RingGeometry(0.16, 0.17, 48),
      new T.MeshBasicMaterial({
        color: 0x9eb6ba,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    r.rotation.x = -Math.PI / 2;
    r.position.set(-0.5 + i * 0.3, 0.025, -8 + ((i * 0.61) % 1));
    scene.add(r);
    ripples.push(r);
  }
  // Camera-space cone, softened at both ends and at the silhouette. Additive
  // scattering leaves surfaces visible; it does not paint an opaque triangle.
  const flashMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 v;void main(){float a=pow(sin(v.x*3.14159),2.)*sin(v.y*3.14159)*.009;gl_FragColor=vec4(.7,.75,.8,a);}`,
  });
  const flashBeam = new T.Mesh(
    new T.ConeGeometry(1.7, 5, 24, 1, true),
    flashMat,
  );
  scene.add(flashBeam);
  return {
    update(t, camera, flashlight) {
      flashlightPosition.value.copy(camera.position);
      flashlightDirection.value
        .set(0, 0, -1)
        .applyQuaternion(camera.quaternion);
      flashlightPower.value = flashlight ? 1 : 0;
      flashBeam.visible = flashlight;
      flashBeam.position
        .copy(camera.position)
        .add(
          new T.Vector3(0.12, -0.15, -2.5).applyQuaternion(camera.quaternion),
        );
      flashBeam.quaternion.copy(camera.quaternion);
      flashBeam.rotateX(Math.PI / 2);
      steam.quaternion.copy(camera.quaternion);
      uniforms.time.value = t;
      ripples.forEach((r, i) => {
        const f = (t * 0.7 + i * 0.123) % 1;
        r.scale.setScalar(f * 3);
        r.material.opacity = (1 - f) * 0.12;
      });
    },
  };
}
