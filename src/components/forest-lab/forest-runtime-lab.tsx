"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable scene and canvas diagnostics. */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, Mesh, PerspectiveCamera, TextureLoader, Vector3 } from "three";
import { ForestSurface, RenderFailure, RenderHealth, Walker } from "./forest-origin-lab";
import { PineStream, pineRoot, type TileManifest, type SourceTree } from "./pine-stream";
import { loadPineTerrainLayeredMaterial, loadPineTerrainMaterial } from "./pine-materials";

type Collision = { origin: number[]; step: number; columns: number; rows: number; heights: (number | null)[] };
type Payload = { manifest: TileManifest; collision: Collision; trunks: number[][][]; trees: SourceTree[] };
function RuntimeReviewPose() {
  const {camera,gl} = useThree();
  useEffect(()=>{
    if(!new URLSearchParams(window.location.search).has("review")) return;
    gl.domElement.dataset.pineReviewPoseReady="true";
    const setPose=(event:Event)=>{
      const pose=(event as CustomEvent<{position:number[];direction:number[]}>).detail;
      if(pose.position.length!==3 || pose.direction.length!==3 || ![...pose.position,...pose.direction].every(Number.isFinite)) return;
      camera.position.fromArray(pose.position);
      camera.lookAt(new Vector3().fromArray(pose.direction).add(camera.position));camera.rotation.reorder("YXZ");
    };
    window.addEventListener("pine-runtime-review-camera",setPose);
    return ()=>window.removeEventListener("pine-runtime-review-camera",setPose);
  },[camera,gl]);
  return null;
}
function Streaming({ manifest, trees, onError, quality }: { manifest: TileManifest; trees:SourceTree[]; onError: (message: string) => void; quality: "low" | "high" }) {
  const { gl, camera, scene } = useThree();
  const owner = useRef<PineStream | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const frozen = params.get("lod");
    const runtime = new PineStream(manifest,gl,onError,{alpha:params.get("alpha") === "coverage" ? "coverage":params.get("alpha") === "mask" ? "mask":"single",quality,audit:params.has("audit"),sample:params.get("sample")==="creek",
      smoothImpostor:params.get("impostor")!=="legacy",
      sourceImpostor:params.get("impostor")==="source" || (quality==="high" && params.get("impostor")!=="legacy"),
      sourceTrees:params.get("overview")==="off" ? undefined:trees,
      frozenLod:frozen === "near" || frozen === "mid" || frozen === "far" ? frozen:undefined});
    owner.current = runtime;
    if(params.get("review")==="terrain") runtime.group.visible=false;
    scene.add(runtime.group);
    gl.domElement.dataset.forestStreamingRuntime="true";
    return () => { owner.current=null;scene.remove(runtime.group);runtime.dispose();delete gl.domElement.dataset.forestGeometryReady;delete gl.domElement.dataset.forestStreaming; };
  }, [manifest,trees,gl,onError,scene,quality]);
  useFrame(()=>{if(camera instanceof PerspectiveCamera) owner.current?.tick(camera,performance.now());});
  return null;
}
function Terrain({ onReady, onError }: { onReady: (ready: boolean) => void; onError: (message: string) => void }) {
  const sample=typeof window!=="undefined" && new URLSearchParams(window.location.search).get("sample")==="creek";
  const terrain = useGLTF(pineRoot+(sample ? "batch5/sample-terrain.glb":"terrain.glb"));
  const { gl } = useThree();
  useEffect(()=>{
    const mode=new URLSearchParams(window.location.search).get("terrain");
    if(mode==="legacy") {onReady(true);return ()=>onReady(false);}
    let disposed=false;
    let release=()=>{};
    gl.domElement.dataset.pineTerrain="loading";
    const loader=mode==="batch3b" ? loadPineTerrainMaterial():loadPineTerrainLayeredMaterial();
    loader.then(async ({material,maps})=>{
      const original = new Map<Mesh, Mesh["material"]>();
      release=()=>{for(const [mesh,previous] of original) mesh.material=previous;material.dispose();for(const map of maps) map.dispose();};
      if(sample) {
        const ao=await new TextureLoader().loadAsync(pineRoot+"batch5/contact-ao.webp");
        ao.flipY=false;material.aoMap=ao;material.aoMapIntensity=0.85;maps.push(ao);
      }
      if(disposed) {release();return;}
      terrain.scene.traverse(object=>{if(object instanceof Mesh){original.set(object,object.material);object.material=material;}});
      // Upload the surface before vegetation starts; async material loading used
      // to reveal the tree overview while the terrain was still suspended.
      for(const map of maps) gl.initTexture(map);
      gl.domElement.dataset.pineTerrain=mode==="batch3b" ? "pbr":"layered";
      onReady(true);
    }).catch(error=>{release();if(!disposed) onError(`地表加载失败：${String(error)}`);});
    return ()=>{disposed=true;onReady(false);release();delete gl.domElement.dataset.pineTerrain;};
  },[terrain,gl,onReady,onError,sample]);
  return <primitive object={terrain.scene} />;
}
export function ForestRuntimeLab() {
  const [payload,setPayload] = useState<Payload>();
  const [error,setError] = useState("");
  const [scale,setScale] = useState(1);
  const [quality,setQuality] = useState<"low" | "high">("low");
  const [terrainReady,setTerrainReady] = useState(false);
  const [sample,setSample] = useState(false);
  const status = useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const controller = new AbortController();
    const load = async (file: string) => {
      const response=await fetch(pineRoot+file,{signal:controller.signal});
      if(!response.ok) throw Error(`${file} HTTP ${response.status}`);
      return response.json();
    };
    const creek=new URLSearchParams(window.location.search).get("sample")==="creek";
    Promise.all([load("batch2/tiles/manifest.json"),load(creek ? "batch5/collision-layout.json":"collision-layout.json"),load("source-tree-placements.json")])
      .then(([manifest,layout,trees])=>{if(!controller.signal.aborted) {
        setSample(creek);
        setPayload({manifest,collision:layout.collision,trees,trunks:trees.map((tree:SourceTree)=>tree.matrix)});
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
      onCreated={({gl})=>{gl.domElement.dataset.forestStreamingRuntime="true";}}
      dpr={scale} gl={{antialias:true,powerPreference:"high-performance",toneMapping:ACESFilmicToneMapping}}>
      <RenderHealth />
      {sample ? <fogExp2 attach="fog" args={["#aab8b2",0.008]} />:<fog attach="fog" args={["#adb2a5",0.013]} />}
      <ambientLight intensity={sample ? 0.3:0.65} />
      {sample && <hemisphereLight args={["#dce8ee","#414c2d",0.45]} />}
      <directionalLight position={[-30,45,12]} intensity={sample ? 1.6:2.1} color={sample ? "#fff0da":"#ffffff"} />
      <Suspense fallback={null}><Environment files={pineRoot+"sky.hdr"} background environmentIntensity={sample ? 0.6:0.75} /></Suspense>
      <Suspense fallback={null}><Terrain onReady={setTerrainReady} onError={setError} /></Suspense>
      {terrainReady && <Streaming manifest={payload.manifest} trees={payload.trees} onError={setError} quality={quality} />}
      <Walker collision={payload.collision} trunks={payload.trunks} sliding={sample} />
      <RuntimeReviewPose />
    </Canvas></ForestSurface>}
    <div className="forest-lab-bar"><div><strong>{sample ? "Pine Forest · 河床森林样板":"Pine Forest · 原布局动态 LOD"}</strong><span ref={status}>正在加载地表与周边森林</span></div>
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
