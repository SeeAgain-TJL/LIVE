"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable scene and canvas diagnostics. */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, FogExp2, Mesh, PerspectiveCamera, TextureLoader, Vector3, type Material, type Texture } from "three";
import { ForestSurface, RenderFailure, RenderHealth, Walker, type Collision } from "./forest-origin-lab";
import { PineStream, pineRoot, type TileManifest, type SourceTree, type PineRockContacts } from "./pine-stream";
import { loadPineTerrainLayeredMaterial, loadPineTerrainMaterial } from "./pine-materials";
import { applyPineCanopyField, applyPineUnderstory, makePineRiver } from "./pine-environment";
import { PineGameRegion } from "./pine-game-region";
import { PineOuterForest, pineVisualRoot } from "./pine-outer-forest";
import type { Memory } from "@/domain/types";
import { derivePineMemoryAnchors, type PineMemoryAnchor, type PineMemorySafety } from "./pine-memory-anchors";

type Quality = "low" | "mid" | "high";
type Payload = { manifest: TileManifest; collision: Collision; trunks: number[][][]; trees: SourceTree[]; safety?: PineMemorySafety; rockContacts?: PineRockContacts };
const NO_MEMORIES: Memory[] = [];
import { PineMemoryScene, type PineMemorySceneProps } from "./pine-memory-scene";

function ForestHaze() {
  // Ground-level haze stays dense, while a raised overview can look down
  // through clearer air. No extra render pass or shadow-map dependency.
  useFrame(({scene,camera})=>{
    if (scene.fog instanceof FogExp2) {
      const above = Math.min(1,Math.max(0,(camera.position.y-26)/140));
      scene.fog.density = 0.0066-0.0041*above;
    }
  });
  return <fogExp2 attach="fog" args={["#5f6b59",0.0066]} />;
}
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
function Streaming({ manifest, trees, onError, quality, field, terrainReady, rockContacts, gameReady }: { manifest: TileManifest; trees:SourceTree[]; onError: (message: string) => void; quality: Quality; field?: Texture; terrainReady: boolean; rockContacts?: PineRockContacts; gameReady?: boolean }) {
  const { gl, camera, scene } = useThree();
  const owner = useRef<PineStream | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const frozen = params.get("lod");
    const runtime = new PineStream(manifest,gl,onError,{alpha:params.get("alpha") === "coverage" ? "coverage":params.get("alpha") === "mask" ? "mask":"single",quality,audit:params.has("audit"),sample:params.get("sample")==="creek",
      smoothImpostor:params.get("impostor")!=="legacy",
      sourceImpostor:params.get("impostor")==="source" || (quality==="high" && params.get("impostor")!=="legacy"),
      gameRegion:gameReady,
      sourceTrees:params.get("overview")==="off" ? undefined:trees,field,rockContacts,
      // Keep the validated legacy default while the full rebuild misses the
      // Intel frame-time gate. The review route still exercises every source variant.
      rebuiltTrees:field && params.get("trees")==="rebuild" ? new Set(manifest.names.slice(manifest.propAssetCount)):undefined,
      frozenLod:frozen === "near" || frozen === "mid" || frozen === "far" ? frozen:undefined});
    owner.current = runtime;
    runtime.group.visible=false;
    runtime.preload();
    scene.add(runtime.group);
    gl.domElement.dataset.forestStreamingRuntime="true";
    return () => { owner.current=null;scene.remove(runtime.group);runtime.dispose();delete gl.domElement.dataset.forestGeometryReady;delete gl.domElement.dataset.forestStreaming; };
  }, [manifest,trees,gl,onError,scene,quality,field,rockContacts,gameReady]);
  useFrame(()=>{
    const runtime=owner.current;
    if (!runtime || !terrainReady || !(camera instanceof PerspectiveCamera)) return;
    runtime.tick(camera,performance.now());
  });
  useEffect(()=>{
    if (owner.current) owner.current.group.visible=terrainReady && new URLSearchParams(window.location.search).get("review")!=="terrain";
  },[terrainReady,quality]);
  return null;
}
function Terrain({ onReady, onError, onMaterial, field, floor, sample }: { onReady: (ready: boolean) => void; onError: (message: string) => void; onMaterial: (material:Material|null)=>void; field?: Texture; floor?: Texture; sample: boolean }) {
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
      if(field && floor) applyPineUnderstory(material,floor);
      if(disposed) {release();return;}
      terrain.scene.traverse(object=>{if(object instanceof Mesh){original.set(object,object.material);object.material=material;}});
      // Upload the surface before vegetation starts; async material loading used
      // to reveal the tree overview while the terrain was still suspended.
      for(const map of maps) gl.initTexture(map);
      gl.domElement.dataset.pineTerrain=mode==="batch3b" ? "pbr":"layered";
      onMaterial(material);onReady(true);
    }).catch(error=>{release();if(!disposed) onError(`地表加载失败：${String(error)}`);});
    return ()=>{disposed=true;onReady(false);onMaterial(null);release();delete gl.domElement.dataset.pineTerrain;};
  },[terrain,gl,onReady,onError,onMaterial,sample,field,floor]);
  return <primitive object={terrain.scene} />;
}
function SourceLandmarks({field}: {field: Texture}) {
  const { scene } = useGLTF(pineRoot+"scene-repair/landmarks.glb");
  const { gl } = useThree();
  const waterTime = useRef({value:0});
  const reducedMotion = useRef(false);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>{reducedMotion.current=media.matches;};
    sync();
    media.addEventListener("change",sync);
    return ()=>media.removeEventListener("change",sync);
  },[]);
  useFrame((_,delta)=>{
    if (!reducedMotion.current) waterTime.current.value+=Math.min(delta,.05);
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

type ContentProps = { payload: Payload; quality: Quality; onError: (message:string)=>void; anchors: PineMemoryAnchor[]; experience?: PineMemorySceneProps };
function EnvironmentContent(props: ContentProps) {
  const [field,floor]=useLoader(TextureLoader,[pineRoot+"environment/height-light.png",pineVisualRoot+"understory.webp"]);
  return <ForestContent {...props} field={field} floor={floor} />;
}
// The stream is created once with the region exclusion; toggling it after the GLB loads
// would rebuild PineStream and dispose shared prop textures still in use.
const noteGameRegion=()=>{};
function ForestContent({payload,quality,onError,field,floor,anchors,experience}: ContentProps & {field?: Texture;floor?: Texture}) {
  const [terrainReady,setTerrainReady] = useState(false);
  const gameRegion=typeof window!=="undefined" && new URLSearchParams(window.location.search).get("trees")==="game-region";
  const [terrainMaterial,setTerrainMaterial] = useState<Material|null>(null);
  return <>
    {gameRegion && <PineGameRegion onReady={noteGameRegion} onError={onError} />}
    <Suspense fallback={null}><Terrain sample={!field} field={field} floor={floor} onReady={setTerrainReady} onMaterial={setTerrainMaterial} onError={onError} /></Suspense>
    {field && terrainReady && terrainMaterial && <Suspense fallback={null}><PineOuterForest terrainMaterial={terrainMaterial} /></Suspense>}
    {field && <Suspense fallback={null}><SourceLandmarks field={field} /></Suspense>}
    {(field || terrainReady) && <Streaming manifest={payload.manifest} trees={payload.trees} onError={onError} quality={quality} field={field} terrainReady={terrainReady} rockContacts={payload.rockContacts} gameReady={gameRegion} />}
    {terrainReady && experience && <PineMemoryScene anchors={anchors} {...experience} />}
  </>;
}

export function ForestRuntimeLab({ memories = NO_MEMORIES, experience }: { memories?: Memory[]; experience?: PineMemorySceneProps }) {
  const [payload,setPayload] = useState<Payload>();
  const [error,setError] = useState("");
  const [scale,setScale] = useState(1);
  const [quality,setQuality] = useState<Quality>("low");
  const [sample,setSample] = useState(false);
  const status = useRef<HTMLSpanElement>(null);
  const immersive=!!experience;
  const [qualityHost,setQualityHost]=useState<HTMLElement|null>(null);
  // The host lives inside the independently mounted reading settings dialog.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(immersive)setQualityHost(document.getElementById("fm-quality-slot"));},[immersive]);
  const anchors = useMemo(()=>payload ? derivePineMemoryAnchors(memories,payload.collision,payload.trunks,payload.safety):[],[payload,memories]);
  useEffect(()=>{
    const controller = new AbortController();
    const load = async (file: string) => {
      const response=await fetch(pineRoot+file,{signal:controller.signal});
      if(!response.ok) throw Error(`${file} HTTP ${response.status}`);
      return response.json();
    };
    const params=new URLSearchParams(window.location.search);
    const creek=params.get("sample")==="creek";
    const requested=params.get("quality");
    if (!creek) {
      useGLTF.preload(pineRoot+"environment/terrain.glb");
      useGLTF.preload(pineRoot+"scene-repair/landmarks.glb");
      useLoader.preload(TextureLoader,pineRoot+"environment/height-light.png");
    }
    Promise.all([load("batch2/tiles/manifest.json"),load(creek ? "batch5/collision-layout.json":"environment/navigation.json"),load("source-tree-placements.json"),
      immersive && !creek ? load("scene-repair/memory-safety.json"):undefined,creek ? undefined:load("scene-repair-contact/rock-contact.json")])
      .then(([manifest,layout,trees,safety,rockContacts])=>{if(!controller.signal.aborted) {
        setSample(creek);
        setPayload({manifest,collision:creek ? layout.collision:layout,trees,safety,rockContacts,trunks:trees.map((tree:SourceTree)=>tree.matrix)});
        const pixels=params.get("scale");
        if (pixels==="0.8") setScale(.8);
        else if (pixels==="0.7" && !creek) setScale(.7);
        else if (!creek && !pixels && requested!=="high") setScale(requested==="mid" ? .8:.7);
        if(requested==="high" || (requested==="mid" && !creek)) setQuality(requested);
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
  },[immersive]);
  const controls = <div className="forest-lab-bar"><div><strong>{sample ? "Pine Forest · 河床森林样板":"Pine Forest · 原布局动态 LOD"}</strong><span ref={status}>正在加载地表与周边森林</span></div>
      <label>资源精度<select aria-label="森林资源精度" value={quality} onChange={event=>{
        const next=event.target.value as Quality;
        setQuality(next);
        if (!sample) setScale(next==="low" ? .7:next==="mid" ? .8:1);
      }}>
        <option value="low">低 · 核显推荐</option>{!sample && <option value="mid">中 · 平衡</option>}<option value="high">高 · 扩大真实几何范围</option>
      </select></label>
      <label>内部分辨率 <select aria-label="内部渲染分辨率" value={scale} onChange={event=>setScale(Number(event.target.value))}>
        <option value={1}>100% · DPR1</option><option value={0.8}>80% · 1152×720</option>{!sample && <option value={0.7}>70% · 1008×630</option>}
      </select></label>
    </div>;
  return <main className={`forest-lab${experience ? " forest-memory-enabled" : ""}`} aria-label="Pine Forest 实时漫游">
    {payload && <ForestSurface><Canvas camera={{position:[23.155473709106445,0.9223032593727112,47.55979919433594],fov:48.5,near:0.08,far:sample ? 220:520}}
      fallback={<RenderFailure message="无法创建 WebGL 场景，请检查浏览器的图形支持。" />}
      onCreated={({gl})=>{gl.domElement.dataset.forestStreamingRuntime="true";}}
      dpr={scale} gl={{antialias:true,powerPreference:"high-performance",toneMapping:ACESFilmicToneMapping}}>
      <RenderHealth />
      {sample ? <fogExp2 attach="fog" args={["#aab8b2",0.008]} />:<ForestHaze />}
      <ambientLight intensity={sample ? 0.3:0.075} />
      <hemisphereLight args={sample ? ["#dce8ee","#414c2d",0.45]:["#c9d1ba","#454626",0.38]} />
      <directionalLight position={sample ? [-30,45,12]:[-0.273,0.513,-0.814]} intensity={sample ? 1.6:1.85} color={sample ? "#fff0da":"#ffe0a2"} />
      <Suspense fallback={null}><Environment files={pineRoot+"sky.hdr"} background backgroundIntensity={sample ? 1:0.46} environmentIntensity={sample ? 0.6:0.30} /></Suspense>
      <Suspense fallback={null}>{sample ? <ForestContent payload={payload} quality={quality} onError={setError} anchors={anchors} experience={experience} />:<EnvironmentContent payload={payload} quality={quality} onError={setError} anchors={anchors} experience={experience} />}</Suspense>
      <Walker collision={payload.collision} trunks={payload.trunks} sliding paused={!!experience && (!experience.enabled || experience.phase!=="exploring")} />
      <RuntimeReviewPose />
    </Canvas></ForestSurface>}
    {immersive ? (qualityHost && createPortal(controls,qualityHost)) : controls}
    {error && <div className="forest-lab-status" role="alert">{error}<button type="button" onClick={()=>window.location.reload()}>重新加载场景</button></div>}
  </main>;
}
