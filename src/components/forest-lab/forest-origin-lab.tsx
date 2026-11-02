"use client";

/* eslint-disable react-hooks/immutability -- R3F owns camera, matrices and WebGL diagnostics. */

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, DoubleSide, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";

type Instance = { source: string; matrix: number[][] };
type SourceInventory = { sourceSha256: string; treeSpeciesCounts: Record<string, number>; sourceAssetNames: string[] };
type Preview = { assetNames: string[]; records: [number, number[][]][] };
type Collision = { origin: number[]; step: number; columns: number; rows: number; heights: (number | null)[] };
type LabBudget = { trees: number; props: number; radius: number };
type WebTile = { tile: string; trees: Instance[]; props: [number, number[][]][] };
type WebManifest = { tiles: Record<string, { trees: number; props: number; bytes: number }> };
const root = "/forest-origin-assets/";
const cameraSource = new Vector3(23.155473709106445, -47.55979919433594, 0.9223032593727112);
const cameraTarget = new Vector3(-25.951723098754883, -40.576786041259766, 7.224738121032715);
const axis = new Matrix4().makeRotationX(-Math.PI / 2);
const axisInverse = axis.clone().invert();

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

function Instances({ part, matrices }: { part: Mesh; matrices: number[][][] }) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => {
    const copy = Array.isArray(part.material) ? part.material.map(value => value.clone()) : part.material.clone();
    for (const value of Array.isArray(copy) ? copy : [copy]) if (value.transparent || value.alphaTest > 0) value.side = DoubleSide;
    return copy;
  }, [part]);
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
  return <instancedMesh ref={ref} args={[part.geometry, material, matrices.length]} frustumCulled />;
}

function SourceAsset({ file, matrices, name }: { file: string; matrices: number[][][]; name?: string }) {
  const gltf = useGLTF(root + file);
  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const parent = name ? gltf.scene.getObjectByName("source__" + name) : gltf.scene;
    if (!parent) throw new Error("Missing source asset " + name);
    const found: Mesh[] = [];
    parent.traverse(object => { if (object instanceof Mesh) found.push(object); });
    return found;
  }, [gltf, name]);
  return <group>{meshes.map(mesh => <Instances key={mesh.uuid} part={mesh} matrices={matrices} />)}</group>;
}

function Walker({ collision, onPosition, trunks = [] }: { collision: Collision; onPosition?: (point: Vector3) => void; trunks?: number[][][] }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const lastPositionReport = useRef(0);
  useEffect(() => {
    camera.position.copy(sourceToWorld(cameraSource));
    camera.lookAt(sourceToWorld(cameraTarget));
    camera.rotation.reorder("YXZ");
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Pine Forest 原资产隔离场景，拖动观察，WASD 行走");
    const down = (event: PointerEvent) => { dragging.current = true; canvas.setPointerCapture(event.pointerId); canvas.focus(); };
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      camera.rotation.y -= event.movementX * 0.0025;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - event.movementY * 0.0025));
    };
    const up = () => { dragging.current = false; };
    const keydown = (event: KeyboardEvent) => { keys.current.add(event.key.toLowerCase()); };
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); };
  }, [camera, gl, onPosition]);
  useFrame((_, delta) => {
    const forward = Number(keys.current.has("w")) - Number(keys.current.has("s"));
    const sideways = Number(keys.current.has("d")) - Number(keys.current.has("a"));
    if (forward || sideways) {
      const angle = camera.rotation.y;
      const speed = Math.min(delta, 0.05) * 3.5 / Math.hypot(forward, sideways);
      const x = camera.position.x + (Math.sin(-angle) * forward + Math.cos(angle) * sideways) * speed;
      const z = camera.position.z + (-Math.cos(angle) * forward + Math.sin(angle) * sideways) * speed;
      if (x > -70 && x < 70 && z > -100 && z < 95 &&
          !trunks.some(matrix => Math.hypot(matrix[0][3] - x, -matrix[1][3] - z) < 0.8)) {
        camera.position.set(x, groundHeight(collision, x, z) + 1.2, z);
      }
    }
    if (onPosition && performance.now() - lastPositionReport.current > 350) {
      onPosition(camera.position.clone());
      lastPositionReport.current = performance.now();
    }
    samples.current.push(delta * 1000);
    if (samples.current.length > 120) samples.current.shift();
    if (performance.now() - last.current > 1000) {
      const sorted = [...samples.current].sort((a, b) => a - b);
      const medianMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
      gl.domElement.dataset.forestOriginReady = "true";
      gl.domElement.dataset.forestOriginMetrics = JSON.stringify({ fps: medianMs ? 1000 / medianMs : 0, medianMs,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, triangles: gl.info.render.triangles,
        calls: gl.info.render.calls, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
        camera: camera.position.toArray() });
      last.current = performance.now();
    }
  });
  return null;
}

function Scene({ trees, props, collision, onPosition, runtime = false }: { trees: Record<string, number[][][]>; props: Record<string, number[][][]>;
  collision: Collision; onPosition?: (point: Vector3) => void; runtime?: boolean }) {
  const terrain = useGLTF(root + "terrain.glb");
  return <>
    <fog attach="fog" args={["#adb2a5", 0.013]} />
    <Environment files={root + "sky.hdr"} background environmentIntensity={0.75} />
    <ambientLight intensity={0.65} />
    <directionalLight position={[-30, 45, 12]} intensity={2.1} />
    <primitive object={terrain.scene} />
    {Object.entries(trees).map(([key, matrices]) => {
      const [source, lod] = key.split("|");
      return <SourceAsset key={key} file={`trees/${source}-${lod}-meshopt-webp.glb`} matrices={matrices} />;
    })}
    {Object.entries(props).map(([name, matrices]) => <SourceAsset key={name} file={runtime ? "source-props-web-1k.glb" : "source-props.glb"} name={name} matrices={matrices} />)}
    <Walker collision={collision} onPosition={onPosition} trunks={Object.values(trees).flat()} />
  </>;
}

export function ForestOriginLab() {
  const [payload, setPayload] = useState<{ trees: Record<string, number[][][]>; props: Record<string, number[][][]>; collision: Collision; counts: [number, number] }>();
  const [error, setError] = useState("");
  const [budget, setBudget] = useState<LabBudget>({ trees: 8, props: 500, radius: 35 });
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
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
          .filter(value => value.distance < requested.radius).sort((a, b) => a.distance - b.distance).slice(0, requested.trees);
        for (const { item, distance } of nearby) {
          const lod = distance < 18 ? "lod03" : "lod01";
          (trees[`${item.source}|${lod}`] ??= []).push(item.matrix);
        }
        const props: Record<string, number[][][]> = {};
        const chosen = preview.records.map(([index, rows]) => ({ name: inventory.sourceAssetNames[index], rows,
          distance: Math.hypot(rows[0][3] - cameraSource.x, rows[1][3] - cameraSource.y) }))
          .filter(value => value.distance < requested.radius).sort((a, b) => a.distance - b.distance).slice(0, requested.props);
        for (const { name, rows } of chosen) {
          const matrix = [...rows, [0, 0, 0, 1]];
          (props[name] ??= []).push(matrix);
        }
        if (active) { setBudget(requested); setPayload({ trees, props, collision: layout.collision, counts: [nearby.length, chosen.length] }); }
      }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, []);
  return <main className="forest-lab" aria-label="Pine Forest 原资产隔离验证">
    {payload && <Canvas camera={{ position: sourceToWorld(cameraSource).toArray(), fov: 48.5, near: 0.08, far: 280 }}
      dpr={1} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}>
      <Suspense fallback={null}><Scene {...payload} /></Suspense>
    </Canvas>}
    <div className="forest-lab-bar"><div><strong>Pine Forest 原场景转换验证</strong>
      <span>源树 {payload?.counts[0] ?? "…"}/{budget.trees} · 地被 {payload?.counts[1] ?? "…"}/{budget.props} · 分级诊断</span></div></div>
    {error && <div className="forest-lab-status" role="alert">{error}</div>}
  </main>;
}

function tileKey(point: Vector3) { return `${Math.floor(point.x / 32)}_${Math.floor(-point.z / 32)}`; }
function nearbyTileKeys(point: Vector3, manifest: WebManifest) {
  const x = Math.floor(point.x / 32);
  const y = Math.floor(-point.z / 32);
  const keys = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    const key = `${x + dx}_${y + dy}`;
    if (manifest.tiles[key]) keys.push(key);
  }
  return keys;
}

function selectRuntimeInstances(tiles: WebTile[], assetNames: string[], camera: Vector3) {
  const trees: Record<string, number[][][]> = {};
  const props: Record<string, number[][][]> = {};
  let treeCount = 0;
  let propCount = 0;
  for (const tile of tiles) {
    for (const item of tile.trees) {
      const distance = Math.hypot(item.matrix[0][3] - camera.x, item.matrix[1][3] + camera.z);
      if (distance > 80) continue;
      // All LODs are generated from the exact source tree. No proxy mesh is used.
      const lod = distance < 8 ? "lod03" : distance < 18 ? "lod01" : "lod003";
      (trees[`${item.source}|${lod}`] ??= []).push(item.matrix);
      treeCount += 1;
    }
    for (const [index, rows] of tile.props) {
      const name = assetNames[index];
      const distance = Math.hypot(rows[0][3] - camera.x, rows[1][3] + camera.z);
      if (distance > 18) continue;
      if (name.startsWith("moss_patch") && distance > 7) continue;
      if (name.startsWith("pine_cover") && distance > 12) continue;
      if ((name.startsWith("tree_roots") || name.startsWith("dry_branches")) && distance > 9) continue;
      const sourceName = name.endsWith("_lod0") && distance > 3 && assetNames.includes(name.slice(0, -1) + "1")
        ? name.slice(0, -1) + "1" : name;
      (props[sourceName] ??= []).push([...rows, [0, 0, 0, 1]]);
      propCount += 1;
    }
  }
  return { trees, props, counts: [treeCount, propCount] as [number, number] };
}

export function ForestRuntimeLab() {
  const [inventory, setInventory] = useState<SourceInventory>();
  const [manifest, setManifest] = useState<WebManifest>();
  const [collision, setCollision] = useState<Collision>();
  const [camera, setCamera] = useState(() => sourceToWorld(cameraSource));
  const [loaded, setLoaded] = useState<Record<string, WebTile>>({});
  const [error, setError] = useState("");
  const loading = useRef(new Map<string, AbortController>());
  const reportPosition = useCallback((point: Vector3) => {
    setCamera(point);
    if (!manifest) return;
    const wanted = new Set(nearbyTileKeys(point, manifest));
    setLoaded(current => {
      const retained = Object.fromEntries(Object.entries(current).filter(([key]) => wanted.has(key)));
      return Object.keys(retained).length === Object.keys(current).length ? current : retained;
    });
  }, [manifest]);
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(root + "render-inventory.json").then(response => response.json()) as Promise<SourceInventory>,
      fetch(root + "runtime-web-tiles/manifest.json").then(response => response.json()) as Promise<WebManifest>,
      fetch(root + "collision-layout.json").then(response => response.json()) as Promise<{ collision: Collision }>,
    ]).then(([source, tiles, terrain]) => {
      if (!active) return;
      setInventory(source); setManifest(tiles); setCollision(terrain.collision);
    }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!manifest) return;
    const wanted = new Set(nearbyTileKeys(camera, manifest));
    for (const [key, controller] of loading.current) if (!wanted.has(key)) { controller.abort(); loading.current.delete(key); }
    for (const key of wanted) {
      if (loaded[key] || loading.current.has(key)) continue;
      const controller = new AbortController();
      loading.current.set(key, controller);
      fetch(root + `runtime-web-tiles/${key}.json.gz`, { signal: controller.signal })
        .then(response => {
          if (!response.ok || !response.body) throw new Error(`分区 ${key} HTTP ${response.status}`);
          return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json() as Promise<WebTile>;
        }).then(tile => {
          if (!controller.signal.aborted) setLoaded(current => ({ ...current, [key]: tile }));
        })
        .catch(cause => { if (!controller.signal.aborted) setError(String(cause)); })
        .finally(() => loading.current.delete(key));
    }
  }, [camera, manifest, loaded]);
  const wantedKeys = useMemo(() => manifest ? nearbyTileKeys(camera, manifest) : [], [camera, manifest]);
  const selection = useMemo(() => inventory ? selectRuntimeInstances(wantedKeys.map(key => loaded[key]).filter((tile): tile is WebTile => Boolean(tile)),
    inventory.sourceAssetNames, camera) : null, [loaded, inventory, camera, wantedKeys]);
  const currentTile = tileKey(camera);
  const ready = inventory && manifest && collision && loaded[currentTile];
  return <main className="forest-lab" aria-label="Pine Forest 原资产实时漫游实验">
    {inventory && manifest && collision && <Canvas camera={{ position: sourceToWorld(cameraSource).toArray(), fov: 48.5, near: 0.08, far: 280 }}
      dpr={1} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}>
      <Suspense fallback={null}><Scene trees={selection?.trees ?? {}} props={selection?.props ?? {}} collision={collision}
        onPosition={reportPosition} runtime /></Suspense>
    </Canvas>}
    <div className="forest-lab-bar"><div><strong>Pine Forest 原资产漫游</strong>
      <span>分区 {Object.keys(loaded).length}/61 · 可见源树 {selection?.counts[0] ?? 0} · 地被 {selection?.counts[1] ?? 0}</span></div></div>
    {!ready && !error && <div className="forest-lab-status" role="status">正在加载周边森林分区</div>}
    {error && <div className="forest-lab-status" role="alert">{error}</div>}
  </main>;
}
