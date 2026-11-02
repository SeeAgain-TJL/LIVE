"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable camera and WebGL canvas. */

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import { ACESFilmicToneMapping, DoubleSide, Matrix4, Mesh, Object3D, Quaternion, Vector3, type InstancedMesh } from "three";

type Tier = "low" | "medium" | "high";
type Placement = { kind: "pine" | "fir" | "rock" | "fern"; source: string; position: number[]; rotation: number[]; scale: number[] };
type Collision = { origin: number[]; step: number; columns: number; rows: number; heights: (number | null)[] };
type Layout = { camera: number[]; target: number[]; trees: Placement[]; details: Placement[]; collision: Collision };
const root = "/forest-lab-assets/";
const conversion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const inverseConversion = conversion.clone().invert();
const sourceToWorld = (point: number[]) => new Vector3(point[0], point[2], -point[1]);

function groundHeight(collision: Collision, x: number, z: number) {
  const fx = (x - collision.origin[0]) / collision.step;
  const fy = (-z - collision.origin[1]) / collision.step;
  const column = Math.max(0, Math.min(collision.columns - 2, Math.floor(fx)));
  const row = Math.max(0, Math.min(collision.rows - 2, Math.floor(fy)));
  const a = Math.max(0, Math.min(1, fx - column));
  const b = Math.max(0, Math.min(1, fy - row));
  const at = (col: number, r: number) => collision.heights[r * collision.columns + col] ?? 0;
  return (1 - b) * ((1 - a) * at(column, row) + a * at(column + 1, row))
    + b * ((1 - a) * at(column, row + 1) + a * at(column + 1, row + 1));
}

function AssetInstances({ file, placements, shadow = false }: { file: string; placements: Placement[]; shadow?: boolean }) {
  const gltf = useGLTF(root + file);
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    return meshes;
  }, [gltf]);
  if (!parts.length) throw new Error(`资源中没有网格：${file}`);
  return <group>{parts.map(part => <InstancePart key={part.uuid} part={part} placements={placements} shadow={shadow} />)}</group>;
}

function InstancePart({ part, placements, shadow }: { part: Mesh; placements: Placement[]; shadow: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => {
    const copy = Array.isArray(part.material) ? part.material.map(item => item.clone()) : part.material.clone();
    const materials = Array.isArray(copy) ? copy : [copy];
    for (const item of materials) if (item.transparent || item.alphaTest > 0) item.side = DoubleSide;
    return copy;
  }, [part]);
  useEffect(() => () => { (Array.isArray(material) ? material : [material]).forEach(item => item.dispose()); }, [material]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new Object3D();
    const matrix = new Matrix4();
    placements.forEach((place, index) => {
      object.position.copy(sourceToWorld(place.position));
      const q = place.rotation;
      object.quaternion.copy(conversion).multiply(new Quaternion(q[1], q[2], q[3], q[0])).multiply(inverseConversion);
      const size = place.kind === "pine" ? place.source.includes("medium") ? 0.7 : place.source.includes("small") ? 0.42 : 1.28
        : place.kind === "fir" ? place.source.includes("medium") ? 0.5 : place.source.includes("small") ? 0.32 : 1 : 1;
      object.scale.set(place.scale[0] * size, place.scale[2] * size, place.scale[1] * size);
      object.updateMatrix();
      matrix.multiplyMatrices(object.matrix, part.matrixWorld);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [part, placements]);
  return <instancedMesh ref={ref} args={[part.geometry, material, placements.length]} castShadow={shadow} receiveShadow={false} frustumCulled />;
}

function ForestGeometry({ layout, tier, sourceAssets = false }: { layout: Layout; tier: Tier; sourceAssets?: boolean }) {
  const terrain = useGLTF(root + "terrain.glb");
  const { camera } = useThree();
  const sourceLastPosition = useRef(sourceToWorld(layout.camera));
  const [sourcePosition, setSourcePosition] = useState(() => sourceToWorld(layout.camera));
  useFrame(() => {
    if (!sourceAssets || camera.position.distanceToSquared(sourceLastPosition.current) < 9) return;
    sourceLastPosition.current.copy(camera.position);
    setSourcePosition(camera.position.clone());
  });
  const groups = useMemo(() => {
    const camera = layout.camera;
    const distance = (entry: Placement) => sourceAssets
      ? sourceToWorld(entry.position).distanceTo(sourcePosition)
      : Math.hypot(entry.position[0] - camera[0], entry.position[1] - camera[1]);
    const trees = [...layout.trees].sort((a, b) => distance(a) - distance(b));
    const highCount = tier === "high" ? 30 : tier === "medium" ? 17 : 5;
    const midCount = tier === "high" ? 210 : tier === "medium" ? 125 : 50;
    const treeGroups: Record<string, Placement[]> = {};
    for (const [index, entry] of trees.entries()) {
      if (sourceAssets) {
        const limit = tier === "high" ? 60 : tier === "medium" ? 30 : 20;
        const near = tier === "high" ? 4 : tier === "medium" ? 2 : 1;
        if (index >= limit || distance(entry) > (tier === "high" ? 90 : tier === "medium" ? 70 : 50)) continue;
        const file = `${entry.kind === "pine" ? "pine_02" : "silver_fir_01"}_lod${index < near ? "10" : "01"}_webp`;
        (treeGroups[file] ??= []).push(entry);
      } else {
        const lod = index < highCount ? "high" : index < highCount + midCount ? "mid" : "proxy";
        (treeGroups[`${entry.kind}-${lod}`] ??= []).push(entry);
      }
    }
    const details = [...layout.details].sort((a, b) => distance(a) - distance(b));
    const detailGroups: Record<string, Placement[]> = { rock: [], fern: [] };
    const limits = tier === "high" ? { rock: 65, fern: 300 } : tier === "medium" ? { rock: 38, fern: 175 } : { rock: 18, fern: 65 };
    for (const entry of details) if (detailGroups[entry.kind].length < limits[entry.kind as "rock" | "fern"]) detailGroups[entry.kind].push(entry);
    return { treeGroups, detailGroups };
  }, [layout, tier, sourceAssets, sourcePosition]);
  return <>
    <primitive object={terrain.scene} />
    {Object.entries(groups.treeGroups).map(([file, placements]) => <AssetInstances key={file} file={`${file}.glb`} placements={placements} shadow={!sourceAssets && file.endsWith("high") && tier !== "low"} />)}
    {Object.entries(groups.detailGroups).map(([file, placements]) => <AssetInstances key={file} file={`${file}.glb`} placements={placements} />)}
  </>;
}

function ForestCamera({ layout, keys, onReady }: { layout: Layout; keys: React.RefObject<Set<string>>; onReady: () => void }) {
  const { camera, gl } = useThree();
  const moving = useRef(false);
  const position = useRef(new Vector3());
  const lastReport = useRef(0);
  const frames = useRef<number[]>([]);
  const ready = useRef(false);
  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.position.copy(sourceToWorld(layout.camera));
    camera.lookAt(sourceToWorld(layout.target));
    camera.rotation.order = "YXZ";
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "松林三维实验场景，拖动观察，WASD 或方向键移动");
    const down = (event: PointerEvent) => { if (event.button === 0 || event.pointerType === "touch") { moving.current = true; canvas.setPointerCapture(event.pointerId); canvas.focus(); } };
    const move = (event: PointerEvent) => {
      if (!moving.current) return;
      camera.rotation.y -= event.movementX * 0.0025;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - event.movementY * 0.0025));
    };
    const up = () => { moving.current = false; };
    const keydown = (event: KeyboardEvent) => { if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/i.test(event.key)) { keys.current.add(event.key.toLowerCase()); event.preventDefault(); } };
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", up);
    return () => {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", up);
    };
  }, [camera, gl, layout, keys]);
  useFrame((_, delta) => {
    const canvas = gl.domElement;
    if (!ready.current) { ready.current = true; canvas.dataset.forestReady = "true"; onReady(); }
    const pressed = keys.current;
    let forward = Number(pressed.has("w") || pressed.has("arrowup")) - Number(pressed.has("s") || pressed.has("arrowdown"));
    let sideways = Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
    if (forward || sideways) {
      const length = Math.hypot(forward, sideways);
      forward /= length; sideways /= length;
      const angle = camera.rotation.y;
      const speed = Math.min(delta, 0.05) * 4.2;
      const nextX = camera.position.x + (Math.sin(-angle) * forward + Math.cos(angle) * sideways) * speed;
      const nextZ = camera.position.z + (Math.cos(angle) * -forward + Math.sin(angle) * sideways) * speed;
      if (nextX > -73 && nextX < 48 && nextZ > -19 && nextZ < 97) {
        const blocked = layout.trees.some(tree => Math.abs(tree.position[0] - nextX) < 0.7 && Math.abs(-tree.position[1] - nextZ) < 0.7);
        if (!blocked) camera.position.set(nextX, groundHeight(layout.collision, nextX, nextZ) + 1.15, nextZ);
      }
    }
    const now = performance.now();
    frames.current.push(delta * 1000);
    if (frames.current.length > 120) frames.current.shift();
    if (now - lastReport.current > 1000) {
      const sorted = [...frames.current].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      position.current.copy(camera.position);
      canvas.dataset.forestMetrics = JSON.stringify({ fps: median ? 1000 / median : 0, medianMs: median, p95Ms: p95,
        triangles: gl.info.render.triangles, calls: gl.info.render.calls, textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries, camera: position.current.toArray() });
      lastReport.current = now;
    }
  });
  return null;
}

function Scene({ layout, tier, keys, onReady, sourceAssets = false }: { layout: Layout; tier: Tier; keys: React.RefObject<Set<string>>; onReady: () => void; sourceAssets?: boolean }) {
  return <>
    <fog attach="fog" args={["#adb2a5", tier === "low" ? 0.017 : 0.013]} />
    <Environment files={root + "sky.hdr"} background environmentIntensity={0.75} />
    <ambientLight intensity={0.65} />
    <directionalLight position={[-30, 45, 12]} intensity={2.1} castShadow={tier !== "low"} shadow-mapSize={[tier === "high" ? 2048 : 1024, tier === "high" ? 2048 : 1024]} shadow-camera-left={-55} shadow-camera-right={55} shadow-camera-top={55} shadow-camera-bottom={-55} />
    <ForestGeometry layout={layout} tier={tier} sourceAssets={sourceAssets} />
    <ForestCamera layout={layout} keys={keys} onReady={onReady} />
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode; onError: (error: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function ForestLab({ sourceAssets = false }: { sourceAssets?: boolean }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [tier, setTier] = useState<Tier>("medium");
  const [status, setStatus] = useState("正在读取森林布局与模型资源");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    fetch(root + "placements.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`布局资源 HTTP ${response.status}`); return response.json(); })
      .then((data: Layout) => { setLayout(data); setStatus("正在加载地形、植被与天空"); })
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  }, [attempt]);
  return <main className="forest-lab" aria-label="松林环境实验">
    {layout && !error && <SceneBoundary key={attempt} onError={setError}>
      <Canvas key={tier} shadows={tier !== "low"} camera={{ position: [23.155, 0.922, 47.56], fov: 48.5, near: 0.08, far: 280 }} dpr={1} gl={{ antialias: tier !== "low", powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}>
        <Suspense fallback={null}><Scene layout={layout} tier={tier} keys={keys} onReady={() => setStatus("")} sourceAssets={sourceAssets} /></Suspense>
      </Canvas>
    </SceneBoundary>}
    <div className="forest-lab-bar">
      <div><strong>{sourceAssets ? "Pine Forest 源资产转换验证" : "松林环境实验"}</strong><span>{sourceAssets ? "局部转换，未通过完整场景验收" : "独立场景 · 非正式星球"}</span></div>
      <div className="forest-lab-quality" role="group" aria-label="渲染质量">
        {(["low", "medium", "high"] as const).map(value => <button key={value} type="button" aria-pressed={tier === value} onClick={() => { setTier(value); setStatus("正在切换画质"); }} title={`${value === "low" ? "低" : value === "medium" ? "中" : "高"}画质`}>{value === "low" ? "低" : value === "medium" ? "中" : "高"}</button>)}
      </div>
    </div>
    {(status || error) && <div className="forest-lab-status" role={error ? "alert" : "status"}>
      <span>{error || status}</span>
      {error && <button type="button" title="重试加载" aria-label="重试加载" onClick={() => { setError(""); setLayout(null); setStatus("正在重试加载"); setAttempt(value => value + 1); }}><RotateCcw size={18} /></button>}
    </div>}
    <div className="forest-lab-move" role="group" aria-label="移动">
      {([["arrowup", ArrowUp, "前进"], ["arrowleft", ArrowLeft, "左移"], ["arrowdown", ArrowDown, "后退"], ["arrowright", ArrowRight, "右移"]] as const).map(([key, Icon, label]) =>
        <button key={key} type="button" title={label} aria-label={label} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); keys.current.add(key); }} onPointerUp={() => keys.current.delete(key)} onPointerCancel={() => keys.current.delete(key)}><Icon size={19} /></button>)}
    </div>
  </main>;
}
