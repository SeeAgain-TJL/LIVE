"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, InstancedMesh, Object3D } from "three";
import type { Planet } from "@/domain/types";
import type { StellarSource } from "@/domain/spatial-scene";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { systemDebris, vacancySlots } from "@/domain/system-environment";
import { Line } from "@react-three/drei";

export function SystemEnvironment({ source, identity, planets, tier, onCreate }: { source: StellarSource; identity: string; planets: Planet[]; tier: RenderTier; onCreate?: () => void }) {
  const vacancies = useMemo(() => vacancySlots(identity, planets, source), [identity, planets, source]);
  const pieces = useMemo(() => systemDebris(identity, planets, source, tier), [identity, planets, source, tier]);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new Object3D();
    pieces.forEach((piece, i) => {
      object.position.fromArray(piece.position); object.scale.set(piece.size, piece.size * .62, piece.size * .85); object.rotation.fromArray(piece.rotation);
      object.updateMatrix(); mesh.current!.setMatrixAt(i, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere();
  }, [pieces]);
  return <group>
    {vacancies.map(slot => <group key={slot.id} position={slot.position} onClick={event => { event.stopPropagation(); onCreate?.(); }} onPointerOver={() => { if (onCreate) document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "auto"; }}>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[slot.size * 1.3, .018, 8, 64]} /><meshBasicMaterial color="#93c7e8" transparent opacity={.42} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh onClick={event => { event.stopPropagation(); onCreate?.(); }}>
        <sphereGeometry args={[slot.size * .78, 24, 16]} /><meshBasicMaterial color="#82b5df" transparent opacity={.06} wireframe side={DoubleSide} />
      </mesh>
      <Line points={[[0, -slot.size * 1.8, 0], [0, -slot.size * 2.35, 0]]} color="#9acbe8" transparent opacity={.38} lineWidth={.8} raycast={() => null} />
    </group>)}
    <instancedMesh ref={mesh} args={[undefined, undefined, pieces.length]} raycast={() => null}>
      <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#a0978d" roughness={1} />
    </instancedMesh>
  </group>;
}
