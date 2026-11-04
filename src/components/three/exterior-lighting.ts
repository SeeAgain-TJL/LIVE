import type { MeshStandardMaterial } from "three";

// Radius units throughout, so the ring and its shadow share the same gaps.
const ringProfile = `
float ringGap(float r, float footprint, float at, float halfWidth, float edge, float clear) {
  return 1. - clear * (1. - smoothstep(halfWidth, halfWidth + max(edge, footprint), abs(r - at)));
}
float ringDensity(float r, float footprint) {
  float envelope = smoothstep(1.43, 1.58, r) * (1. - smoothstep(2.27, 2.40, r));
  float shelves = .25 + .44 * smoothstep(1.57, 1.65, r) - .23 * smoothstep(1.87, 1.95, r)
    + .18 * smoothstep(2.02, 2.09, r) - .11 * smoothstep(2.22, 2.28, r);
  float gaps = ringGap(r, footprint, 1.947, .030, .010, .91)
    * ringGap(r, footprint, 1.708, .004, .006, .38)
    * ringGap(r, footprint, 1.838, .009, .011, .46)
    * ringGap(r, footprint, 2.169, .002, .008, .73);
  float q = r - 1.41;
  float a = footprint * 123., b = footprint * 388.;
  // Different spacing in each radial region; fade ringlets below one pixel.
  float ringlets = .11 * sin(q * (63. + q * 36.)) / (1. + a * a)
    + .068 * sin(q * (251. - q * 87.)) / (1. + b * b);
  return envelope * gaps * (shelves + ringlets);
}
`;

export const ringRotation = [-Math.PI / 2.65, -.18, .2] as const;

/** Keep the Standard BRDF and the existing two maps. Only exterior meshes use this patch. */
export function shadeExterior(
  shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0],
  uniforms: Record<string, { value: unknown }>,
  ringed: boolean,
) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>
      uniform vec3 exteriorToStar;
      varying vec3 vExteriorRadial, vExteriorSun;`)
    .replace("#include <project_vertex>", `#include <project_vertex>
      vExteriorRadial = mat3(modelMatrix) * normal;
      vExteriorSun = exteriorToStar - mat3(modelMatrix) * position;`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>
      varying vec3 vExteriorRadial, vExteriorSun;
      uniform float exteriorBounce, exteriorTwilight;
      ${ringed ? `uniform vec3 exteriorRingNormal; ${ringProfile}` : ""}`)
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      vec3 radial = normalize(vExteriorRadial);
      vec3 starRay = normalize(vExteriorSun);
      float sunElevation = dot(radial, starRay);
      // Relief affects the BRDF, but cannot illuminate the geometrical night side.
      float daylight = smoothstep(-.025, .095, sunElevation);
      ${ringed ? `
        float rayDot = dot(starRay, exteriorRingNormal);
        float planeDot = dot(radial, exteriorRingNormal);
        float travel = -planeDot / (rayDot < 0. ? min(-.0001, rayDot) : max(.0001, rayDot));
        float ringRadius = length(radial + max(0., travel) * starRay);
        // Derivatives must be evaluated before a divergent branch. Most sphere
        // fragments do not project onto the annulus, so skip its density work.
        float ringFootprint = fwidth(ringRadius);
        if (daylight > 0. && travel > 0. && ringRadius > 1.43 && ringRadius < 2.40) {
          float opacity = ringDensity(ringRadius, ringFootprint);
          daylight *= 1. - .72 * opacity * smoothstep(0., .12, travel);
        }
      ` : ""}
      reflectedLight.directDiffuse *= daylight;
      reflectedLight.directSpecular *= daylight;
      // Very dim cool reflected light, carried by albedo; no emissive night hemisphere.
      float twilight = 1. - smoothstep(0., .24, abs(sunElevation + .012));
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        (vec3(.72, .84, 1.) * exteriorBounce + vec3(.67, .86, 1.) * twilight * exteriorTwilight);
    `);
}

export const atmosphereVertex = `
varying vec3 vNormal, vPosition;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vPosition = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const atmosphereFragment = `
varying vec3 vNormal, vPosition;
uniform vec3 tint, lightPosition;
uniform float strength, density;
void main() {
  vec3 radial = normalize(vNormal);
  vec3 eye = normalize(cameraPosition - vPosition);
  vec3 sun = normalize(lightPosition - vPosition);
  // Back shell at the limb: evaluate lighting on the ray's tangent instead
  // of assigning an evenly glowing color to the entire silhouette.
  float path = clamp(-dot(radial, eye), 0., 1.);
  vec3 tangent = normalize(radial + eye * min(path, .94));
  float elevation = dot(tangent, sun);
  float lit = smoothstep(-.22, .32, elevation);
  float edge = smoothstep(0., .09, path) * (1. - smoothstep(.09, .27, path));
  float forward = .68 + .32 * dot(eye, sun) * dot(eye, sun);
  vec3 scatter = mix(tint * vec3(1.28, .78, .58), tint, smoothstep(-.04, .42, elevation));
  gl_FragColor = vec4(scatter, edge * lit * forward * strength * density);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const ringVertex = `
varying vec3 vRingWorld, vRingRadial, vRingNormal;
uniform float radius;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vRingWorld = world.xyz;
  vRingRadial = mat3(modelMatrix) * (position / (radius * length(modelMatrix[0].xyz)));
  vRingNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const ringFragment = `
varying vec3 vRingWorld, vRingRadial, vRingNormal;
uniform vec3 tint, lightPosition;
${ringProfile}
void main() {
  float r = length(vRingRadial);
  float opacity = ringDensity(r, fwidth(r));
  vec3 ray = normalize(lightPosition - vRingWorld);
  vec3 eye = normalize(cameraPosition - vRingWorld);
  float along = dot(-vRingRadial, ray);
  float miss = length(vRingRadial + ray * max(0., along));
  float light = smoothstep(.94, 1.06, miss);
  vec3 normal = normalize(vRingNormal);
  float sunAngle = dot(normal, ray);
  float seeLitSide = smoothstep(-.12, .13, sunAngle * sign(dot(normal, eye)));
  float scatter = dot(-ray, eye) * .5 + .5;
  float lit = (.23 + .77 * abs(sunAngle)) * mix(.48 + .30 * scatter, 1., seeLitSide);
  vec3 ice = tint * mix(vec3(.78, .69, .60), vec3(1.12, 1.08, 1.02), smoothstep(1.54, 1.88, r));
  // Small, world-anchored density variation. It fades before individual grains alias.
  vec2 grain = vRingRadial.xz * 440. + vRingRadial.y * vec2(311., -223.);
  vec2 pixel = fwidth(grain);
  vec2 cell = 1. - abs(2. * fract(grain) - 1.);
  float grit = (cell.x * cell.y - .25) * (1. - smoothstep(.32, 1.1, max(pixel.x, pixel.y)));
  gl_FragColor = vec4(ice * (.07 + light * lit) * (1. + .17 * grit), opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const cloudVertex = `
varying vec2 vUv;
varying vec3 vNormal, vPosition;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.);
  vPosition = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const cloudFragment = `
varying vec2 vUv;
varying vec3 vNormal, vPosition;
uniform sampler2D surface;
uniform vec3 lightPosition;
void main() {
  float coverage = texture2D(surface, vUv).b;
  float elevation = dot(normalize(vNormal), normalize(lightPosition - vPosition));
  float sun = smoothstep(-.085, .66, elevation);
  vec3 cloud = mix(vec3(.051, .068, .095), vec3(.81, .89, 1.), sun);
  gl_FragColor = vec4(cloud, coverage * (.53 + coverage * .36));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
