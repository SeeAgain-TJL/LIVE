"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, DoubleSide, BackSide, type Group, type Mesh, Vector3, AdditiveBlending } from "three";
import type { PlanetAppearance, Vec3 } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { EXTERIOR_BUDGETS } from "./planet-texture";
import { usePlanetTextures } from "./use-planet-textures";

const atmosphereVertex = `varying vec3 vNormal; varying vec3 vPosition;
void main(){ vec4 world = modelMatrix * vec4(position,1.); vPosition=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`;
const atmosphereFragment = `varying vec3 vNormal; varying vec3 vPosition; uniform vec3 tint; uniform vec3 lightPosition;
void main(){ vec3 eye=normalize(cameraPosition-vPosition); float rim=pow(1.-abs(dot(normalize(vNormal),eye)),3.8); float sun=smoothstep(-.18,.6,dot(normalize(vNormal),normalize(lightPosition-vPosition))); gl_FragColor=vec4(tint,rim*(.025+sun*.48)); }`;
const ringVertex = `varying vec3 localPosition; varying vec3 worldPosition;
void main(){ localPosition=position; vec4 world=modelMatrix*vec4(position,1.); worldPosition=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`;
const ringFragment = `varying vec3 localPosition; varying vec3 worldPosition; uniform vec3 tint; uniform float radius; uniform vec3 lightPosition; uniform vec3 planetPosition;
float bandWave(float r,float f){return sin(r*f)/(1.+pow(fwidth(r)*f,2.));}
void main(){ float r=length(localPosition.xy)/radius; float band=.64+.18*bandWave(r,130.)+.1*bandWave(r,390.)+.045*bandWave(r,1100.); float gap=smoothstep(.025,.045,abs(r-1.99))*mix(.45,1.,smoothstep(.006,.018,abs(r-1.73))); float edge=smoothstep(1.42,1.53,r)*(1.-smoothstep(2.28,2.4,r)); vec3 ray=normalize(lightPosition-worldPosition); vec3 toCenter=planetPosition-worldPosition; float along=dot(toCenter,ray); float miss=length(toCenter-ray*max(0.,along)); float shadow=along>0.?smoothstep(radius*.95,radius*1.08,miss):1.; vec3 ice=mix(tint,tint*vec3(1.12,1.04,.91),smoothstep(1.7,2.3,r)); gl_FragColor=vec4(ice*band*(.12+.88*shadow),edge*gap*(.48+band*.4));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const cloudVertex = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition;
void main(){vUv=uv; vec4 world=modelMatrix*vec4(position,1.); vPosition=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world;}`;
const cloudFragment = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; uniform sampler2D surface; uniform vec3 lightPosition;
void main(){float coverage=texture2D(surface,vUv).b; float sun=max(0.,dot(normalize(vNormal),normalize(lightPosition-vPosition))); gl_FragColor=vec4(vec3(.89,.94,1.)*(.13+sun*.87),coverage*.87);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

const PREVIEW_LIGHT: Vec3 = [-6, 8, 10];

export function PlanetMesh({ appearance, position = [0, 0, 0], lightPosition = PREVIEW_LIGHT, selected = false, low = false, tier: requestedTier, reducedMotion = false, onSelect, onHover, born = false }: {
  appearance: PlanetAppearance; position?: Vec3; selected?: boolean; low?: boolean; reducedMotion?: boolean;
  onSelect?: (event: ThreeEvent<MouseEvent>) => void; onHover?: (hovered: boolean) => void; born?: boolean; lightPosition?: Vec3; tier?: RenderTier;
}) {
  const mesh = useRef<Mesh>(null);
  const clouds = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const birth = useRef(born ? 0.05 : 1);
  const desiredTier = requestedTier ?? (low ? "low" : "medium");
  const { ready } = usePlanetTextures(appearance, desiredTier);
  const tier = ready?.tier ?? desiredTier, budget = EXTERIOR_BUDGETS[tier];
  const { type, color, seed } = appearance;
  const relief = budget.bump && type !== "gas" && type !== "ringed";
  const textures = ready?.textures;
  const cloudUniforms = useMemo(() => ({ surface: { value: textures?.surface }, lightPosition: { value: new Vector3(...lightPosition) } }), [textures, lightPosition]);
  const atmosphere = useMemo(() => ({ tint: { value: new Color(appearance.type === "ocean" ? "#568cba" : appearance.type === "ice" ? "#a2d8e5" : appearance.color) }, lightPosition: { value: new Vector3(...lightPosition) } }), [appearance, lightPosition]);
  const rings = useMemo(() => ({ tint: { value: new Color(appearance.color).lerp(new Color("#e0d3bc"), 0.32) }, radius: { value: appearance.size }, lightPosition: { value: new Vector3(...lightPosition) }, planetPosition: { value: new Vector3(...position) } }), [appearance.color, appearance.size, lightPosition, position]);
  const scale = useMemo(() => new Vector3(1, 1, 1), []);
  useFrame((_, dt) => {
    if (mesh.current && !reducedMotion) mesh.current.rotation.y += dt * 0.025;
    if (clouds.current && !reducedMotion) clouds.current.rotation.y += dt * 0.028;
    if (group.current && birth.current < 0.999) {
      birth.current = reducedMotion ? 1 : Math.min(1, birth.current + dt * 0.7);
      group.current.scale.copy(scale).multiplyScalar(1 - Math.pow(1 - birth.current, 3));
    }
  });
  const radius = appearance.size;
  return <group ref={group} position={position}>
    <mesh ref={mesh} rotation={[0.06, appearance.seed, 0.12]} onClick={onSelect} onPointerOver={e => { e.stopPropagation(); if (onSelect) document.body.style.cursor = "pointer"; onHover?.(true); }} onPointerOut={() => { document.body.style.cursor = "auto"; onHover?.(false); }}>
      <sphereGeometry args={[radius, budget.segments, budget.rows]} />
      {/* Changing bump presence requires a new shader variant, releasing old sampler bindings. */}
      <meshStandardMaterial key={textures ? relief ? "relief" : "smooth" : "loading"} color={textures ? "#ffffff" : color} map={textures?.albedo} roughnessMap={textures?.surface} roughness={1} metalness={0}
        bumpMap={relief ? textures?.surface : undefined}
        bumpScale={radius * (type === "rocky" ? .055 : type === "ice" ? .028 : .012)} />
    </mesh>
    {textures && type === "ocean" && budget.clouds && <mesh ref={clouds} rotation={[0.06, seed, 0.12]} scale={1.012} raycast={() => null}>
      <sphereGeometry args={[radius, budget.segments, budget.rows]} />
      <shaderMaterial uniforms={cloudUniforms} vertexShader={cloudVertex} fragmentShader={cloudFragment} transparent depthWrite={false} />
    </mesh>}
    <mesh scale={1.025} raycast={() => null}>
      <sphereGeometry args={[radius, budget.segments, tier === "low" ? 20 : 32]} />
      <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={atmosphere} transparent side={BackSide} depthWrite={false} blending={AdditiveBlending} />
    </mesh>
    {appearance.rings && <mesh rotation={[-Math.PI / 2.65, -0.18, 0.2]} raycast={() => null}>
      <ringGeometry args={[radius * 1.42, radius * 2.4, tier === "low" ? 80 : tier === "medium" ? 128 : 192]} />
      <shaderMaterial uniforms={rings} vertexShader={ringVertex} fragmentShader={ringFragment} transparent side={DoubleSide} depthWrite={false} />
    </mesh>}
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radius * 1.3, 0]} raycast={() => null}>
      <ringGeometry args={[radius * 1.18, radius * 1.19, 96]} />
      <meshBasicMaterial color="#d9c39c" transparent opacity={0.45} side={DoubleSide} depthWrite={false} />
    </mesh>}
  </group>;
}
