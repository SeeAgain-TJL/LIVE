"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable scene and canvas diagnostics. */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, PerspectiveCamera } from "three";
import { ForestSurface, RenderFailure, RenderHealth, Walker } from "./forest-origin-lab";
import { PineStream, pineRoot, type TileManifest } from "./pine-stream";

type Collision = { origin: number[]; step: number; columns: number; rows: number; heights: (number | null)[] };
type Payload = { manifest: TileManifest; collision: Collision; trunks: number[][][] };
function Streaming({ manifest, onError, quality }: { manifest: TileManifest; onError: (message: string) => void; quality: "low" | "high" }) {
  const { gl, camera, scene } = useThree();
  const owner = useRef<PineStream | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const frozen = params.get("lod");
    const runtime = new PineStream(manifest,gl,onError,{alpha:params.get("alpha") === "coverage" ? "coverage":params.get("alpha") === "mask" ? "mask":"single",quality,audit:params.has("audit"),
      frozenLod:frozen === "near" || frozen === "mid" || frozen === "far" ? frozen:undefined});
    owner.current = runtime;
    scene.add(runtime.group);
    gl.domElement.dataset.forestStreamingRuntime="true";
    return () => { owner.current=null;scene.remove(runtime.group);runtime.dispose();delete gl.domElement.dataset.forestGeometryReady; };
  }, [manifest,gl,onError,scene,quality]);
  useFrame(()=>{if(camera instanceof PerspectiveCamera) owner.current?.tick(camera,performance.now());});
  return null;
}
function Terrain() {
  const terrain = useGLTF(pineRoot+"terrain.glb");
  return <primitive object={terrain.scene} />;
}
export function ForestRuntimeLab() {
  const [payload,setPayload] = useState<Payload>();
  const [error,setError] = useState("");
  const [scale,setScale] = useState(1);
  const [quality,setQuality] = useState<"low" | "high">("low");
  const status = useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const controller = new AbortController();
    const load = async (file: string) => {
      const response=await fetch(pineRoot+file,{signal:controller.signal});
      if(!response.ok) throw Error(`${file} HTTP ${response.status}`);
      return response.json();
    };
    Promise.all([load("batch2/tiles/manifest.json"),load("collision-layout.json"),load("source-tree-placements.json")])
      .then(([manifest,layout,trees])=>{if(!controller.signal.aborted) {
        setPayload({manifest,collision:layout.collision,trunks:trees.map((tree:{matrix:number[][]})=>tree.matrix)});
        if(new URLSearchParams(window.location.search).get("scale")==="0.8") setScale(0.8);
        if(new URLSearchParams(window.location.search).get("quality")==="high") setQuality("high");
      }})
      .catch(cause=>{if(!controller.signal.aborted) setError(String(cause));});
    const timer=window.setInterval(()=>{
      const canvas=document.querySelector<HTMLCanvasElement>("canvas");
      if(!status.current || !canvas) return;
      const value=JSON.parse(canvas.dataset.forestStreaming || "null");
      const metrics=JSON.parse(canvas.dataset.forestOriginMetrics || "null");
      status.current.textContent=value ? `${metrics?.fps?.toFixed(1) ?? "…"} FPS · 源树 ${value.trees} · 地被 ${value.props} · 驻留分区 ${value.tiles.length}` : "正在逐步加载周边森林";
    },1000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[]);
  return <main className="forest-lab" aria-label="Pine Forest 实时漫游">
    {payload && <ForestSurface><Canvas camera={{position:[23.155473709106445,0.9223032593727112,47.55979919433594],fov:48.5,near:0.08,far:220}}
      fallback={<RenderFailure message="无法创建 WebGL 场景，请检查浏览器的图形支持。" />}
      dpr={scale} gl={{antialias:true,powerPreference:"high-performance",toneMapping:ACESFilmicToneMapping}}>
      <RenderHealth />
      <fog attach="fog" args={["#adb2a5",0.013]} />
      <ambientLight intensity={0.65} /><directionalLight position={[-30,45,12]} intensity={2.1} />
      <Suspense fallback={null}><Environment files={pineRoot+"sky.hdr"} background environmentIntensity={0.75} /></Suspense>
      <Suspense fallback={null}><Terrain /></Suspense>
      <Streaming manifest={payload.manifest} onError={setError} quality={quality} />
      <Walker collision={payload.collision} trunks={payload.trunks} />
    </Canvas></ForestSurface>}
    <div className="forest-lab-bar"><div><strong>Pine Forest · 原布局动态 LOD</strong><span ref={status}>正在加载场景清单</span></div>
      <label>资源精度<select aria-label="森林资源精度" value={quality} onChange={event=>setQuality(event.target.value==="high" ? "high":"low")}>
        <option value="low">低 · 核显推荐</option><option value="high">较高 · 扩大真实几何范围</option>
      </select></label>
      <label>内部分辨率 <select aria-label="内部渲染分辨率" value={scale} onChange={event=>setScale(Number(event.target.value))}>
        <option value={1}>100% · DPR1</option><option value={0.8}>80% · 1152×720</option>
      </select></label>
    </div>
    {error && <div className="forest-lab-status" role="alert">{error}<button type="button" onClick={()=>window.location.reload()}>重新加载场景</button></div>}
  </main>;
}
