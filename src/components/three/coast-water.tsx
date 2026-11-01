"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import { Color, DataTexture, LinearFilter, RedFormat, UnsignedByteType, type ShaderMaterial } from "three";
import { sliceWorldHeight } from "@/domain/planet-world";
import type { CoastTier } from "@/domain/coast-composition";

const vertexShader = `
uniform float time;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.);
  w.y += .075 * sin(w.x * .21 + w.z * .08 - time * .7)
       + .038 * sin(w.z * .43 - w.x * .17 - time * 1.1);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const fragmentShader = `
uniform float time;
uniform float night;
uniform vec3 deepColor;
uniform sampler2D environmentMap;
uniform sampler2D terrainHeight;
varying vec3 vWorld;
const float PI = 3.141592653589793;
void main() {
  // The same CPU heightfield that builds the terrain defines shallow water and surf.
  vec2 terrainUv = (vWorld.xz + 110.) / 220.;
  float ground = texture2D(terrainHeight, clamp(terrainUv, 0., 1.)).r * 18. - 3.;
  float depth = max(0., .045 - ground);
  float a = vWorld.x * .21 + vWorld.z * .08 - time * .7;
  float b = vWorld.z * .43 - vWorld.x * .17 - time * 1.1;
  float c = vWorld.x * .91 + vWorld.z * .62 + time * 1.4;
  vec3 normal = normalize(vec3(
    -.075 * .21 * cos(a) + .038 * .17 * cos(b) - .014 * .91 * cos(c),
    1.,
    -.075 * .08 * cos(a) - .038 * .43 * cos(b) - .014 * .62 * cos(c)
  ));
  vec3 view = normalize(cameraPosition - vWorld);
  float ndv = max(dot(normal, view), 0.);
  float fresnel = .035 + .965 * pow(1. - ndv, 4.);
  vec3 reflected = reflect(-view, normal);
  vec2 skyUv = vec2(atan(reflected.z, reflected.x) / (2. * PI) + .5, asin(clamp(reflected.y, -1., 1.)) / PI + .5);
  vec3 sky = texture2D(environmentMap, skyUv).rgb;
  float shallow = 1. - smoothstep(.2, 2.7, depth);
  vec3 body = mix(deepColor * .7, vec3(.23, .49, .48), shallow * .8);
  body += vec3(.015, .035, .035) * sin(c) * sin(b);
  vec3 color = mix(body, sky * .54, fresnel * .52);
  vec3 sun = normalize(vec3(-.55, .53, -.67));
  color += vec3(1., .81, .58) * pow(max(dot(reflect(-sun, normal), view), 0.), 150.) * .48;
  float breakLine = 1. - smoothstep(.04, .48, depth);
  float surf = .5 + .5 * sin(vWorld.z * 1.55 - vWorld.x * .48 - time * 2.2);
  float foam = breakLine * smoothstep(.55, .88, surf) * (.78 + .22 * sin(c * 2.));
  color = mix(color, vec3(.78, .87, .83), clamp(foam * .75, 0., 1.));
  color *= mix(1., .32, night);
  gl_FragColor = vec4(color, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function CoastWater({ night, reduced, color, tier }: { night: boolean; reduced: boolean; color: Color; tier: CoastTier }) {
  const material = useRef<ShaderMaterial>(null);
  const environment = useEnvironment({ files: "/world-slice/kloofendal_48d_partly_cloudy_puresky_2k.hdr" });
  const height = useMemo(() => {
    const width = 256, values = new Uint8Array(width * width);
    for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
      const worldX = (x / (width - 1) - .5) * 220, worldZ = (z / (width - 1) - .5) * 220;
      values[z * width + x] = Math.round(Math.max(0, Math.min(1, (sliceWorldHeight(worldX, worldZ) + 3) / 18)) * 255);
    }
    const texture = new DataTexture(values, width, width, RedFormat, UnsignedByteType);
    texture.magFilter = texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => height.dispose(), [height]);
  const uniforms = useMemo(() => ({ time: { value: 0 }, night: { value: night ? 1 : 0 }, deepColor: { value: color }, environmentMap: { value: environment }, terrainHeight: { value: height } }), [night, color, environment, height]);
  useFrame((_, dt) => { if (material.current && !reduced) material.current.uniforms.time.value += Math.min(dt, .05); });
  return <mesh position={[0, .045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[320, 320, tier === "low" ? 36 : tier === "medium" ? 64 : 96, tier === "low" ? 36 : tier === "medium" ? 64 : 96]} />
    <shaderMaterial ref={material} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} depthWrite />
  </mesh>;
}
