"use client";

/* eslint-disable react-hooks/immutability -- R3F owns camera, matrices and WebGL diagnostics. */

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, DoubleSide, Frustum, InstancedMesh, Matrix4, Mesh, Sphere, Vector3 } from "three";

type Instance = { source: string; matrix: number[][] };
type SourceInventory = { sourceSha256: string; treeSpeciesCounts: Record<string, number>; sourceAssetNames: string[] };
type Preview = { assetNames: string[]; records: [number, number[][]][] };
export type Collision = { origin: number[]; step: number; columns: number; rows: number; heights: (number | null)[]; blocked?: number[] };
type LabBudget = { trees: number; props: number; radius: number };
const root = "/forest-origin-assets/";
const cameraSource = new Vector3(23.155473709106445, -47.55979919433594, 0.9223032593727112);
const cameraTarget = new Vector3(-25.951723098754883, -40.576786041259766, 7.224738121032715);
const axis = new Matrix4().makeRotationX(-Math.PI / 2);
const axisInverse = axis.clone().invert();

class RenderBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <RenderFailure message={this.state.error} /> : this.props.children; }
}

export function RenderFailure({ message }: { message: string }) {
  return <div className="forest-lab-status" role="alert">{message}
    <button type="button" onClick={() => window.location.reload()}>重新加载场景</button>
  </div>;
}

export function RenderHealth() {
  const { gl } = useThree();
  const [error, setError] = useState("");
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = () => {
      canvas.dataset.forestRenderError = "context-lost";
      delete canvas.dataset.forestOriginReady;
      setError("WebGL 上下文已丢失，场景渲染中断。请重新加载场景。");
    };
    canvas.addEventListener("webglcontextlost", lost);
    const previous = gl.debug.onShaderError;
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      // Preserve validation and complete driver logs, including the context state.
      console.error("Pine Forest shader link failure", {
        linked: context.getProgramParameter(program, context.LINK_STATUS),
        programLog: context.getProgramInfoLog(program), contextLost: context.isContextLost(),
        shaders: [vertex, fragment].map(shader => ({ compiled: context.getShaderParameter(shader, context.COMPILE_STATUS),
          log: context.getShaderInfoLog(shader), source: context.getShaderSource(shader) })),
      });
      delete canvas.dataset.forestOriginReady;
      canvas.dataset.forestRenderError = "shader-link";
      setError("材质程序链接失败，场景渲染中断。完整诊断已记录，请重新加载场景。");
    };
    return () => { canvas.removeEventListener("webglcontextlost", lost); gl.debug.onShaderError = previous; };
  }, [gl]);
  // DOM status is rendered by the owner, outside the Three.js reconciler.
  useEffect(() => {
    gl.domElement.dispatchEvent(new CustomEvent("pine-render-error", { detail: error, bubbles: true }));
  }, [error, gl]);
  return null;
}

export function ForestSurface({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const report = (event: Event) => setError((event as CustomEvent<string>).detail);
    element?.addEventListener("pine-render-error", report);
    return () => element?.removeEventListener("pine-render-error", report);
  }, []);
  return <div ref={ref} style={{ position: "absolute", inset: 0 }}><RenderBoundary>{children}</RenderBoundary>
    {error && <RenderFailure message={error} />}
  </div>;
}

function sourceToWorld(point: Vector3) { return new Vector3(point.x, point.z, -point.y); }
function worldMatrix(rows: number[][]) {
  const matrix = new Matrix4().fromArray(rows.flat()).transpose();
  return axis.clone().multiply(matrix).multiply(axisInverse);
}
function groundHeight(collision: Collision, x: number, z: number) {
  const fx = (x - collision.origin[0]) / collision.step;
  const fy = (-z - collision.origin[1]) / collision.step;
  const column = Math.max(0, Math.min(collision.columns - 2, Math.floor(fx)));
  const row = Math.max(0, Math.min(collision.rows - 2, Math.floor(fy)));
  const a = Math.max(0, Math.min(1, fx - column));
  const b = Math.max(0, Math.min(1, fy - row));
  const at = (col: number, r: number) => collision.heights[r * collision.columns + col] ?? 0;
  return (1 - b) * ((1 - a) * at(column, row) + a * at(column + 1, row)) +
    b * ((1 - a) * at(column, row + 1) + a * at(column + 1, row + 1));
}

function walkable(collision: Collision, x: number, z: number) {
  if (!collision.blocked) return x > -70 && x < 70 && z > -100 && z < 95;
  const fx = (x-collision.origin[0])/collision.step;
  const fy = (-z-collision.origin[1])/collision.step;
  const col = Math.floor(fx), row = Math.floor(fy);
  if (col < 0 || row < 0 || col+1 >= collision.columns || row+1 >= collision.rows) return false;
  const index = row*collision.columns+col;
  const ids = [index,index+1,index+collision.columns,index+collision.columns+1];
  return ids.every(i=>collision.heights[i] != null && !collision.blocked![i]);
}

function Instances({ part, matrices, diagnostic = false, alpha, category }: { part: Mesh; matrices: number[][][]; diagnostic?: boolean; alpha?: string; category: string }) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => {
    const copy = Array.isArray(part.material) ? part.material.map(value => value.clone()) : part.material.clone();
    for (const value of Array.isArray(copy) ? copy : [copy]) if (value.transparent || value.alphaTest > 0) {
      value.side = DoubleSide;
      if (alpha === "single") value.forceSinglePass = true;
      if (alpha === "mask") { value.transparent = false; value.alphaTest = 0.08; }
    }
    return copy;
  }, [part, alpha]);
  useEffect(() => () => { for (const value of Array.isArray(material) ? material : [material]) value.dispose(); }, [material]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new Matrix4();
    matrices.forEach((rows, index) => {
      matrix.multiplyMatrices(worldMatrix(rows), part.matrixWorld);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [part, matrices]);
  return <instancedMesh ref={ref} args={[part.geometry, material, matrices.length]} frustumCulled={!diagnostic} userData={{ category }} />;
}

function SourceAsset({ file, matrices, name, diagnostic, alpha }: { file: string; matrices: number[][][]; name?: string; diagnostic?: boolean; alpha?: string }) {
  const gltf = useGLTF(root + file);
  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const parent = name ? gltf.scene.getObjectByName("source__" + name) : gltf.scene;
    if (!parent) throw new Error("Missing source asset " + name);
    const found: Mesh[] = [];
    parent.traverse(object => { if (object instanceof Mesh) found.push(object); });
    return found;
  }, [gltf, name]);
  return <group>{meshes.map(mesh => <Instances key={mesh.uuid} part={mesh} matrices={matrices} diagnostic={diagnostic} alpha={alpha} category={name ? `props/${name}` : file} />)}</group>;
}

// Optional baseline audit runs once, outside the timed steady-state sample.
function SubmissionAudit() {
  const { scene, camera, gl } = useThree();
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("audit")) return;
    const timer = window.setTimeout(() => {
      camera.updateMatrixWorld();
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const rows: Record<string, { instances: number; outside: number; submitted: number; outsideTriangles: number }> = {};
      scene.traverse(object => {
        if (!(object instanceof InstancedMesh) || !frustum.intersectsObject(object)) return;
        const category = object.userData.category as string;
        const row = rows[category] ??= { instances: 0, outside: 0, submitted: 0, outsideTriangles: 0 };
        object.geometry.computeBoundingSphere();
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        const triangles = (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 *
          (material.transparent && material.side === DoubleSide && !material.forceSinglePass ? 2 : 1);
        const matrix = new Matrix4();
        const sphere = new Sphere();
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          sphere.copy(object.geometry.boundingSphere!).applyMatrix4(matrix).applyMatrix4(object.matrixWorld);
          row.instances++; row.submitted += triangles;
          if (!frustum.intersectsSphere(sphere)) { row.outside++; row.outsideTriangles += triangles; }
        }
      });
      gl.domElement.dataset.forestSubmissionAudit = JSON.stringify(rows);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [scene, camera, gl]);
  return null;
}

export function Walker({ collision, onPosition, trunks = [], sliding = false, onInteract, paused = false }: { collision: Collision; onPosition?: (point: Vector3) => void; trunks?: number[][][]; sliding?: boolean; onInteract?: () => void; paused?: boolean }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const lastPositionReport = useRef(0);
  const input = useRef({ onPosition, onInteract, paused });
  useLayoutEffect(() => {
    input.current = { onPosition, onInteract, paused };
    if (paused) { keys.current.clear(); dragging.current = false; }
  }, [onPosition, onInteract, paused]);
  useEffect(() => {
    camera.position.copy(sourceToWorld(cameraSource));
    camera.lookAt(sourceToWorld(cameraTarget));
    camera.rotation.reorder("YXZ");
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Pine Forest 原资产隔离场景，拖动观察，WASD 行走");
    const down = (event: PointerEvent) => { if (input.current.paused || event.button > 0) return; dragging.current = true; canvas.setPointerCapture(event.pointerId); canvas.focus(); };
    const move = (event: PointerEvent) => {
      if (!dragging.current || input.current.paused) return;
      camera.rotation.y -= event.movementX * 0.0025;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - event.movementY * 0.0025));
    };
    const up = () => { dragging.current = false; };
    const blur = () => { dragging.current = false; keys.current.clear(); };
    const keydown = (event: KeyboardEvent) => {
      if (input.current.paused) return;
      if (event.key.toLowerCase() === "e" && input.current.onInteract) { event.preventDefault(); if (!event.repeat) input.current.onInteract(); return; }
      if (/^[wasd]$/i.test(event.key)) { event.preventDefault(); keys.current.add(event.key.toLowerCase()); }
    };
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("blur", blur); window.addEventListener("blur", blur);
    canvas.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("blur", blur); window.removeEventListener("blur", blur);
      canvas.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); };
  }, [camera, gl]);
  useFrame((_, delta) => {
    if (paused) keys.current.clear();
    const forward = Number(keys.current.has("w")) - Number(keys.current.has("s"));
    const sideways = Number(keys.current.has("d")) - Number(keys.current.has("a"));
    if (!paused && (forward || sideways)) {
      const angle = camera.rotation.y;
      const speed = Math.min(delta, 0.05) * 3.5 / Math.hypot(forward, sideways);
      const x = camera.position.x + (Math.sin(-angle) * forward + Math.cos(angle) * sideways) * speed;
      const z = camera.position.z + (-Math.cos(angle) * forward + Math.sin(angle) * sideways) * speed;
      const clear=(px:number,pz:number)=>walkable(collision,px,pz) &&
          (!collision.blocked || Math.abs(groundHeight(collision,px,pz)-groundHeight(collision,camera.position.x,camera.position.z)) < 0.55) &&
          !trunks.some(matrix => Math.hypot(matrix[0][3] - px, -matrix[1][3] - pz) < 0.8);
      if (clear(x,z)) {
        camera.position.set(x, groundHeight(collision, x, z) + 1.2, z);
      } else if(sliding) {
        // Preserve trunk/boundary collision while allowing motion along it.
        if(clear(x,camera.position.z)) camera.position.set(x,groundHeight(collision,x,camera.position.z)+1.2,camera.position.z);
        if(clear(camera.position.x,z)) camera.position.set(camera.position.x,groundHeight(collision,camera.position.x,z)+1.2,z);
      }
    }
    if (onPosition && performance.now() - lastPositionReport.current > 350) {
      const position = camera.position.clone();
      gl.domElement.dataset.forestWalkerPosition = JSON.stringify({ position: position.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray() });
      onPosition(position);
      lastPositionReport.current = performance.now();
    }
    samples.current.push(delta * 1000);
    if (samples.current.length > 120) samples.current.shift();
    if (performance.now() - last.current > 1000) {
      if (gl.domElement.dataset.forestRenderError || gl.getContext().isContextLost() || gl.info.render.calls === 0 ||
          (gl.domElement.dataset.forestStreamingRuntime && !gl.domElement.dataset.forestGeometryReady)) {
        delete gl.domElement.dataset.forestOriginReady;
        return;
      }
      const sorted = [...samples.current].sort((a, b) => a - b);
      const medianMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
      gl.domElement.dataset.forestOriginReady = "true";
      gl.domElement.dataset.forestOriginMetrics = JSON.stringify({ fps: medianMs ? 1000 / medianMs : 0, medianMs,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, triangles: gl.info.render.triangles,
        calls: gl.info.render.calls, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
        camera: camera.position.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray(),
        contextLost: gl.getContext().isContextLost() });
      last.current = performance.now();
    }
  });
  return null;
}

function Scene({ trees, props, collision, onPosition, sourceTextures = false, diagnostic = false, alpha }: { trees: Record<string, number[][][]>; props: Record<string, number[][][]>;
  collision: Collision; onPosition?: (point: Vector3) => void; sourceTextures?: boolean; diagnostic?: boolean; alpha?: string }) {
  const terrain = useGLTF(root + "terrain.glb");
  return <>
    <fog attach="fog" args={["#adb2a5", 0.013]} />
    <Environment files={root + "sky.hdr"} background environmentIntensity={0.75} />
    <ambientLight intensity={0.65} />
    <directionalLight position={[-30, 45, 12]} intensity={2.1} />
    <primitive object={terrain.scene} />
    {Object.entries(trees).map(([key, matrices]) => {
      const [source, lod] = key.split("|");
      return <SourceAsset key={key} file={`trees/${source}-${lod}-meshopt-webp.glb`} matrices={matrices} diagnostic={diagnostic} alpha={alpha} />;
    })}
    {Object.entries(props).map(([name, matrices]) => <SourceAsset key={name} file={sourceTextures ? "source-props.glb" : "source-props-web-1k.glb"} name={name} matrices={matrices} diagnostic={diagnostic} alpha={alpha} />)}
    <SubmissionAudit />
    <Walker collision={collision} onPosition={onPosition} trunks={Object.values(trees).flat()} />
  </>;
}

export function ForestOriginLab() {
  const [payload, setPayload] = useState<{ trees: Record<string, number[][][]>; props: Record<string, number[][][]>; collision: Collision; counts: [number, number]; sourceTextures: boolean; diagnostic: boolean; alpha?: string }>();
  const [error, setError] = useState("");
  const [budget, setBudget] = useState<LabBudget>({ trees: 8, props: 500, radius: 35 });
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const diagnostic = params.get("diagnostic");
    const integer = (key: string, fallback: number, maximum: number) => {
      const value = params.get(key);
      return Math.min(maximum, Math.max(0, value === null || !Number.isFinite(Number(value)) ? fallback : Number(value)));
    };
    const requested = { trees: integer("trees", 8, 585), props: integer("props", 500, 18000), radius: integer("radius", 35, 65) };
    Promise.all([fetch(root + "render-inventory.json").then(value => value.json()) as Promise<SourceInventory>,
      fetch(root + "source-tree-placements.json").then(value => value.json()) as Promise<Instance[]>,
      fetch(root + "source-camera-preview.json.gz").then(async value => {
        if (!value.ok || !value.body) throw new Error("Source layout HTTP " + value.status);
        return new Response(value.body.pipeThrough(new DecompressionStream("gzip"))).json();
      }) as Promise<Preview>,
      fetch(root + "collision-layout.json").then(value => value.json()) as Promise<{ collision: Collision }>])
      .then(([inventory, placements, preview, layout]) => {
        const trees: Record<string, number[][][]> = {};
        const nearby = placements.map(item => ({ item, distance: Math.hypot(item.matrix[0][3] - cameraSource.x, item.matrix[1][3] - cameraSource.y) }))
          .filter(value => value.distance < requested.radius && (diagnostic !== "fir" || value.item.source.startsWith("silver_fir")))
          .sort((a, b) => a.distance - b.distance).slice(0, diagnostic === "fern" ? 0 : diagnostic === "fir" ? 1 : requested.trees);
        for (const { item, distance } of nearby) {
          const lod = distance < 18 ? "lod03" : "lod01";
          (trees[`${item.source}|${lod}`] ??= []).push(item.matrix);
        }
        const props: Record<string, number[][][]> = {};
        const chosen = preview.records.map(([index, rows]) => ({ name: inventory.sourceAssetNames[index], rows,
          distance: Math.hypot(rows[0][3] - cameraSource.x, rows[1][3] - cameraSource.y) }))
          .filter(value => value.distance < requested.radius && (diagnostic !== "fern" || value.name.startsWith("fern_02")))
          .sort((a, b) => a.distance - b.distance).slice(0, diagnostic === "fir" ? 0 : diagnostic === "fern" ? 1 : requested.props);
        for (const { name, rows } of chosen) {
          const matrix = [...rows, [0, 0, 0, 1]];
          (props[name] ??= []).push(matrix);
        }
        if (active) { setBudget(requested); setPayload({ trees, props, collision: layout.collision, counts: [nearby.length, chosen.length],
          sourceTextures: params.get("sourceTextures") === "1", diagnostic: diagnostic === "fir" || diagnostic === "fern", alpha: params.get("alpha") ?? undefined }); }
      }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, []);
  return <main className="forest-lab" aria-label="Pine Forest 原资产隔离验证">
    {payload && <ForestSurface><Canvas camera={{ position: sourceToWorld(cameraSource).toArray(), fov: 48.5, near: 0.08, far: 280 }}
      fallback={<RenderFailure message="无法创建 WebGL 场景，请检查浏览器的图形支持。" />}
      dpr={1} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}>
      <RenderHealth /><Suspense fallback={null}><Scene {...payload} /></Suspense>
    </Canvas></ForestSurface>}
    <div className="forest-lab-bar"><div><strong>Pine Forest 原场景转换验证</strong>
      <span>源树 {payload?.counts[0] ?? "…"}/{budget.trees} · 地被 {payload?.counts[1] ?? "…"}/{budget.props} · 分级诊断</span></div></div>
    {error && <div className="forest-lab-status" role="alert">{error}</div>}
  </main>;
}
