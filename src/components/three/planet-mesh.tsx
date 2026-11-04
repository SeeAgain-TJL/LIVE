"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, DoubleSide, BackSide, Euler, type Group, type Mesh, type MeshStandardMaterial, type ShaderMaterial, type SphereGeometry, Vector3 } from "three";
import type { PlanetAppearance, Vec3 } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { EXTERIOR_BUDGETS } from "./planet-texture";
import { usePlanetTextures } from "./use-planet-textures";
import type { ExteriorLodPlan } from "./use-exterior-lod";

import { atmosphereFragment, atmosphereVertex, cloudFragment, cloudVertex, ringFragment, ringRotation, ringVertex, shadeExterior } from "./exterior-lighting";

const PREVIEW_LIGHT: Vec3 = [-6, 5, 6];
const ringNormal = new Vector3(0, 0, 1).applyEuler(new Euler(...ringRotation));
const optical = {
  rocky: { bounce: .075, twilight: .006, height: .008, density: .10, tint: "#b8a69c", relief: .045 },
  ocean: { bounce: .071, twilight: .055, height: .023, density: .49, tint: "#79b6e5", relief: .009 },
  ice: { bounce: .075, twilight: .025, height: .015, density: .24, tint: "#adcddb", relief: .055 },
  gas: { bounce: .09, twilight: .035, height: .018, density: .32, tint: "#9bb2cc", relief: 0 },
  ringed: { bounce: .088, twilight: .026, height: .015, density: .26, tint: "#c5b5a3", relief: 0 },
} satisfies Record<PlanetAppearance["type"], { bounce: number; twilight: number; height: number; density: number; tint: string; relief: number }>;

export function PlanetMesh({ appearance, position = [0, 0, 0], lightPosition = PREVIEW_LIGHT, selected = false, low = false, tier: requestedTier, reducedMotion = false, onSelect, onHover, born = false, lod }: {
  appearance: PlanetAppearance; position?: Vec3; selected?: boolean; low?: boolean; reducedMotion?: boolean;
  onSelect?: (event: ThreeEvent<MouseEvent>) => void; onHover?: (hovered: boolean) => void; born?: boolean; lightPosition?: Vec3; tier?: RenderTier; lod?: ExteriorLodPlan;
}) {
  const mesh = useRef<Mesh>(null);
  const clouds = useRef<Mesh>(null);
  const rim = useRef<Mesh<SphereGeometry, ShaderMaterial>>(null);
  const group = useRef<Group>(null);
  const birth = useRef(born ? 0.05 : 1);
  const desiredTier = lod ? lod.tier : requestedTier ?? (low ? "low" : "medium");
  const { ready } = usePlanetTextures(appearance, desiredTier, lod?.signal);
  const tier = ready?.tier ?? (lod ? "low" : desiredTier ?? "low"), budget = EXTERIOR_BUDGETS[tier];
  const compact = lod?.compact && tier === "low";
  const segments = compact ? 20 : budget.segments, rows = compact ? 14 : budget.rows;
  const { type, color, seed } = appearance;
  const relief = budget.bump && type !== "gas" && type !== "ringed";
  const textures = ready?.textures;
  const cloudUniforms = useMemo(() => ({ surface: { value: textures?.surface }, lightPosition: { value: new Vector3(...lightPosition) } }), [textures, lightPosition]);
  const style = optical[type];
  const atmosphere = useMemo(() => ({ tint: { value: new Color(style.tint) }, lightPosition: { value: new Vector3(...lightPosition) },
    strength: { value: 1 }, density: { value: style.density } }), [style, lightPosition]);
  const lighting = useRef({ exteriorToStar: { value: new Vector3() }, exteriorRingNormal: { value: ringNormal },
    exteriorBounce: { value: 0 }, exteriorTwilight: { value: 0 } });
  useLayoutEffect(() => {
    lighting.current.exteriorToStar.value.set(lightPosition[0] - position[0], lightPosition[1] - position[1], lightPosition[2] - position[2]);
    lighting.current.exteriorBounce.value = style.bounce;
    lighting.current.exteriorTwilight.value = style.twilight;
  }, [lightPosition, position, style]);
  const ringed = appearance.rings;
  const surfaceProgram = useMemo(() => ({
    onBeforeCompile: (shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0]) => shadeExterior(shader, lighting.current, ringed),
    customProgramCacheKey: () => ringed ? "exterior-v2-ring" : "exterior-v2",
  }), [ringed]);
  const rings = useMemo(() => ({ tint: { value: new Color(appearance.color).lerp(new Color("#e0d3bc"), 0.32) }, radius: { value: appearance.size }, lightPosition: { value: new Vector3(...lightPosition) } }), [appearance.color, appearance.size, lightPosition]);
  const scale = useMemo(() => new Vector3(1, 1, 1), []);
  useFrame((_, dt) => {
    if (mesh.current && !reducedMotion) mesh.current.rotation.y += dt * 0.025;
    if (clouds.current && !reducedMotion) clouds.current.rotation.y += dt * 0.028;
    if (lod && rim.current) {
      const target = lod.signal.atmosphere;
      const strength = rim.current.material.uniforms.strength, current = strength.value as number;
      strength.value = reducedMotion ? target : current + (target - current) * (1 - Math.exp(-dt * 14));
      rim.current.visible = strength.value > .01;
    }
    if (group.current && birth.current < 0.999) {
      birth.current = reducedMotion ? 1 : Math.min(1, birth.current + dt * 0.7);
      group.current.scale.copy(scale).multiplyScalar(1 - Math.pow(1 - birth.current, 3));
    }
  });
  if (lod?.hidden) return null;
  const radius = appearance.size;
  return <group ref={group} position={position}>
    <mesh ref={mesh} rotation={[0.06, appearance.seed, 0.12]} onClick={onSelect} onPointerOver={e => { e.stopPropagation(); if (onSelect) document.body.style.cursor = "pointer"; onHover?.(true); }} onPointerOut={() => { document.body.style.cursor = "auto"; onHover?.(false); }}>
      <sphereGeometry args={[radius, segments, rows]} />
      {/* Changing bump presence requires a new shader variant, releasing old sampler bindings. */}
      <meshStandardMaterial {...surfaceProgram} key={`${textures ? relief ? "relief" : "smooth" : "loading"}-${ringed}`} color={textures ? "#ffffff" : color} map={textures?.albedo} roughnessMap={textures?.surface} roughness={1} metalness={0}
        bumpMap={relief ? textures?.surface : undefined}
        bumpScale={radius * style.relief} />
    </mesh>
    {textures && type === "ocean" && budget.clouds && <mesh ref={clouds} rotation={[0.06, seed, 0.12]} scale={1.012} raycast={() => null}>
      <sphereGeometry args={[radius, budget.segments, budget.rows]} />
      <shaderMaterial uniforms={cloudUniforms} vertexShader={cloudVertex} fragmentShader={cloudFragment} transparent depthWrite={false} />
    </mesh>}
    <mesh ref={rim} scale={1 + style.height} raycast={() => null}>
      <sphereGeometry args={[radius, segments, compact ? 12 : tier === "low" ? 20 : 32]} />
      <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={atmosphere} transparent side={BackSide} depthWrite={false} />
    </mesh>
    {appearance.rings && <mesh rotation={ringRotation} raycast={() => null}>
      <ringGeometry args={[radius * 1.42, radius * 2.4, compact ? 48 : tier === "low" ? 80 : tier === "medium" ? 128 : 192]} />
      <shaderMaterial uniforms={rings} vertexShader={ringVertex} fragmentShader={ringFragment} transparent side={DoubleSide} depthWrite={false} />
    </mesh>}
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radius * 1.3, 0]} raycast={() => null}>
      <ringGeometry args={[radius * 1.18, radius * 1.19, 96]} />
      <meshBasicMaterial color="#d9c39c" transparent opacity={0.45} side={DoubleSide} depthWrite={false} />
    </mesh>}
  </group>;
}
