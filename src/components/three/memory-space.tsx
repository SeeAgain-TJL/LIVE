"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { Media, Memory, Quality } from "@/domain/types";
import { memoryMediaKind } from "@/domain/memory";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";
import { StarField } from "./star-field";
import { MemoryCamera } from "./memory-camera";
import { MemoryOrb } from "./memory-orb";
import { SceneMetrics } from "./scene-metrics";

interface MemorySpaceProps {
  memories: Memory[]; media: Media[]; selectedId: string | null; onSelect: (id: string) => void; quality?: Quality;
}

class SpaceBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ContextMonitor({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}

export function MemorySpace({ memories, media, selectedId, onSelect, quality = "auto" }: MemorySpaceProps) {
  const labels = useRef<HTMLDivElement>(null!);
  const deviceLow = useLowPowerDevice();
  const reducedMotion = useReducedMotion();
  const [lost, setLost] = useState(false);
  const low = quality === "low" || (quality === "auto" && deviceLow) || memories.length > 80;
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const fallback = <div className="memory-scene-fallback" role="status"><p>暂时无法展开 3D 空间</p><p>你仍可以使用上方的「列表管理」查找、阅读和编辑全部记忆。</p></div>;
  return <div className="memory-space-canvas" aria-label="三维记忆球空间">
    <div ref={labels} className="scene-label-layer" aria-hidden="true" />
    {lost ? fallback : <SpaceBoundary fallback={fallback}><Canvas camera={{ position: [0, 0.7, 11], fov: 46, near: 0.1, far: 1000 }} dpr={low ? 1 : [1, 1.6]}
      gl={{ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" }} fallback={fallback}>
      <color attach="background" args={["#050a16"]} />
      <ambientLight intensity={0.3} color="#8ba5d8" /><pointLight position={[-6, 8, 8]} intensity={24} distance={35} color="#c7d8ff" /><pointLight position={[8, -4, -10]} intensity={8} distance={30} color="#6f8cff" />
      <StarField low={low} />
      {memories.map((memory, index) => <MemoryOrb key={memory.id} memory={memory} kind={memoryMediaKind(memory, media)} index={index} total={memories.length}
        selected={memory.id === selectedId} low={low} reducedMotion={reducedMotion} labels={labels} onSelect={() => onSelect(memory.id)} />)}
      <MemoryCamera total={memories.length} selectedIndex={memories.findIndex(memory => memory.id === selectedId)} reducedMotion={reducedMotion} />
      <SceneMetrics tier={low ? "low" : "high"} auxiliaryPasses={0} />
      <ContextMonitor onLost={() => setLost(true)} />
    </Canvas></SpaceBoundary>}
  </div>;
}
