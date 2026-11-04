"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable scene and canvas diagnostics. */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, Mesh, PerspectiveCamera, TextureLoader, Vector3, type Material, type Texture } from "three";
import { ForestSurface, RenderFailure, RenderHealth, Walker, type Collision } from "./forest-origin-lab";
import { PineStream, pineRoot, type TileManifest, type SourceTree } from "./pine-stream";
import { loadPineTerrainLayeredMaterial, loadPineTerrainMaterial } from "./pine-materials";
import { applyPineCanopyField, makePineRiver } from "./pine-environment";

type Quality = "low" | "mid" | "high";
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
function Streaming({ manifest, trees, onError, quality, field }: { manifest: TileManifest; trees:SourceTree[]; onError: (message: string) => void; quality: Quality; field?: Texture }) {
  const { gl, camera, scene } = useThree();
  const owner = useRef<PineStream | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const frozen = params.get("lod");
    const runtime = new PineStream(manifest,gl,onError,{alpha:params.get("alpha") === "coverage" ? "coverage":params.get("alpha") === "mask" ? "mask":"single",quality,audit:params.has("audit"),sample:params.get("sample")==="creek",
      smoothImpostor:params.get("impostor")!=="legacy",
      sourceImpostor:params.get("impostor")==="source" || (quality==="high" && params.get("impostor")!=="legacy"),
      sourceTrees:params.get("overview")==="off" ? undefined:trees,field,
      frozenLod:frozen === "near" || frozen === "mid" || frozen === "far" ? frozen:undefined});
    owner.current = runtime;
    if(params.get("review")==="terrain") runtime.group.visible=false;
    scene.add(runtime.group);
    gl.domElement.dataset.forestStreamingRuntime="true";
    return () => { owner.current=null;scene.remove(runtime.group);runtime.dispose();delete gl.domElement.dataset.forestGeometryReady;delete gl.domElement.dataset.forestStreaming; };
  }, [manifest,trees,gl,onError,scene,quality,field]);
  useFrame(()=>{if(camera instanceof PerspectiveCamera) owner.current?.tick(camera,performance.now());});
  return null;
}
function Terrain({ onReady, onError, field, sample }: { onReady: (ready: boolean) => void; onError: (message: string) => void; field?: Texture; sample: boolean }) {
  const terrain = useGLTF(pineRoot+(sample ? "batch5/sample-terrain.glb":"environment/terrain.glb"));
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
      if(field) applyPineCanopyField(material,field);
      if(disposed) {release();return;}
      terrain.scene.traverse(object=>{if(object instanceof Mesh){original.set(object,object.material);object.material=material;}});
      // Upload the surface before vegetation starts; async material loading used
      // to reveal the tree overview while the terrain was still suspended.
      for(const map of maps) gl.initTexture(map);
      gl.domElement.dataset.pineTerrain=mode==="batch3b" ? "pbr":"layered";
      onReady(true);
    }).catch(error=>{release();if(!disposed) onError(`地表加载失败：${String(error)}`);});
    return ()=>{disposed=true;onReady(false);release();delete gl.domElement.dataset.pineTerrain;};
  },[terrain,gl,onReady,onError,sample,field]);
  return <primitive object={terrain.scene} />;
}
function SourceLandmarks({field}: {field: Texture}) {
  const { scene } = useGLTF(pineRoot+"batch6/landmarks.glb");
  const { gl } = useThree();
  const waterTime = useRef({value:0});
  useFrame((_,delta)=>{
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) waterTime.current.value+=Math.min(delta,.05);
  });
  useEffect(()=>{
    const original = new Map<Mesh,Mesh["material"]>();
    const created = new Set<Material>();
    const river = makePineRiver(field,waterTime.current);
    created.add(river);
    scene.traverse(object=>{
      if (!(object instanceof Mesh)) return;
      original.set(object,object.material);
      if (object.parent?.name==="river_water_runtime" || object.name==="river_water_runtime") {
        object.material=river;
      } else {
        const relight=(source: Material)=>{
          const material=source.clone();
          applyPineCanopyField(material,field);
          created.add(material);
          return material;
        };
        object.material=Array.isArray(object.material) ? object.material.map(relight):relight(object.material);
      }
    });
    gl.domElement.dataset.pineLandmarks="ready";
    return ()=>{
      for (const [mesh,material] of original) mesh.material=material;
      for (const material of created) material.dispose();
      delete gl.domElement.dataset.pineLandmarks;
    };
  },[gl,scene,field]);
  return <primitive object={scene} />;
}

type ContentProps = { payload: Payload; quality: Quality; onError: (message:string)=>void };
function EnvironmentContent(props: ContentProps) {
  const field=useLoader(TextureLoader,pineRoot+"environment/height-light.png");
  return <ForestContent {...props} field={field} />;
}
function ForestContent({payload,quality,onError,field}: ContentProps & {field?: Texture}) {
  const [terrainReady,setTerrainReady] = useState(false);
  return <>
    <Suspense fallback={null}><Terrain sample={!field} field={field} onReady={setTerrainReady} onError={onError} /></Suspense>
    {field && <Suspense fallback={null}><SourceLandmarks field={field} /></Suspense>}
    {terrainReady && <Streaming manifest={payload.manifest} trees={payload.trees} onError={onError} quality={quality} field={field} />}
  </>;
}

export function ForestRuntimeLab() {
  const [payload,setPayload] = useState<Payload>();
  const [error,setError] = useState("");
  const [scale,setScale] = useState(1);
  const [quality,setQuality] = useState<Quality>("low");
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
    Promise.all([load("batch2/tiles/manifest.json"),load(creek ? "batch5/collision-layout.json":"environment/navigation.json"),load("source-tree-placements.json")])
      .then(([manifest,layout,trees])=>{if(!controller.signal.aborted) {
        setSample(creek);
        setPayload({manifest,collision:creek ? layout.collision:layout,trees,trunks:trees.map((tree:SourceTree)=>tree.matrix)});
        if(new URLSearchParams(window.location.search).get("scale")==="0.8") setScale(0.8);
        const requested=new URLSearchParams(window.location.search).get("quality");
        if(requested==="high" || requested==="mid") setQuality(requested);
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
      <fogExp2 attach="fog" args={sample ? ["#aab8b2",0.008]:["#68786d",0.0085]} />
      <ambientLight intensity={sample ? 0.3:0.10} />
      <hemisphereLight args={sample ? ["#dce8ee","#414c2d",0.45]:["#bccde1","#48412a",0.45]} />
      <directionalLight position={sample ? [-30,45,12]:[-0.273,0.513,-0.814]} intensity={sample ? 1.6:1.92} color={sample ? "#fff0da":"#ffe0a2"} />
      <Suspense fallback={null}><Environment files={pineRoot+"sky.hdr"} background backgroundIntensity={sample ? 1:0.56} environmentIntensity={sample ? 0.6:0.36} /></Suspense>
      <Suspense fallback={null}>{sample ? <ForestContent payload={payload} quality={quality} onError={setError} />:<EnvironmentContent payload={payload} quality={quality} onError={setError} />}</Suspense>
      <Walker collision={payload.collision} trunks={payload.trunks} sliding />
      <RuntimeReviewPose />
    </Canvas></ForestSurface>}
    <div className="forest-lab-bar"><div><strong>{sample ? "Pine Forest · 河床森林样板":"Pine Forest · 原布局动态 LOD"}</strong><span ref={status}>正在加载地表与周边森林</span></div>
      <label>资源精度<select aria-label="森林资源精度" value={quality} onChange={event=>setQuality(event.target.value as Quality)}>
        <option value="low">低 · 核显推荐</option>{!sample && <option value="mid">中 · 平衡</option>}<option value="high">高 · 扩大真实几何范围</option>
      </select></label>
      <label>内部分辨率 <select aria-label="内部渲染分辨率" value={scale} onChange={event=>setScale(Number(event.target.value))}>
        <option value={1}>100% · DPR1</option><option value={0.8}>80% · 1152×720</option>
      </select></label>
    </div>
    {error && <div className="forest-lab-status" role="alert">{error}<button type="button" onClick={()=>window.location.reload()}>重新加载场景</button></div>}
  </main>;
}
