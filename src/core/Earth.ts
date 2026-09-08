import * as THREE from 'three';
import { textureUrl } from './Loader';

/**
 * Photoreal-ish Earth: day/night blend by sun direction, ocean specular, cloud layer, atmospheric rim.
 * Textures: public/textures/earth_*.jpg (NASA Blue Marble via three.js).
 *
 *   const earth = createEarth(1);            // radius in scene units
 *   scene.add(earth.group);
 *   earth.setSunDirection(dirWorld);         // unit vector from Earth towards the Sun (world space)
 *   earth.update(dt);                        // slowly drifts the clouds
 *   earth.setRotation(gmstRadians)           // rotate so that lon 0 faces the right way (optional)
 *
 * Orientation: the mesh's +Y is the north pole; longitude 0 (Greenwich) is at +X when rotation.y = 0
 * (three.js sphere UV seam is at -X → we rotate the texture by using `latLonToVector3`).
 */
export interface EarthOptions { clouds?: boolean; atmosphere?: boolean; segments?: number; anisotropy?: number }
export interface Earth {
  group: THREE.Group;
  surface: THREE.Mesh;
  clouds?: THREE.Mesh;
  atmosphere?: THREE.Mesh;
  radius: number;
  setSunDirection(dir: THREE.Vector3): void;
  /** rotate the globe about its axis (radians); use for real time-of-day alignment */
  setRotation(rad: number): void;
  update(dt: number): void;
  ready: Promise<void>;
}

const SURF_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SURF_FRAG = /* glsl */ `
uniform sampler2D uDay, uNight, uSpec;
uniform vec3 uSunDir; uniform vec3 uCamPos;
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunDir);
  float day = smoothstep(-0.12, 0.25, ndl);
  vec3 dayC = texture2D(uDay, vUv).rgb;
  vec3 nightC = texture2D(uNight, vUv).rgb * 1.4;
  float spec = texture2D(uSpec, vUv).r;
  vec3 v = normalize(uCamPos - vPosW);
  vec3 h = normalize(uSunDir + v);
  float s = pow(max(dot(n, h), 0.0), 48.0) * spec * 0.9 * day;
  // warm terminator tint
  float term = smoothstep(-0.05, 0.15, ndl) * (1.0 - smoothstep(0.15, 0.45, ndl));
  vec3 col = dayC * (0.15 + 0.95 * max(ndl, 0.0)) * day + nightC * (1.0 - day) + vec3(1.0, 0.7, 0.4) * term * 0.08 + vec3(s);
  // faint blue rim from atmosphere scattering
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.25, 0.5, 1.0) * rim * (0.25 + 0.55 * day);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uClouds; uniform vec3 uSunDir;
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunDir);
  float a = texture2D(uClouds, vUv).r;
  float light = 0.08 + 0.95 * max(ndl, 0.0);
  gl_FragColor = vec4(vec3(light), a * 0.85);
  #include <colorspace_fragment>
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uCamPos; uniform vec3 uColor;
varying vec3 vNormalW; varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(uCamPos - vPosW);
  float rim = pow(1.0 - abs(dot(n, v)), 2.6);
  float lit = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(n, uSunDir));
  gl_FragColor = vec4(uColor * rim * lit * 1.4, rim * lit);
}`;

export function createEarth(radius: number, o: EarthOptions = {}): Earth {
  const group = new THREE.Group();
  const seg = o.segments ?? 96;
  const loader = new THREE.TextureLoader();
  const aniso = o.anisotropy ?? 8;
  const tex = (name: string, srgb = true) => new Promise<THREE.Texture>((res, rej) => loader.load(textureUrl(name), (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; res(t);
  }, undefined, rej));

  const sun = new THREE.Vector3(1, 0, 0);
  const surfMat = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: null }, uNight: { value: null }, uSpec: { value: null }, uSunDir: { value: sun.clone() }, uCamPos: { value: new THREE.Vector3() } },
    vertexShader: SURF_VERT, fragmentShader: SURF_FRAG,
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg / 2), surfMat);
  group.add(surface);

  let clouds: THREE.Mesh | undefined;
  if (o.clouds !== false) {
    const cm = new THREE.ShaderMaterial({
      uniforms: { uClouds: { value: null }, uSunDir: { value: sun.clone() } },
      vertexShader: SURF_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.006, seg, seg / 2), cm);
    group.add(clouds);
  }

  let atmosphere: THREE.Mesh | undefined;
  if (o.atmosphere !== false) {
    const am = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: sun.clone() }, uCamPos: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.35, 0.6, 1.0) } },
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    });
    atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, seg, seg / 2), am);
    group.add(atmosphere);
  }

  const ready = Promise.all([tex('earth_day.jpg'), tex('earth_night.jpg'), tex('earth_specular.jpg', false), clouds ? tex('earth_clouds.png', false) : Promise.resolve(null)])
    .then(([day, night, spec, cl]) => {
      surfMat.uniforms.uDay.value = day; surfMat.uniforms.uNight.value = night; surfMat.uniforms.uSpec.value = spec;
      if (clouds && cl) (clouds.material as THREE.ShaderMaterial).uniforms.uClouds.value = cl;
    });

  // camera position uniform is updated in onBeforeRender
  const updCam = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
    surfMat.uniforms.uCamPos.value.copy(camera.position);
    if (atmosphere) (atmosphere.material as THREE.ShaderMaterial).uniforms.uCamPos.value.copy(camera.position);
  };
  surface.onBeforeRender = updCam;

  return {
    group, surface, clouds, atmosphere, radius, ready,
    setSunDirection(dir) {
      sun.copy(dir).normalize();
      surfMat.uniforms.uSunDir.value.copy(sun);
      if (clouds) (clouds.material as THREE.ShaderMaterial).uniforms.uSunDir.value.copy(sun);
      if (atmosphere) (atmosphere.material as THREE.ShaderMaterial).uniforms.uSunDir.value.copy(sun);
    },
    setRotation(rad) { surface.rotation.y = rad; if (clouds) clouds.rotation.y = rad + cloudDrift; },
    update(dt) { cloudDrift += dt * 0.004; if (clouds) clouds.rotation.y = surface.rotation.y + cloudDrift; },
  };
}
let cloudDrift = 0;

/**
 * Point on a sphere of `radius` for geographic lat/lon (degrees), matching the Earth texture mapping
 * (three.js SphereGeometry: u=0 at -X going counter-clockwise seen from +Y; texture lon -180 at u=0).
 */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

/** Direction (unit vector, Earth-local frame) of the Sun for a sub-solar lat/lon. */
export function sunDirectionFromSubsolar(lat: number, lon: number): THREE.Vector3 {
  return latLonToVector3(lat, lon, 1).normalize();
}
