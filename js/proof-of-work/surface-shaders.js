// Correlated surface channels: one height/albedo model feeds all five baked
// maps, so a pore, scratch or paint chip changes both light response and colour.
export const surfaceFragment = /* glsl */ `
  varying vec2 v;
  uniform float channel;
  uniform float kind;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1,0)), f.x),
               mix(hash(cell + vec2(0,1)), hash(cell + 1.0), f.x), f.y);
  }
  // Concrete aggregate and zinc crystals use different scales of this field.
  // The nearest cell's seed gives each inclusion its own mineral colour.
  vec2 cellular(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    float nearest = 8.0, seed = 0.0;
    for(int y = -1; y <= 1; y++) {
      for(int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x),float(y));
        vec2 jitter = vec2(hash(cell+offset),hash(cell+offset+17.3));
        float d = length(offset+jitter-f);
        if(d < nearest) { nearest = d; seed = hash(cell+offset+41.7); }
      }
    }
    return vec2(nearest,seed);
  }
  float edgeWear(vec2 p) {
    vec2 edge = min(fract(p), 1.0-fract(p));
    float distanceToEdge = min(edge.x, edge.y);
    float chipped = noise(p*151.0)*.008 + noise(p*37.0)*.003;
    return (1.0-smoothstep(chipped-.001,chipped+.002,distanceToEdge))*smoothstep(.3,.7,noise(p*23.0));
  }
  float pores(vec2 p) {
    return smoothstep(.69,.83,noise(p*470.0));
  }
  float scratches(vec2 p) {
    // Long discontinuous abrasions, never a regular ruled pattern.
    vec2 q = mat2(.97,.24,-.24,.97)*p;
    float line = 1.0-smoothstep(.15,.24,noise(vec2(q.x*1700.0,q.y*9.0)));
    return line*smoothstep(.32,.68,noise(q*31.0));
  }
  float heightAt(vec2 p) {
    if(kind < .5) {
      float grain = noise(p*180.0)*.06 + noise(p*910.0)*.012;
      float formwork = noise(p*13.0)*.055 + noise(vec2(p.x*5.0,p.y*120.0))*.005;
      float fissure=1.-smoothstep(.001,.006,abs(p.x-.38-sin(p.y*14.)*.015-noise(p*31.)*.02));
      return .5 + grain + formwork - pores(p)*.10 - fissure*.07;
    }
    if(kind < 1.5) {
      return .5 + noise(vec2(p.x*1600.0,p.y*8.0))*.012 + noise(p*240.0)*.004;
    }
    if(kind < 2.5) {
      return .5 + noise(p*650.0)*.008 - edgeWear(p)*.025;
    }
    if(kind < 3.5) {
      return .5 + noise(p*600.0)*.013 + noise(p*80.0)*.003;
    }
    if(kind > 4.5) return .5 + noise(vec2(p.x*1900.0,p.y*4.0))*.006;
    return .5 - scratches(p)*.003 + noise(p*1100.0)*.0008;
  }
  void main() {
    if(channel > .5 && channel < 1.5) {
      float h = heightAt(v), e = 1.0/2048.0;
      vec3 n = normalize(vec3((h-heightAt(v+vec2(e,0)))*24.,(h-heightAt(v+vec2(0,e)))*24.,1.));
      gl_FragColor=vec4(n*.5+.5,1.);return;
    }
    float fine = noise(v*850.0);
    float macro = noise(v*5.0);
    vec3 colour;
    float roughness, metalness, ao;
    if(kind < .5) {
      vec2 aggregate = channel < .5 ? cellular(v*220.0) : vec2(0.);
      float stone = 1.0-smoothstep(.12,.32,aggregate.x);
      colour = vec3(.40,.415,.425) + (macro-.5)*.07 + (fine-.5)*.035;
      colour += stone*(aggregate.y-.5)*.065;
      float pore = pores(v);
      colour *= 1.0-pore*.28;
      // Pale mineral bloom around old water tracks; deep staining is provided
      // separately in wall-space, so it always runs down toward the floor.
      float mineral = smoothstep(.64,.8,noise(v*18.0));
      colour += mineral*.018;
      roughness = mix(.48,.94,smoothstep(.25,.7,noise(vec2(v.x*29.,v.y*3.)))) + fine*.04;
      metalness = 0.0;
      ao = 1.0 - pore*.22;
    } else if(kind < 1.5) {
      vec2 zinc = vec2(0.,noise(v*110.));
      colour = vec3(.48,.50,.51) + (zinc.y-.5)*.075;
      colour += (noise(vec2(v.x*1400.0,v.y*6.0))-.5)*.04;
      roughness = .36 + zinc.y*.13 + scratches(v)*.07;
      metalness = .97;
      ao = .98;
    } else if(kind < 2.5) {
      float wear = edgeWear(v);
      float oxide = noise(v*130.0);
      vec3 paint = vec3(.065,.125,.115)*( .93 + fine*.14 );
      vec3 rust = mix(vec3(.07,.045,.03),vec3(.15,.085,.045),oxide);
      colour = mix(paint,rust,wear);
      roughness = mix(.46,.86,wear) + (fine-.5)*.06;
      metalness = mix(.18,.62,wear);
      ao = 1.0-wear*.08;
    } else if(kind < 3.5) {
      float dust = smoothstep(.6,.85,noise(v*29.0));
      colour = vec3(.027,.031,.033) + dust*.012 + (fine-.5)*.004;
      roughness = .79 + fine*.12;
      metalness = .015;
      ao = .97;
    } else if(kind < 4.5) {
      float scratch = scratches(v);
      colour = vec3(.83,.56,.21)*( .99 + macro*.02 );
      roughness = .38 + scratch*.14 + fine*.015;
      metalness = 1.0;
      ao = 1.0;
    } else {
      float brushed = noise(vec2(v.x*1700.0,v.y*4.0));
      colour = vec3(.49,.51,.52) + (brushed-.5)*.035;
      roughness = .32 + brushed*.13;
      metalness = .98; ao = 1.0;
    }
    if(channel < .5) {
      gl_FragColor = vec4(colour,1.0);
    } else if(channel < 2.5) {
      gl_FragColor = vec4(vec3(roughness),1.0);
    } else if(channel < 3.5) {
      gl_FragColor = vec4(vec3(metalness),1.0);
    } else {
      gl_FragColor = vec4(vec3(ao),1.0);
    }
  }
`;
