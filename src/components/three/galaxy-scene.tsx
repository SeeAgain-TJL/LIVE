"use client";

import { Component, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, Color, Vector3, type Group } from "three";
import type { Galaxy } from "@/domain/types";
import { galaxyPosition } from "@/domain/galaxy";
import { StarField } from "./star-field";
import { useLowPowerDevice, useReducedMotion } from "./use-render-preferences";

export interface GalaxyFlight { id: string; nonce: number }
interface GalaxySceneProps { galaxies: Galaxy[]; counts: Record<string, number>; flight: GalaxyFlight | null; onEnter: (id: string) => void; onArrival: (id: string) => void }

function GalaxyCamera({ galaxies, flight, onArrival, reduced }: Pick<GalaxySceneProps, "galaxies" | "flight" | "onArrival"> & { reduced: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const handled = useRef<number | null>(null);
  const animation = useRef<{ start: Vector3; targetStart: Vector3; target: Vector3; to: Vector3; progress: number; id: string } | null>(null);
  useEffect(() => {
    if (!controls.current) return;
    const radius = Math.max(10, ...galaxies.map((_, i) => Math.hypot(...galaxyPosition(i)) + 6));
    const distance = radius / Math.sin(Math.atan(Math.tan(43 * Math.PI / 360) * Math.min(1, size.width / size.height)));
    camera.position.set(0, distance * 0.15, distance);
    controls.current.target.set(0, 0, 0); controls.current.update();
  }, [camera, galaxies, size.width, size.height]);
  useEffect(() => {
    const index = galaxies.findIndex(g => g.id === flight?.id);
    if (!flight || index < 0 || !controls.current || handled.current === flight.nonce) return;
    handled.current = flight.nonce;
    const target = new Vector3(...galaxyPosition(index));
    animation.current = { start: camera.position.clone(), targetStart: controls.current.target.clone(), target, to: target.clone().add(new Vector3(0, 3, 15)), progress: 0, id: flight.id };
    controls.current.enabled = false; controls.current.enableDamping = false;
  }, [camera, galaxies, flight]);
  useFrame((_, dt) => {
    const a = animation.current;
    if (!a || !controls.current) return;
    a.progress = reduced ? 1 : Math.min(1, a.progress + dt / 1.1);
    const t = a.progress * a.progress * (3 - 2 * a.progress);
    camera.position.lerpVectors(a.start, a.to, t); controls.current.target.lerpVectors(a.targetStart, a.target, t); controls.current.update();
    if (a.progress === 1) { animation.current = null; controls.current.enabled = true; controls.current.enableDamping = !reduced; onArrival(a.id); }
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reduced} minDistance={12} maxDistance={400} rotateSpeed={0.4} />;
}

function GalaxyCluster({ galaxy, index, count, low, reduced, labels, enter }: { galaxy: Galaxy; index: number; count: number; low: boolean; reduced: boolean; labels: React.RefObject<HTMLDivElement>; enter: () => void }) {
  const group = useRef<Group>(null);
  const particles = useMemo(() => {
    const size = low ? 160 : 420;
    const positions = new Float32Array(size * 3);
    const colors = new Float32Array(size * 3);
    const color = new Color(galaxy.color);
    for (let i = 0; i < size; i++) {
      const radius = 0.4 + Math.sqrt((i + 0.5) / size) * 4;
      const angle = i * 2.399963 + radius * 1.1;
      positions.set([Math.cos(angle) * radius, Math.sin(i * 13.17) * 0.35, Math.sin(angle) * radius * 0.7], i * 3);
      colors.set([color.r * (0.55 + (i % 5) * 0.1), color.g, color.b], i * 3);
    }
    return { positions, colors };
  }, [galaxy.color, low]);
  useFrame((_, dt) => { if (group.current && !reduced) group.current.rotation.y += dt * 0.025; });
  return <group position={galaxyPosition(index)}>
    <group ref={group} rotation={[0.25, 0, -0.18]}>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[particles.positions, 3]} /><bufferAttribute attach="attributes-color" args={[particles.colors, 3]} /></bufferGeometry><pointsMaterial size={low ? 0.13 : 0.1} vertexColors transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} /></points>
      <mesh onClick={e => { e.stopPropagation(); enter(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}><sphereGeometry args={[4.5, 20, 14]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      <mesh raycast={() => null}><sphereGeometry args={[0.75, 20, 14]} /><meshBasicMaterial color={galaxy.color} transparent opacity={0.75} blending={AdditiveBlending} /></mesh>
    </group>
    <Html portal={labels} center position={[0, -3.3, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div className="galaxy-scene-label"><strong>{galaxy.name}</strong><span>{count} 颗星球</span></div></Html>
  </group>;
}

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
  const low = useLowPowerDevice();
  const reduced = useReducedMotion();
  const [lost, setLost] = useState(false);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const fallback = <div className="galaxy-render-fallback"><p>3D 星系暂不可用，仍可通过星系列表直接进入。</p></div>;
  return <div className="scene-renderer"><div className="scene-label-layer" ref={labels} aria-hidden="true" />{lost ? fallback : <Boundary fallback={fallback}><Canvas camera={{ position: [0, 10, 65], fov: 43 }} dpr={low ? 1 : [1, 1.5]} gl={{ antialias: !low, powerPreference: low ? "low-power" : "high-performance" }} fallback={fallback}>
    <StarField low={low} />{props.galaxies.map((galaxy, index) => <GalaxyCluster key={galaxy.id} galaxy={galaxy} index={index} count={props.counts[galaxy.id] ?? 0} low={low} reduced={reduced} labels={labels} enter={() => props.onEnter(galaxy.id)} />)}
    <GalaxyCamera galaxies={props.galaxies} flight={props.flight} onArrival={props.onArrival} reduced={reduced} /><ContextMonitor lost={() => setLost(true)} />
  </Canvas></Boundary>}</div>;
}
