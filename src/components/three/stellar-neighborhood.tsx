"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Color, Vector3 } from "three";
import type { Planet } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { CosmicPoints } from "./cosmic-points";

const sunVertex = `varying vec3 vNormal;varying vec3 vPosition;void main(){vPosition=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const sunFragment = `varying vec3 vNormal;varying vec3 vPosition;void main(){float grain=fract(sin(dot(floor(vPosition*90.),vec3(12.9898,78.233,43.51)))*43758.5453);float limb=pow(max(0.,vNormal.z),.35);vec3 tint=mix(vec3(.8,.26,.055),vec3(1.,.92,.7),limb);gl_FragColor=vec4(tint*(1.+grain*.35),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Decorative stellar context. Planet positions remain the user's original coordinates. */
export function StellarNeighborhood({ planets, tier }: { planets: Planet[]; tier: RenderTier }) {
  const sun = useMemo(() => {
    const minX = Math.min(-10, ...planets.map(p => p.position[0] - p.appearance.size));
    return new Vector3(minX - 10, 16, 4);
  }, [planets]);
  const paths = useMemo(() => planets.slice(0, tier === "low" ? 6 : 18).map((planet, index) => {
    const axis = new Vector3(...planet.position).sub(sun), tangent = new Vector3(-axis.z, (index % 3 - 1) * 5, axis.x).normalize().multiplyScalar(axis.length());
    return Array.from({ length: 129 }, (_, i) => {
      const angle = i / 128 * Math.PI * 2;
      return sun.clone().addScaledVector(axis, Math.cos(angle)).addScaledVector(tangent, Math.sin(angle));
    });
  }), [planets, tier, sun]);
  const glow = useMemo(() => {
    const color = new Color("#ffe5b3");
    return { positions: new Float32Array([0, 0, 0]), colors: new Float32Array([color.r, color.g, color.b]), sizes: new Float32Array([13]) };
  }, []);
  return <group>
    <ambientLight intensity={0.17} color="#8199bd" />
    <directionalLight position={sun.toArray()} intensity={3.1} color="#fff0d7" />
    <directionalLight position={[12, -5, -10]} intensity={0.35} color="#486b9a" />
    <group position={sun.toArray()}>
      <mesh raycast={() => null}><sphereGeometry args={[1.35, 32, 24]} /><shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} /></mesh>
      <CosmicPoints cloud={glow} opacity={0.65} soft />
    </group>
    {paths.map((points, i) => <Line key={i} points={points} color="#8198ac" transparent opacity={0.085} lineWidth={0.65} depthWrite={false} raycast={() => null} />)}
  </group>;
}
