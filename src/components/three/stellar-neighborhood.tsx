"use client";

import { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Color, InstancedMesh, Object3D, Vector3 } from "three";
import type { Planet } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { orbitFrame, type StellarSource } from "@/domain/spatial-scene";
import { CosmicPoints } from "./cosmic-points";

const sunVertex = `varying vec3 vNormal;varying vec3 vPosition;varying vec3 vEye;void main(){vPosition=position;vec4 mv=modelViewMatrix*vec4(position,1.);vEye=normalize(-mv.xyz);vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`;
const sunFragment = `varying vec3 vNormal;varying vec3 vPosition;varying vec3 vEye;void main(){float grain=fract(sin(dot(floor(vPosition*54.),vec3(12.9898,78.233,43.51)))*43758.5453);float limb=pow(max(0.,dot(normalize(vNormal),normalize(vEye))),.65);float cells=.5+.5*sin(vPosition.x*13.+sin(vPosition.y*17.))*sin(vPosition.z*18.+vPosition.y*8.);vec3 tint=mix(vec3(.36,.065,.009),vec3(1.5,.78,.26),limb);gl_FragColor=vec4(tint*(.82+grain*.15+cells*.12),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function OrbitPath({ planet, source, index }: { planet: Planet; source: StellarSource; index: number }) {
  const line = useRef<React.ComponentRef<typeof Line>>(null);
  const points = useMemo(() => {
    const frame = orbitFrame(planet, source, index), center = new Vector3(...source.position);
    return Array.from({ length: 193 }, (_, i) => {
      const angle = i / 192 * Math.PI * 2;
      return center.clone().addScaledVector(new Vector3(...frame.axis), Math.cos(angle)).addScaledVector(new Vector3(...frame.tangent), Math.sin(angle));
    });
  }, [planet, source, index]);
  const anchor = useMemo(() => new Vector3(...planet.position), [planet.position]);
  useFrame(({ camera }) => { if (line.current) line.current.material.opacity = .09 / (1 + camera.position.distanceTo(anchor) / 70); });
  return <Line ref={line} points={points} color="#91a8bc" transparent opacity={.05} lineWidth={.6} depthTest depthWrite={false} raycast={() => null} />;
}

/** Bounded, decorative local debris; no invented archive entities or media. */
function Satellites({ planets, tier }: { planets: Planet[]; tier: RenderTier }) {
  const mesh = useRef<InstancedMesh>(null);
  const pieces = useMemo(() => planets.slice(0, 12).flatMap((planet, index) => {
    const count = tier === "low" ? 0 : tier === "high" ? 26 : 14;
    const center = new Vector3(...planet.position), radius = planet.appearance.size;
    return Array.from({ length: count + 1 }, (_, i) => {
      const moon = i === 0, angle = i * 2.399 + index * 1.3;
      const distance = radius * (moon ? 3.3 : 2.7 + (i % 7) * .14);
      return { position: center.clone().add(new Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance * .55, Math.sin(angle) * distance * .7)), scale: radius * (moon ? .13 : .012 + (i % 4) * .004) };
    });
  }), [planets, tier]);
  useLayoutEffect(() => {
    const object = new Object3D();
    pieces.forEach((piece, i) => { object.position.copy(piece.position); object.scale.setScalar(piece.scale); object.rotation.set(i, i * .6, i * .17); object.updateMatrix(); mesh.current!.setMatrixAt(i, object.matrix); });
    if (mesh.current) { mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere(); }
  }, [pieces]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, pieces.length]} raycast={() => null}><icosahedronGeometry args={[1, tier === "low" ? 1 : 2]} /><meshStandardMaterial color="#87949c" roughness={1} /></instancedMesh>;
}

/** Actual source and visual star share coordinates. Original planet positions are untouched. */
export function StellarNeighborhood({ planets, tier, source, showOrbits }: { planets: Planet[]; tier: RenderTier; source: StellarSource; showOrbits: boolean }) {
  const glow = useMemo(() => {
    const color = new Color("#ffd49a");
    return { positions: new Float32Array([0, 0, 0]), colors: new Float32Array([color.r, color.g, color.b]), sizes: new Float32Array([source.radius * 5.8]) };
  }, [source.radius]);
  return <group>
    <ambientLight intensity={.09} color="#7185a5" />
    <pointLight position={source.position} intensity={source.intensity} decay={2} color="#fff0d7" />
    <group position={source.position}>
      <mesh raycast={() => null}><sphereGeometry args={[source.radius, 40, 32]} /><shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} /></mesh>
      <CosmicPoints cloud={glow} opacity={.28} soft />
    </group>
    {showOrbits && planets.slice(0, tier === "low" ? 6 : 18).map((planet, i) => <OrbitPath key={planet.id} planet={planet} index={i} source={source} />)}
    <Satellites planets={planets} tier={tier} />
  </group>;
}
