"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Color, type Group } from "three";
import type { Galaxy } from "@/domain/types";
import { galaxyPosition } from "@/domain/galaxy";
import { COSMIC_BUDGETS, galaxySamples, galaxyStyle, type RenderTier } from "@/domain/cosmic-visuals";
import { CosmicPoints } from "./cosmic-points";
import { GalaxyDisk } from "./galaxy-disk";

export function GalaxyCluster({ galaxy, index, count, tier, reduced, labels, enter }: {
  galaxy: Galaxy; index: number; count: number; tier: RenderTier; reduced: boolean; labels: RefObject<HTMLDivElement>; enter: () => void;
}) {
  const rotation = useRef<Group>(null);
  const style = useMemo(() => galaxyStyle(galaxy.id), [galaxy.id]);
  const clouds = useMemo(() => {
    const budget = COSMIC_BUDGETS[tier];
    const cool = new Color(galaxy.color).lerp(new Color("#8eafff"), 0.28), warm = new Color("#fff0cb"), color = new Color();
    return [false, true].map(dust => {
      const samples = galaxySamples(galaxy.id, dust ? budget.dust : budget.galaxy, dust);
      const colors = new Float32Array(samples.positions.length);
      samples.radii.forEach((r, i) => {
        color.copy(warm).lerp(cool, Math.min(1, r * 2.6));
        color.multiplyScalar(Math.min(1, 0.28 + r * 3));
        if (dust) color.multiplyScalar(0.65);
        colors.set([color.r, color.g, color.b], i * 3);
      });
      return { ...samples, colors };
    });
  }, [galaxy.id, galaxy.color, tier]);
  useFrame((_, dt) => { if (rotation.current && !reduced) rotation.current.rotation.y += Math.min(dt, 0.05) * style.speed; });
  return <group position={galaxyPosition(index)}>
    <group rotation={style.tilt}><group ref={rotation}>
      <GalaxyDisk id={galaxy.id} color={galaxy.color} />
      <CosmicPoints cloud={clouds[0]} opacity={0.56 * Math.sqrt(7500 / COSMIC_BUDGETS[tier].galaxy)} lod />
      <CosmicPoints cloud={clouds[1]} opacity={0.035 * 600 / COSMIC_BUDGETS[tier].dust} soft lod />
    </group></group>
    <mesh onClick={e => { e.stopPropagation(); if (e.delta <= 7) enter(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <sphereGeometry args={[style.radius * 0.86, 20, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <Html portal={labels} center position={[0, -style.radius * 0.64 - 1, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div className="galaxy-scene-label"><strong>{galaxy.name}</strong><span>{count} 颗星球</span></div></Html>
  </group>;
}
