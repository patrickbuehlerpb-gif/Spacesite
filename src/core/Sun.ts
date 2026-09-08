import * as THREE from 'three';

/**
 * Glowing Sun: animated granulation shader on a sphere + additive corona sprite.
 *   const sun = createSun(radius); scene.add(sun.group); sun.update(dt);
 */
export interface Sun { group: THREE.Group; mesh: THREE.Mesh; corona: THREE.Sprite; update(dt: number): void; setIntensity(v: number): void }

const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform float uTime; uniform float uIntensity;
varying vec3 vN; varying vec3 vP; varying vec3 vV;
float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec3(1.7); a*=0.5; } return v; }
void main(){
  vec3 p = normalize(vP);
  float t = uTime*0.05;
  float g = fbm(p*6.0 + vec3(t, -t*0.7, t*0.3));
  float g2 = fbm(p*18.0 - vec3(t*1.3));
  float v = g*0.7 + g2*0.3;
  vec3 dark = vec3(0.95, 0.35, 0.05);
  vec3 bright = vec3(1.0, 0.92, 0.6);
  vec3 col = mix(dark, bright, smoothstep(0.35, 0.75, v));
  float limb = pow(max(dot(normalize(vN), vV), 0.0), 0.6);
  col *= 0.55 + 0.6*limb;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

let coronaTex: THREE.Texture | null = null;
function coronaTexture(): THREE.Texture {
  if (coronaTex) return coronaTex;
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.12, 'rgba(255,220,150,0.9)');
  grad.addColorStop(0.3, 'rgba(255,170,80,0.35)');
  grad.addColorStop(0.6, 'rgba(255,120,40,0.08)');
  grad.addColorStop(1, 'rgba(255,100,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  coronaTex = new THREE.CanvasTexture(c);
  coronaTex.colorSpace = THREE.SRGBColorSpace;
  return coronaTex;
}

export function createSun(radius: number, coronaScale = 5): Sun {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.6 } }, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  corona.scale.setScalar(radius * coronaScale);
  group.add(mesh, corona);
  return {
    group, mesh, corona,
    update(dt) { mat.uniforms.uTime.value += dt; },
    setIntensity(v) { mat.uniforms.uIntensity.value = v; (corona.material as THREE.SpriteMaterial).opacity = Math.min(1, v / 1.6); },
  };
}
