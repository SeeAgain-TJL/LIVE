"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";

import type { Planet, Quality } from "@/domain/types";
import { CameraRig, type FlightRequest } from "./camera-rig";
import { PlanetMesh } from "./planet-mesh";
import { CosmicEnvironment } from "./cosmic-environment";
import { stellarSource } from "@/domain/spatial-scene";
import { StellarNeighborhood } from "./stellar-neighborhood";
import { SceneMetrics } from "./scene-metrics";
import { COSMIC_BUDGETS, renderTier } from "@/domain/cosmic-visuals";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";
import { isPlanetTap } from "@/domain/planet-flight";
import { periodLabel, planetName } from "@/domain/planet";

interface SceneProps {
  planets: Planet[]; selectedId: string | null; flight: FlightRequest | null;
  onEnter: (id: string) => void; onArrival: (id: string) => void; onApproach: (id: string) => void; onReturned: () => void;
  quality: Quality; showOrbits?: boolean; newPlanetId?: string | null;
  bookmarkKey?: string; galaxyId: string; returnPlanetId?: string | null; locked: boolean; onUnavailable: () => void;
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

function SceneUnavailable({ onUnavailable }: { onUnavailable?: () => void }) {
  useEffect(() => { onUnavailable?.(); }, [onUnavailable]);
  return <div className="scene-fallback"><span>3D 信号暂不可用</span><p>请从左侧列表查看星球资料，再用「直接打开档案」继续访问记忆。</p><button className="button secondary" onClick={() => location.reload()}>重新载入</button></div>;
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function UniverseScene(props: SceneProps) {
  // Html's portal type predates nullable React 19 refs; this element mounts before Canvas children.
  const labels = useRef<HTMLDivElement>(null!);
  const deviceLow = useLowPowerDevice();
  const source = useMemo(() => stellarSource(props.planets), [props.planets]);
  const reducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const gesture = useRef({ x: 0, y: 0, distance: 0, pointers: 0, started: 0, tap: false });
  const pointers = useRef(new Set<number>());
  useEffect(() => {
    const release = (e: PointerEvent) => { pointers.current.delete(e.pointerId); };
    const reset = () => { pointers.current.clear(); gesture.current.tap = false; };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", reset); };
  }, []);
  const hovered = props.planets.find(p => p.id === hoveredId);
  const tier = renderTier(props.quality, deviceLow), low = tier === "low";
  const fallback = <SceneUnavailable onUnavailable={props.onUnavailable} />;
  if (contextLost) return fallback;
  return <div className="scene-renderer" onPointerDownCapture={e => {
    pointers.current.add(e.pointerId);
    if (pointers.current.size === 1) gesture.current = { x: e.clientX, y: e.clientY, distance: 0, pointers: 1, started: performance.now(), tap: false };
    else gesture.current.pointers = Math.max(gesture.current.pointers, pointers.current.size);
  }} onPointerMoveCapture={e => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current; g.distance += Math.hypot(e.clientX - g.x, e.clientY - g.y); g.x = e.clientX; g.y = e.clientY;
  }} onPointerUpCapture={e => {
    pointers.current.delete(e.pointerId); const g = gesture.current;
    g.distance += Math.hypot(e.clientX - g.x, e.clientY - g.y);
    g.tap = isPlanetTap(g.distance, g.pointers, performance.now() - g.started);
  }} onPointerCancelCapture={e => { pointers.current.delete(e.pointerId); gesture.current.tap = false; }} onClickCapture={e => {
    if (e.target instanceof HTMLCanvasElement && (!gesture.current.tap || props.locked)) { e.preventDefault(); e.stopPropagation(); }
  }}><div ref={labels} className="scene-label-layer" aria-hidden="true" />{hovered && !props.locked && <div className="planet-hover-summary" role="status"><strong>{planetName(hovered)}</strong><span>{periodLabel(hovered)} · 单击进入</span></div>}<SceneBoundary fallback={fallback}><Canvas camera={{ position: [0, 7, 30], fov: 43, near: 0.1, far: 30000 }} dpr={[1, COSMIC_BUDGETS[tier].dpr]} gl={{ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" }} fallback={<SceneUnavailable />} onPointerMissed={() => { document.body.style.cursor = "auto"; }}>
    <StellarNeighborhood planets={props.planets} tier={tier} source={source} showOrbits={props.showOrbits !== false} />
    <SceneMetrics tier={tier} />
    <Suspense fallback={null}>
      <CosmicEnvironment tier={tier} identity={props.galaxyId} />
      {props.planets.map((planet, index) => <group key={planet.id}>
        <PlanetMesh appearance={planet.appearance} position={planet.position} lightPosition={source.position} low={low} reducedMotion={reducedMotion} selected={props.selectedId === planet.id} born={props.newPlanetId === planet.id}
          onSelect={e => { e.stopPropagation(); if (!props.locked && gesture.current.tap && e.delta <= 7) props.onEnter(planet.id); }} onHover={value => setHoveredId(value ? planet.id : null)} />
        <Html portal={labels} position={[planet.position[0], planet.position[1] - planet.appearance.size * 1.65, planet.position[2]]} center distanceFactor={30} zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className={`planet-label ${props.selectedId === planet.id ? "selected" : ""}`}><i /><span>{planet.name || `未命名 · ${String(index + 1).padStart(2, "0")}`}</span>{planet.isDemo && <small>示例星球</small>}</div>
        </Html>
      </group>)}
      <CameraRig source={source} planets={props.planets} flight={props.flight} onArrival={props.onArrival} onApproach={props.onApproach} onReturned={props.onReturned} reducedMotion={reducedMotion} bookmarkKey={props.bookmarkKey} galaxyId={props.galaxyId} returnPlanetId={props.returnPlanetId} />
      <ContextMonitor onLost={() => setContextLost(true)} />
    </Suspense>
  </Canvas></SceneBoundary></div>;
}

export function PlanetPreview({ appearance }: { appearance: Planet["appearance"] }) {
  const reducedMotion = useReducedMotion();
  return <SceneBoundary fallback={<div className="preview-fallback">3D 预览不可用，仍可保存外观设置。</div>}><Canvas camera={{ position: [0, 1, 9], fov: 38 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} fallback={<div className="preview-fallback">当前设备不支持 3D 预览</div>}>
    <ambientLight intensity={0.2} color="#8d9db4" /><directionalLight position={[-6, 5, 6]} intensity={3} color="#fff1dd" />
    <PlanetMesh appearance={{ ...appearance, size: appearance.size * 0.7 }} low reducedMotion={reducedMotion} />
    <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} />
  </Canvas></SceneBoundary>;
}
