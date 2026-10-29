"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, DoubleSide, BackSide, type Group, type Mesh, Vector3, AdditiveBlending } from "three";
import type { PlanetAppearance, Vec3 } from "@/domain/types";
import { createPlanetTexture } from "./planet-texture";

const atmosphereVertex = `varying vec3 vNormal; varying vec3 vPosition;
void main(){ vec4 world = modelMatrix * vec4(position,1.); vPosition=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`;
const atmosphereFragment = `varying vec3 vNormal; varying vec3 vPosition; uniform vec3 tint;
void main(){ vec3 eye=normalize(cameraPosition-vPosition); float rim=pow(1.-abs(dot(normalize(vNormal),eye)),3.8); float sun=max(.12,dot(normalize(vNormal),normalize(vec3(-6.,8.,10.)))); gl_FragColor=vec4(tint,rim*sun*.38); }`;
const ringVertex = `varying vec3 localPosition; varying vec3 worldPosition;
void main(){ localPosition=position; vec4 world=modelMatrix*vec4(position,1.); worldPosition=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`;
const ringFragment = `varying vec3 localPosition; varying vec3 worldPosition; uniform vec3 tint; uniform float radius;
void main(){ float r=length(localPosition.xy)/radius; float band=.52+.22*sin(r*130.)+.13*sin(r*390.); float gap=smoothstep(.025,.045,abs(r-1.99)); float edge=smoothstep(1.42,1.53,r)*(1.-smoothstep(2.18,2.4,r)); float light=.62+.38*smoothstep(-2.,2.,worldPosition.x); gl_FragColor=vec4(tint*band*light,edge*gap*.84); }`;

export function PlanetMesh({ appearance, position = [0, 0, 0], selected = false, low = false, reducedMotion = false, onSelect, onHover, born = false }: {
  appearance: PlanetAppearance; position?: Vec3; selected?: boolean; low?: boolean; reducedMotion?: boolean;
  onSelect?: (event: ThreeEvent<MouseEvent>) => void; onHover?: (hovered: boolean) => void; born?: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const birth = useRef(born ? 0.05 : 1);
  const texture = useMemo(() => createPlanetTexture(appearance, low), [appearance, low]);
  useEffect(() => () => texture.dispose(), [texture]);
  const atmosphere = useMemo(() => ({ tint: { value: new Color(appearance.type === "ocean" ? "#568cba" : appearance.type === "ice" ? "#a2d8e5" : appearance.color) } }), [appearance]);
  const rings = useMemo(() => ({ tint: { value: new Color(appearance.color).lerp(new Color("#e0d3bc"), 0.32) }, radius: { value: appearance.size } }), [appearance.color, appearance.size]);
  const scale = useMemo(() => new Vector3(1, 1, 1), []);
  useFrame((_, dt) => {
    if (mesh.current && !reducedMotion) mesh.current.rotation.y += dt * 0.025;
    if (group.current && birth.current < 0.999) {
      birth.current = reducedMotion ? 1 : Math.min(1, birth.current + dt * 0.7);
      group.current.scale.copy(scale).multiplyScalar(1 - Math.pow(1 - birth.current, 3));
    }
  });
  const radius = appearance.size;
  return <group ref={group} position={position}>
    <mesh ref={mesh} rotation={[0.06, appearance.seed, 0.12]} onClick={onSelect} onPointerOver={e => { e.stopPropagation(); if (onSelect) document.body.style.cursor = "pointer"; onHover?.(true); }} onPointerOut={() => { document.body.style.cursor = "auto"; onHover?.(false); }}>
      <sphereGeometry args={[radius, low ? 40 : 80, low ? 28 : 64]} />
      <meshStandardMaterial map={texture} bumpMap={appearance.type === "gas" || appearance.type === "ringed" ? undefined : texture} bumpScale={appearance.type === "ocean" ? 0.035 : 0.09} roughness={appearance.type === "ocean" ? 0.62 : 0.94} metalness={0.02} />
    </mesh>
    <mesh scale={1.025} raycast={() => null}>
      <sphereGeometry args={[radius, low ? 32 : 64, 32]} />
      <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={atmosphere} transparent side={BackSide} depthWrite={false} blending={AdditiveBlending} />
    </mesh>
    {appearance.rings && <mesh rotation={[-Math.PI / 2.65, -0.18, 0.2]} raycast={() => null}>
      <ringGeometry args={[radius * 1.42, radius * 2.4, low ? 100 : 200]} />
      <shaderMaterial uniforms={rings} vertexShader={ringVertex} fragmentShader={ringFragment} transparent side={DoubleSide} depthWrite={false} />
    </mesh>}
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radius * 1.3, 0]} raycast={() => null}>
      <ringGeometry args={[radius * 1.18, radius * 1.19, 96]} />
      <meshBasicMaterial color="#d9c39c" transparent opacity={0.45} side={DoubleSide} depthWrite={false} />
    </mesh>}
  </group>;
}
