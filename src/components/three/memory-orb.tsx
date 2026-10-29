"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FileText, Image as ImageIcon, Layers, Video } from "lucide-react";
import { AdditiveBlending, DoubleSide, type Group, Vector3 } from "three";
import type { MemoryMediaKind } from "@/domain/memory";
import { memoryPosition } from "@/domain/memory";
import type { Memory } from "@/domain/types";

export function MemoryOrb({ memory, kind, index, total, selected, low, reducedMotion, labels, onSelect }: {
  memory: Memory; kind: MemoryMediaKind; index: number; total: number; selected: boolean; low: boolean;
  reducedMotion: boolean; labels: RefObject<HTMLDivElement>; onSelect: () => void;
}) {
  const group = useRef<Group>(null);
  const surface = useRef<Group>(null);
  const base = useMemo(() => new Vector3(...memoryPosition(index, total)), [index, total]);
  const scale = useMemo(() => new Vector3().setScalar(selected ? 1.1 : 1), [selected]);
  const color = kind === "photo" ? "#6ad1df" : kind === "video" ? "#be8de8" : kind === "mixed" ? "#e6c47e" : "#8ea8ff";
  const Icon = kind === "photo" ? ImageIcon : kind === "video" ? Video : kind === "mixed" ? Layers : FileText;
  const kindName = { text: "文字", photo: "照片", video: "视频", mixed: "图影" }[kind];
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    group.current.position.set(base.x, base.y + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.35 + index * 1.73) * 0.12), base.z);
    group.current.scale.lerp(scale, reducedMotion ? 1 : Math.min(1, delta * 5));
    if (surface.current) surface.current.rotation.y += reducedMotion ? 0 : delta * 0.12;
  });
  const click = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(); };
  return <group ref={group} position={base}>
    <group ref={surface} onClick={click} onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh><sphereGeometry args={[0.58, low ? 18 : 40, low ? 14 : 28]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.65 : 0.24} roughness={kind === "photo" ? 0.18 : 0.45} metalness={0.16} transparent={kind === "photo"} opacity={kind === "photo" ? 0.72 : 1} /></mesh>
      <mesh raycast={() => null} scale={1.17}><sphereGeometry args={[0.58, 20, 16]} /><meshBasicMaterial color={color} transparent opacity={selected ? 0.2 : 0.09} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} /></mesh>
      {(kind === "video" || kind === "mixed" || selected) && <mesh rotation={[Math.PI / 2.3, 0.2, 0]} raycast={() => null}><torusGeometry args={[0.8, selected ? 0.025 : 0.018, 8, low ? 32 : 64]} /><meshBasicMaterial color={color} transparent opacity={selected ? 0.85 : 0.5} blending={AdditiveBlending} /></mesh>}
    </group>
    <Html portal={labels} center position={[0, -0.95, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
      <div className={`memory-orb-label ${selected ? "selected" : ""}`} data-memory-id={memory.id}>
        <span><Icon size={14} />{kindName} · {memory.title || "未命名记忆"}</span><time>{memory.occurredOn}</time>
      </div>
    </Html>
  </group>;
}
