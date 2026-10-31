"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AdditiveBlending, Color, Vector3, type Group } from "three";
import type { Galaxy } from "@/domain/types";
import { galaxyPosition } from "@/domain/galaxy";
import { COSMIC_BUDGETS, galaxySamples, galaxyStyle, type RenderTier } from "@/domain/cosmic-visuals";
import { CosmicPoints } from "./cosmic-points";
import { GalaxyDisk } from "./galaxy-disk";
import { galaxyIdentity } from "@/domain/galaxy-identity";

export function GalaxyCluster({ galaxy, index, count, tier, reduced, labels, enter }: {
  galaxy: Galaxy; index: number; count: number; tier: RenderTier; reduced: boolean; labels: RefObject<HTMLDivElement>; enter: () => void;
}) {
  const rotation = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const position = useMemo(() => new Vector3(...galaxyPosition(index)), [index]);
  const style = useMemo(() => galaxyStyle(galaxy.id), [galaxy.id]);
  const identity = useMemo(() => galaxyIdentity(galaxy.id), [galaxy.id]);
  const clouds = useMemo(() => {
    const budget = COSMIC_BUDGETS[tier];
    const cool = new Color(galaxy.color).lerp(new Color("#8eafff"), 0.28), warm = new Color("#fff0cb"), color = new Color();
    return [false, true].map(dust => {
      const samples = galaxySamples(galaxy.id, dust ? budget.dust : budget.galaxy, dust);
      const colors = new Float32Array(samples.positions.length);
      samples.radii.forEach((r, i) => {
        color.copy(warm).lerp(cool, Math.min(1, r * 2.6));
        color.multiplyScalar(Math.min(1, 0.28 + r * 3));
        // Broad dust sprites must not stack into a clipped white sheet in the nucleus.
        if (dust) color.multiplyScalar(0.65 * Math.min(1, .02 + (r / .38) ** 3));
        colors.set([color.r, color.g, color.b], i * 3);
      });
      return { ...samples, colors };
    });
  }, [galaxy.id, galaxy.color, tier]);
  const core = useMemo(() => ({ tint: { value: new Color(style.elliptical ? galaxy.color : "#e9d6b3") } }), [style.elliptical, galaxy.color]);
  useFrame(({ camera }, dt) => {
    if (rotation.current && !reduced) rotation.current.rotation.y += Math.min(dt, 0.05) * style.speed;
    if (label.current) {
      const distance = camera.position.distanceTo(position);
      label.current.dataset.range = distance < 70 ? "near" : "far";
      label.current.style.opacity = String(Math.min(1, 140 / distance));
      label.current.style.visibility = hovered.current || (distance < 145 && distance > style.radius * .8) ? "visible" : "hidden";
    }
  });
  return <group position={galaxyPosition(index)}>
    <group rotation={identity.orbitalTilt}><group ref={rotation}>
      <GalaxyDisk id={galaxy.id} color={galaxy.color} />
      <mesh scale={style.elliptical ? [style.radius*.48, style.radius*.27, style.radius*.39] : [style.radius*.16, style.radius*.09, style.radius*.12]} raycast={() => null}>
        <sphereGeometry args={[1, 24, 16]} /><shaderMaterial transparent depthWrite={false} blending={AdditiveBlending} uniforms={core}
          vertexShader={`varying vec3 n;varying vec3 p;void main(){n=normalize(normalMatrix*normal);vec4 v=modelViewMatrix*vec4(position,1.);p=v.xyz;gl_Position=projectionMatrix*v;}`}
          fragmentShader={`varying vec3 n;varying vec3 p;uniform vec3 tint;void main(){float a=pow(max(0.,dot(normalize(n),normalize(-p))),2.);gl_FragColor=vec4(tint*.55,a*.13);}`} />
      </mesh>
      <CosmicPoints cloud={clouds[0]} opacity={0.56 * Math.sqrt(7500 / COSMIC_BUDGETS[tier].galaxy)} additive={false} lod />
      <CosmicPoints cloud={clouds[1]} opacity={0.035 * identity.dust * 600 / COSMIC_BUDGETS[tier].dust} soft lod />
    </group></group>
    <mesh onClick={e => { e.stopPropagation(); if (e.delta <= 7) enter(); }} onPointerOver={() => { hovered.current = true; document.body.style.cursor = "pointer"; }} onPointerOut={() => { hovered.current = false; document.body.style.cursor = ""; }}>
      <sphereGeometry args={[style.radius * 0.86, 20, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <Html portal={labels} center position={[0, -style.radius * 0.64 - 1, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div ref={label} className="galaxy-scene-label" data-galaxy-id={galaxy.id} style={{ "--galaxy-accent": identity.accent } as React.CSSProperties}><strong>{galaxy.name}</strong><span>{count > 0 ? `${count} 颗我的星球` : "暂无我的星球 · 待创建"} · {style.elliptical ? "椭圆星系" : style.barred ? "棒旋星系" : "旋涡星系"}</span><small>{identity.mood}</small></div></Html>
  </group>;
}
