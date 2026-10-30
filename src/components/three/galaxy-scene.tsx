"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { Galaxy, Quality } from "@/domain/types";
import { COSMIC_BUDGETS, renderTier } from "@/domain/cosmic-visuals";
import { CosmicEnvironment } from "./cosmic-environment";
import { GalaxyCluster } from "./galaxy-cluster";
import { GalaxyCamera, type GalaxyFlight } from "./galaxy-camera";
import { SceneMetrics } from "./scene-metrics";
import { useSceneTap } from "./use-scene-tap";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";
export type { GalaxyFlight } from "./galaxy-camera";
interface GalaxySceneProps { galaxies: Galaxy[]; counts: Record<string, number>; flight: GalaxyFlight | null; quality: Quality; onEnter: (id: string) => void; onArrival: (id: string) => void; onRestored: () => void }

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function ContextMonitor({ lost }: { lost: () => void }) {
  const { gl } = useThree();
  useEffect(() => { const canvas = gl.domElement; const onLost = (event: Event) => { event.preventDefault(); lost(); }; canvas.addEventListener("webglcontextlost", onLost); return () => canvas.removeEventListener("webglcontextlost", onLost); }, [gl, lost]);
  return null;
}

export default function GalaxyScene(props: GalaxySceneProps) {
  const labels = useRef<HTMLDivElement>(null!);
  const deviceLow = useLowPowerDevice();
  const tier = renderTier(props.quality, deviceLow), low = tier === "low";
  const reduced = useReducedMotion();
  const [lost, setLost] = useState(false);
  const tapHandlers = useSceneTap(!!props.flight);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const fallback = <div className="galaxy-render-fallback"><p>3D 星系暂不可用，仍可通过星系列表直接进入。</p></div>;
  return <div className="scene-renderer" {...tapHandlers}><div className="scene-label-layer" ref={labels} aria-hidden="true" />{lost ? fallback : <Boundary fallback={fallback}><Canvas camera={{ position: [0, 10, 65], fov: 43, near: 0.1, far: 2500 }} dpr={[1, COSMIC_BUDGETS[tier].dpr]} gl={{ antialias: !low, powerPreference: low ? "low-power" : "high-performance" }} fallback={fallback}>
    <CosmicEnvironment tier={tier} /><SceneMetrics tier={tier} />{props.galaxies.map((galaxy, index) => <GalaxyCluster key={galaxy.id} galaxy={galaxy} index={index} count={props.counts[galaxy.id] ?? 0} tier={tier} reduced={reduced} labels={labels} enter={() => props.onEnter(galaxy.id)} />)}
    <GalaxyCamera galaxies={props.galaxies} flight={props.flight} onArrival={props.onArrival} onRestored={props.onRestored} reduced={reduced} /><ContextMonitor lost={() => setLost(true)} />
  </Canvas></Boundary>}</div>;
}
