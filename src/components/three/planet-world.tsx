"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Object3D, type Group, type InstancedMesh } from "three";
import type { Media, Memory, Planet, Quality } from "@/domain/types";
import { memoryMediaKind } from "@/domain/memory";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";

function Terrain({ low }: { low: boolean }) {
  const geometry = useMemo(() => {
    const size = 25, segments = low ? 24 : 42;
    const vertices: number[] = [], indices: number[] = [];
    for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
      const px = (x / segments - .5) * size, pz = (z / segments - .5) * size;
      const d = Math.hypot(px * .55, pz * .42);
      const height = Math.max(-.25, Math.sin(px * .48) * .18 + Math.cos(pz * .33) * .16 + Math.max(0, 1 - d / 10) * .55);
      vertices.push(px, height, pz);
    }
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
    return g;
  }, [low]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#274d5a" roughness={.92} metalness={.02} /></mesh>;
}

function Trees({ low }: { low: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const count = low ? 24 : 64;
  const matrices = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = i * 2.399, r = 2.4 + (i % 9) * .72, o = new Object3D();
    o.position.set(Math.cos(a) * r, .25, Math.sin(a) * r * .7); o.scale.setScalar(.24 + (i % 4) * .06); o.rotation.y = a; o.updateMatrix(); return o.matrix;
  }), [count]);
  useLayoutEffect(() => { if (ref.current) matrices.forEach((matrix, i) => ref.current!.setMatrixAt(i, matrix)); if (ref.current) ref.current.instanceMatrix.needsUpdate = true; }, [matrices]);
  return <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow><coneGeometry args={[1, 2.1, 7]} /><meshStandardMaterial color="#5d956d" roughness={.9} /></instancedMesh>;
}

function WorldAnchors({ memories, media, selectedId, onSelect }: { memories: Memory[]; media: Media[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <>{memories.map((memory, i) => {
    const angle = i * 2.399, r = 2.8 + Math.sqrt(i + 1) * 1.25, position: [number, number, number] = [Math.cos(angle) * r, 1.15 + (i % 3) * .55, Math.sin(angle) * r * .72];
    const kind = memoryMediaKind(memory, media);
    const color = kind === "video" ? "#d99cff" : kind === "photo" ? "#78d8e8" : kind === "mixed" ? "#f4c878" : "#9fb9ff";
    return <group key={memory.id} position={position} onClick={event => { event.stopPropagation(); onSelect(memory.id); }}>
      <mesh><sphereGeometry args={[selectedId === memory.id ? .34 : .25, 20, 14]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={selectedId === memory.id ? 1.4 : .5} roughness={.28} /></mesh>
      <mesh scale={1.65} raycast={() => null}><sphereGeometry args={[.25, 14, 10]} /><meshBasicMaterial color={color} transparent opacity={.13} blending={AdditiveBlending} depthWrite={false} /></mesh>
      <Html center position={[0, .48, 0]} style={{ pointerEvents: "none" }}><span className={`world-memory-label ${selectedId === memory.id ? "selected" : ""}`}>{memory.title || "未命名记忆"}</span></Html>
    </group>;
  })}</>;
}

function WorldContent({ memories, media, selectedId, onSelect, quality }: Props) {
  const lowDevice = useLowPowerDevice(), reduced = useReducedMotion();
  const low = quality === "low" || (quality === "auto" && lowDevice);
  const sun = useRef<Group>(null);
  useFrame((_, dt) => { if (sun.current && !reduced) sun.current.rotation.y += dt * .04; });
  return <>
    <color attach="background" args={["#071528"]} /><fog attach="fog" args={["#071528", 12, 34]} />
    <ambientLight intensity={.34} color="#8da9cf" /><directionalLight castShadow={!low} position={[-7, 11, 5]} intensity={2.2} color="#ffe2b2" />
    <group ref={sun} position={[-9, 8, -12]}><mesh><sphereGeometry args={[1.2, 24, 16]} /><meshBasicMaterial color="#ffd48a" /></mesh><pointLight intensity={22} distance={45} color="#ffcf99" /></group>
    <Terrain low={low} /><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.08, 0]}><circleGeometry args={[7.2, 64]} /><meshStandardMaterial color="#246681" transparent opacity={.72} roughness={.12} metalness={.06} /></mesh>
    <Trees low={low} /><WorldAnchors memories={memories} media={media} selectedId={selectedId} onSelect={onSelect} /><OrbitControls enablePan={false} minDistance={6} maxDistance={24} enableDamping={!reduced} dampingFactor={.06} />
  </>;
}

function WorldScene(props: Props) {
  const lowDevice = useLowPowerDevice();
  const low = props.quality === "low" || (props.quality === "auto" && lowDevice);
  return <Canvas shadows={!low} camera={{ position: [10, 7, 14], fov: 42 }} dpr={low ? 1 : [1, 1.5]} gl={{ antialias: !low, powerPreference: low ? "low-power" : "high-performance" }}>
    <WorldContent {...props} />
  </Canvas>;
}

interface Props { planet: Planet; memories: Memory[]; media: Media[]; selectedId: string | null; onSelect: (id: string) => void; quality: Quality; }
export function PlanetWorld(props: Props) {
  return <div className="planet-world-canvas" aria-label={`${props.planet.name || "未命名星球"} 的生命记忆世界`}><WorldScene {...props} />
    {props.memories.length > 0 && <nav className="world-memory-index" aria-label="世界中的记忆锚点">{props.memories.map(memory => <button key={memory.id} type="button" aria-label={`打开记忆：${memory.title || "未命名记忆"}`} aria-pressed={memory.id === props.selectedId} onClick={() => props.onSelect(memory.id)}>{memory.title || "未命名记忆"}</button>)}</nav>}
    {props.memories.length === 0 && <p className="world-empty-note">这里还没有记忆锚点。写下第一段时光，它会出现在这个世界里。</p>}
  </div>;
}
