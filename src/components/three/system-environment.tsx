"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import type { Planet } from "@/domain/types";
import type { StellarSource } from "@/domain/spatial-scene";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { environmentBodies, systemDebris } from "@/domain/system-environment";
import { PlanetMesh } from "./planet-mesh";

export function SystemEnvironment({ source, identity, planets, tier, reduced }: { source: StellarSource; identity: string; planets: Planet[]; tier: RenderTier; reduced: boolean }) {
  const bodies = useMemo(() => environmentBodies(identity, planets, source), [identity, planets, source]);
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
    {bodies.map((body, i) => <PlanetMesh key={i} appearance={body.appearance} position={body.position} lightPosition={source.position} reducedMotion={reduced} low={tier === "low"} />)}
    <instancedMesh ref={mesh} args={[undefined, undefined, pieces.length]} raycast={() => null}>
      <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#a0978d" roughness={1} />
    </instancedMesh>
  </group>;
}
