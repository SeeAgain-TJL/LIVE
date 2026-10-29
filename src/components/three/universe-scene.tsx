"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";

import type { Planet, Quality } from "@/domain/types";
import { CameraRig, type FlightRequest } from "./camera-rig";
import { PlanetMesh } from "./planet-mesh";
import { StarField } from "./star-field";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";

interface SceneProps {
  planets: Planet[]; selectedId: string | null; flight: FlightRequest | null;
  onSelect: (id: string) => void; onFly: (id: string) => void; onArrival: (id: string) => void;
  quality: Quality; newPlanetId?: string | null;
  bookmarkKey?: string;
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

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function UniverseScene(props: SceneProps) {
  // Html's portal type predates nullable React 19 refs; this element mounts before Canvas children.
  const labels = useRef<HTMLDivElement>(null!);
  const deviceLow = useLowPowerDevice();
  const reducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);
  const low = props.quality === "low" || (props.quality === "auto" && deviceLow);
  const fallback = <div className="scene-fallback"><span>3D 信号暂不可用</span><p>请使用支持 WebGL 的浏览器，或从左侧列表访问星球档案。</p><button className="button secondary" onClick={() => location.reload()}>重新载入</button></div>;
  if (contextLost) return fallback;
  return <div className="scene-renderer"><div ref={labels} className="scene-label-layer" aria-hidden="true" /><SceneBoundary fallback={fallback}><Canvas camera={{ position: [0, 7, 30], fov: 43, near: 0.1, far: 30000 }} dpr={low ? 1 : [1, 1.75]} gl={{ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" }} fallback={fallback} onPointerMissed={() => { document.body.style.cursor = "auto"; }}>
    <ambientLight intensity={0.17} color="#8199bd" />
    <directionalLight position={[-12, 10, 12]} intensity={3.1} color="#fff0d7" />
    <directionalLight position={[12, -5, -10]} intensity={0.35} color="#486b9a" />
    <Suspense fallback={null}>
      <StarField low={low} />
      {props.planets.map((planet, index) => <group key={planet.id}>
        <PlanetMesh appearance={planet.appearance} position={planet.position} low={low} reducedMotion={reducedMotion} selected={props.selectedId === planet.id} born={props.newPlanetId === planet.id}
          onSelect={e => { e.stopPropagation(); props.onSelect(planet.id); }} onFly={e => { e.stopPropagation(); props.onFly(planet.id); }} />
        <Html portal={labels} position={[planet.position[0], planet.position[1] - planet.appearance.size * 1.65, planet.position[2]]} center distanceFactor={30} zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className={`planet-label ${props.selectedId === planet.id ? "selected" : ""}`}><i /><span>{planet.name || `未命名 · ${String(index + 1).padStart(2, "0")}`}</span>{planet.isDemo && <small>示例星球</small>}</div>
        </Html>
      </group>)}
      <CameraRig planets={props.planets} flight={props.flight} onArrival={props.onArrival} reducedMotion={reducedMotion} bookmarkKey={props.bookmarkKey} />
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
