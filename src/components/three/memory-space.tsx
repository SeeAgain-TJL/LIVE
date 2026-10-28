"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, Color, DoubleSide, type Group, Vector3 } from "three";
import type { Media, Memory, Quality } from "@/domain/types";
import { memoryMediaKind, memoryPosition } from "@/domain/memory";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";
import { StarField } from "./star-field";

interface MemorySpaceProps {
  memories: Memory[];
  media: Media[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  quality?: Quality;
}

function MemoryCamera({ memories, selectedId, reducedMotion }: Pick<MemorySpaceProps, "memories" | "selectedId"> & { reducedMotion: boolean }) {
  const { camera } = useThree();
  const current = useRef(new Vector3(0, 0, 0));
  const desired = useRef(new Vector3(0, 0, 0));
  useFrame((_, delta) => {
    const index = selectedId ? memories.findIndex(memory => memory.id === selectedId) : -1;
    const target = index >= 0 ? new Vector3(...memoryPosition(index, memories.length)) : new Vector3(0, 0, 0);
    desired.current.copy(target);
    current.current.lerp(desired.current, reducedMotion ? 1 : Math.min(1, delta * 2.2));
    const distance = index >= 0 ? 4.6 : 13;
    const cameraTarget = current.current.clone();
    const cameraPosition = current.current.clone().add(new Vector3(0, index >= 0 ? 0.7 : 1.4, distance));
    camera.position.lerp(cameraPosition, reducedMotion ? 1 : Math.min(1, delta * 1.8));
    camera.lookAt(cameraTarget);
  });
  return null;
}

function MemoryOrb({ memory, media, index, total, selected, low, reducedMotion, onSelect }: {
  memory: Memory; media: Media[]; index: number; total: number; selected: boolean; low: boolean; reducedMotion: boolean; onSelect: () => void;
}) {
  const group = useRef<Group>(null);
  const base = useMemo(() => new Vector3(...memoryPosition(index, total)), [index, total]);
  const kind = memoryMediaKind(memory, media);
  const color = kind === "photo" ? "#6ad1df" : kind === "video" ? "#be8de8" : kind === "mixed" ? "#e6c47e" : "#8ea8ff";
  const phase = useMemo(() => (index * 1.73) % 6.28, [index]);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const y = base.y + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.35 + phase) * 0.18);
    group.current.position.set(base.x, y, base.z);
    group.current.rotation.y += reducedMotion ? 0 : delta * 0.12;
    const scale = selected ? 1.35 : 1;
    group.current.scale.lerp(new Vector3(scale, scale, scale), reducedMotion ? 1 : Math.min(1, delta * 5));
  });
  const event = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); };
  return <group ref={group} onClick={event} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "auto"; }}>
    <mesh>
      <sphereGeometry args={[0.58, low ? 18 : 32, low ? 14 : 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.8 : 0.28} roughness={kind === "photo" ? 0.18 : 0.65} metalness={kind === "photo" ? 0.28 : 0.06} transparent={kind === "photo"} opacity={kind === "photo" ? 0.72 : 1} />
    </mesh>
    <mesh raycast={() => null} scale={1.17}>
      <sphereGeometry args={[0.58, low ? 16 : 28, low ? 12 : 20]} />
      <meshBasicMaterial color={color} transparent opacity={selected ? 0.28 : 0.1} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
    </mesh>
    {(kind === "video" || kind === "mixed" || selected) && <mesh rotation={[Math.PI / 2.3, 0.2, 0]} raycast={() => null}>
      <torusGeometry args={[0.78, selected ? 0.035 : 0.018, 8, low ? 32 : 72]} />
      <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.55} blending={AdditiveBlending} />
    </mesh>}
    {!low && <Html center distanceFactor={8} position={[0, -0.95, 0]} style={{ pointerEvents: "none" }}>
      <div className={`memory-orb-label ${selected ? "selected" : ""}`}><span>{memory.title || "未命名记忆"}</span><small>{memory.occurredOn}</small></div>
    </Html>}
  </group>;
}

export function MemorySpace({ memories, media, selectedId, onSelect, quality = "auto" }: MemorySpaceProps) {
  const deviceLow = useLowPowerDevice();
  const reducedMotion = useReducedMotion();
  const low = quality === "low" || (quality === "auto" && deviceLow) || memories.length > 80;
  return <div className="memory-space-canvas" aria-label="三维记忆球空间"><Canvas camera={{ position: [0, 1.4, 13], fov: 46, near: 0.1, far: 1000 }} dpr={low ? 1 : [1, 1.6]} gl={{ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" }}>
    <color attach="background" args={[new Color("#050a16").getHex()]} />
    <ambientLight intensity={0.24} color="#8ba5d8" /><pointLight position={[-6, 8, 8]} intensity={18} distance={35} color="#c7d8ff" /><pointLight position={[8, -4, -10]} intensity={8} distance={30} color="#6f8cff" />
    <StarField low={low} />
    {memories.map((memory, index) => <MemoryOrb key={memory.id} memory={memory} media={media} index={index} total={memories.length} selected={memory.id === selectedId} low={low} reducedMotion={reducedMotion} onSelect={() => onSelect(memory.id)} />)}
    <MemoryCamera memories={memories} selectedId={selectedId} reducedMotion={reducedMotion} />
    <OrbitControls enablePan={false} enableDamping={!reducedMotion} dampingFactor={0.08} minDistance={4} maxDistance={24} rotateSpeed={0.45} zoomSpeed={0.7} />
  </Canvas></div>;
}
