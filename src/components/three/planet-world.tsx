"use client";

/* eslint-disable react-hooks/immutability -- R3F owns these mutable camera and canvas objects, not React render state. */
import { Component, useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Vector3, type Group } from "three";
import type { Media, Memory, Planet, Quality } from "@/domain/types";
import { memoryMediaKind } from "@/domain/memory";
import { WORLD_BATCH_SIZE, worldHeight, worldMemoryPosition } from "@/domain/planet-world";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";
import { WorldEnvironment } from "./world-environment";
import { SceneMetrics } from "./scene-metrics";

interface Props { planet: Planet; memories: Memory[]; media: Media[]; selectedId: string | null; onSelect: (id: string) => void; quality: Quality; night?: boolean; onReady?: () => void; }
class WorldBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function WorldController({ onReady, onLost, reduced }: { onReady?: () => void; onLost: () => void; reduced: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null), ready = useRef(false);
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>()), forward = useRef(new Vector3()), side = useRef(new Vector3());
  useEffect(() => {
    const canvas = gl.domElement;canvas.tabIndex = 0;canvas.setAttribute('aria-label', '探索星球世界：拖动观察，双指平移，滚轮缩放；聚焦后使用 WASD 行走');
    const down = (e: KeyboardEvent) => { if (/^[wasd]$/i.test(e.key)) { keys.current.add(e.key.toLowerCase()); e.preventDefault(); } };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();const lost = (e: Event) => { e.preventDefault();onLost(); };
    canvas.addEventListener('keydown', down);window.addEventListener('keyup', up);canvas.addEventListener('blur', clear);canvas.addEventListener('webglcontextlost', lost);
    return () => { canvas.removeEventListener('keydown', down);window.removeEventListener('keyup', up);canvas.removeEventListener('blur', clear);canvas.removeEventListener('webglcontextlost', lost); };
  }, [gl, onLost]);
  useFrame((_, dt) => {
    if (!ready.current) { ready.current = true;gl.domElement.dataset.worldReady = 'true';onReady?.(); }
    const control = controls.current;if (!control) return;
    camera.getWorldDirection(forward.current);forward.current.y = 0;forward.current.normalize();side.current.crossVectors(forward.current, camera.up);
    const step = Math.min(dt, .04) * 5;
    for (const key of keys.current) { const delta = (key === 'w' || key === 's' ? forward.current : side.current).clone().multiplyScalar(step * (key === 's' || key === 'a' ? -1 : 1));camera.position.add(delta);control.target.add(delta); }
    camera.position.x = Math.max(-42, Math.min(42, camera.position.x));camera.position.z = Math.max(-40, Math.min(42, camera.position.z));
    camera.position.y = Math.max(Math.max(.1, worldHeight(camera.position.x, camera.position.z)) + 1.6, Math.min(38, camera.position.y));
    control.target.x = Math.max(-30, Math.min(30, control.target.x));control.target.z = Math.max(-32, Math.min(32, control.target.z));control.target.y = Math.max(.5, Math.min(12, control.target.y));
  });
  return <OrbitControls ref={controls} makeDefault target={[0, 1.5, -8]} enablePan enableDamping={!reduced} dampingFactor={.08} minDistance={2} maxDistance={58} maxPolarAngle={Math.PI * .48} minPolarAngle={.15} rotateSpeed={.4} panSpeed={.65} zoomSpeed={.6} />;
}

function Anchor({ memory, media, selected, onSelect, reduced, labels }: { memory: Memory; media: Media[]; selected: boolean; onSelect: (id: string) => void; reduced: boolean; labels: React.RefObject<HTMLDivElement>; }) {
  const position = worldMemoryPosition(memory.id), kind = memoryMediaKind(memory, media), ref = useRef<Group>(null);
  const color = kind === 'video' ? '#e2b1f5' : kind === 'photo' ? '#9ae2dc' : kind === 'mixed' ? '#efd49f' : '#c7d8ff';
  const pointer = useRef<{ x: number; y: number; distance: number; time: number } | null>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = position[1] + (reduced ? 0 : Math.sin(clock.elapsedTime * .8 + position[0]) * .12); });
  return <group ref={ref} position={position} onPointerDown={e => { if (e.nativeEvent.isPrimary === false || e.button > 0) return;pointer.current = { x: e.clientX, y: e.clientY, distance: 0, time: performance.now() }; }} onPointerMove={e => { if (pointer.current) pointer.current.distance = Math.max(pointer.current.distance, Math.hypot(e.clientX - pointer.current.x, e.clientY - pointer.current.y)); }} onPointerOut={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} onPointerUp={e => { const p = pointer.current;pointer.current = null;if (p && p.distance < 7 && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 7 && performance.now() - p.time < 650) { e.stopPropagation();onSelect(memory.id); } }}>
    <mesh><sphereGeometry args={[selected ? .52 : .43, 24, 16]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 1.2 : .45} metalness={.25} roughness={.18} /></mesh>
    <mesh rotation={[Math.PI * .36, 0, .3]} raycast={() => null}><torusGeometry args={[.62, .018, 6, 48]} /><meshBasicMaterial color={color} /></mesh>
    <Html portal={labels} center position={[0, .9, 0]} distanceFactor={14} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}><span className="world-memory-label">{kind === 'photo' ? '▧' : kind === 'video' ? '▷' : '◇'} {memory.title || '未命名记忆'}</span></Html>
  </group>;
}
function WorldContent(props: Props & { low: boolean; labels: React.RefObject<HTMLDivElement>; onLost: () => void }) {
  const reduced = useReducedMotion();const { gl } = useThree();
  useEffect(() => { gl.domElement.dataset.worldAnchors = JSON.stringify(props.memories.map(m => ({ id: m.id, position: worldMemoryPosition(m.id) }))); }, [gl, props.memories]);
  return <><WorldEnvironment low={props.low} night={props.night ?? false} reduced={reduced} />
    {props.memories.map(memory => <Anchor key={memory.id} memory={memory} media={props.media} selected={props.selectedId === memory.id} onSelect={props.onSelect} reduced={reduced} labels={props.labels} />)}
    <WorldController reduced={reduced} onReady={props.onReady} onLost={props.onLost} /><SceneMetrics tier={props.low ? 'low' : 'high'} auxiliaryPasses={0} /></>;
}
export function PlanetWorld(props: Props) {
  const labels = useRef<HTMLDivElement>(null!), deviceLow = useLowPowerDevice();const low = props.quality === 'low' || (props.quality === 'auto' && deviceLow);
  const [lost, setLost] = useState(false), [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const { onReady } = props;
  const unavailable = useCallback(() => { setLost(true); onReady?.(); }, [onReady]);
  const pages = Math.max(1, Math.ceil(props.memories.length / WORLD_BATCH_SIZE)), current = Math.min(page, pages - 1);
  const batch = props.memories.slice(current * WORLD_BATCH_SIZE, (current + 1) * WORLD_BATCH_SIZE);
  const fallback = <div className="world-fallback" role="status"><h2>暂时无法打开三维世界</h2><p>请从右上角「记忆管理」继续阅读和编辑，所有档案仍然保留。</p><button className="button secondary" onClick={() => { setLost(false);setAttempt(value => value + 1); }}>重试场景</button></div>;
  return <div className="planet-world-canvas" aria-label={`${props.planet.name || '未命名星球'} 的生命记忆世界`}>
    <div ref={labels} className="scene-label-layer" aria-hidden="true" />
    {lost ? fallback : <WorldBoundary key={attempt} fallback={fallback} onUnavailable={unavailable}><Canvas shadows={!low} camera={{ position: [8, 6, 19], fov: 56, near: .1, far: 1800 }} dpr={low ? 1 : [1, 1.5]} gl={{ antialias: !low, powerPreference: low ? 'low-power' : 'high-performance' }} fallback={fallback}>
      <WorldContent {...props} memories={batch} low={low} labels={labels} onLost={unavailable} />
    </Canvas></WorldBoundary>}
    {pages > 1 && <nav className="world-batch-control" aria-label="记忆对象分区"><button disabled={current === 0} onClick={() => setPage(current - 1)}>上一组</button><span>{current + 1} / {pages}</span><button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>下一组</button></nav>}
  </div>;
}
