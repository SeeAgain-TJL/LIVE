"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box3, Color, MathUtils, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { OrbitControls as Controls } from "three-stdlib";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import type { ActorEvent, ActorSnapshot } from "@/domain/guide-lab";
import { inspectLabGlb } from "@/domain/guide-lab";
import type { Memory, Planet, Vec3 } from "@/domain/types";
import { PlanetMesh } from "@/components/three/planet-mesh";
import { StarField } from "@/components/three/star-field";
import { RigController } from "./rig-controller";
import type { LabActorAsset, LabMetrics } from "./asset-contract";

export type ModelStatus = { phase: "loading" | "ready" | "error"; message: string; loadMs?: number };
interface Props {
  asset: LabActorAsset; animation: { buffer: ArrayBuffer; serial: number } | null;
  snapshot: ActorSnapshot; planet: Planet | null; memory: Memory | null;
  reduced: boolean; low: boolean;
  onEvent: (event: ActorEvent) => void;
  onStatus: (status: ModelStatus) => void;
  onAnimationStatus: (status: string) => void;
  onMetrics: (metrics: LabMetrics) => void;
}

const PLANET = new Vector3(0.95, 1.28, -0.7);
const MEMORY = new Vector3(0.95, 1.15, 0.25);
const HOME = new Vector3(0.25, 1.2, 3.9);
const HOME_LOOK = new Vector3(0.15, 0.93, 0);
const ARRIVAL = new Vector3(-0.1, 1.2, 3.25);
const ARRIVAL_LOOK = new Vector3(-0.1, 0.95, 0);

function World(props: Props) {
  const { camera, gl, size } = useThree();
  const home = useMemo(() => new Vector3(HOME.x, HOME.y, Math.max(HOME.z, HOME.z * 1.12 / (size.width / size.height))), [size.width, size.height]);
  const arrival = useMemo(() => new Vector3(ARRIVAL.x, ARRIVAL.y, home.z * (ARRIVAL.z / HOME.z)), [home]);
  const { asset, animation, onEvent, onStatus, onAnimationStatus } = props;
  const controls = useRef<Controls>(null);
  const rig = useRef<RigController | null>(null);
  const [model, setModel] = useState<VRM | null>(null);
  const orb = useRef<Mesh>(null);
  const clock = useRef({ time: 0, frames: [] as number[], reported: 0, loadMs: 0, palmError: 0, blinkPeak: 0 });
  const orbPosition = useRef(MEMORY.clone());
  const phase = useRef("");
  const origin = useRef(MEMORY.clone());
  const sent = useRef(new Set<string>());

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let loaded: VRM | null = null;
    const start = performance.now();
    const timeout = setTimeout(() => abort.abort(), 30_000);
    onStatus({ phase: "loading", message: "正在读取并校验 VRM 1.0 骨骼模型…" });
    onEvent({ type: "MODEL_LOADING" });
    const load = async () => {
      try {
        const response = await fetch(asset.url, { signal: abort.signal });
        if (!response.ok) throw new Error(`模型请求失败（HTTP ${response.status}）。`);
        if (Number(response.headers.get("content-length")) > 35 * 1024 * 1024) throw new Error("模型超过 35 MB 实验上限。");
        const buffer = await response.arrayBuffer();
        inspectLabGlb(buffer, "model");
        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));
        const gltf = await loader.parseAsync(buffer, "");
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) { VRMUtils.deepDispose(gltf.scene); throw new Error("未解析到 VRM 人形模型。"); }
        loaded = vrm;
        for (const name of ["hips", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm"] as const) {
          if (!vrm.humanoid.getNormalizedBoneNode(name)) throw new Error(`缺少动作必需骨骼：${name}`);
        }
        if (!vrm.lookAt || !vrm.expressionManager?.getExpression("blink")) throw new Error("模型需要 LookAt 和 blink 表情。");
        if (abort.signal.aborted || !active) { VRMUtils.deepDispose(vrm.scene); loaded = null; return; }
        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        const bounds = new Box3().setFromObject(vrm.scene);
        const height = bounds.max.y - bounds.min.y;
        if (height < 0.1 || !Number.isFinite(height)) throw new Error("模型尺寸无效。");
        const scale = asset.height / height;
        vrm.scene.scale.setScalar(scale);
        vrm.scene.position.set(-0.7, -bounds.min.y * scale, 0);
        vrm.scene.traverse(object => { object.frustumCulled = false; });
        const controller = new RigController(vrm, asset.palmOffset);
        rig.current = controller;
        setModel(vrm);
        clock.current.loadMs = performance.now() - start;
        onStatus({ phase: "ready", message: "VRM 1.0 已就绪 · 骨骼 / 表情 / LookAt / 弹簧骨", loadMs: clock.current.loadMs });
        onEvent({ type: "MODEL_READY" });
      } catch (error) {
        if (loaded) { VRMUtils.deepDispose(loaded.scene); loaded = null; }
        if (!active) return;
        onStatus({ phase: "error", message: abort.signal.aborted ? "模型加载超时或已取消，请重试。" : error instanceof Error ? error.message : "模型加载失败。" });
      } finally { clearTimeout(timeout); }
    };
    void load();
    return () => {
      active = false; abort.abort(); clearTimeout(timeout);
      rig.current?.dispose(); rig.current = null;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [asset, onEvent, onStatus]);

  useEffect(() => {
    if (!animation || !model || !rig.current) return;
    let active = true;
    const controller = rig.current;
    const load = async () => {
      try {
        inspectLabGlb(animation!.buffer, "animation");
        const loader = new GLTFLoader();
        loader.register(parser => new VRMAnimationLoaderPlugin(parser));
        const result = await loader.parseAsync(animation!.buffer, "");
        const vrmAnimation = result.userData.vrmAnimations?.[0];
        if (!vrmAnimation) throw new Error("VRMA 没有可播放动作。");
        if (active) { controller.playImported(createVRMAnimationClip(vrmAnimation, model)); onAnimationStatus("本地 VRMA 正在通过 AnimationMixer 播放；取消可返回实验动作。"); }
        VRMUtils.deepDispose(result.scene);
      } catch (error) { if (active) onAnimationStatus(error instanceof Error ? error.message : "VRMA 加载失败。"); }
    };
    void load();
    return () => { active = false; controller.stopImported(); };
  }, [animation, model, onAnimationStatus]);

  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onEvent({ type: "MODEL_LOADING" }); onStatus({ phase: "error", message: "WebGL 上下文已丢失，请重新加载模型/场景。档案未被修改。" }); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onStatus, onEvent]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = clock.current; c.time += dt;
    const controller = rig.current;
    if (!controller || !props.snapshot.ready) return;
    const s = props.snapshot;
    const signature = `${s.run}:${s.state}`;
    if (signature !== phase.current) {
      phase.current = signature; sent.current.clear();
      origin.current.copy(orbPosition.current);
    }
    const elapsed = controller.update(dt, s, PLANET, props.memory ? orbPosition.current : null, camera.position, props.reduced);
    c.blinkPeak = Math.max(c.blinkPeak, controller.vrm.expressionManager?.getValue("blink") ?? 0);
    const emit = (type: "GAZE_SETTLED" | "GESTURE_READY" | "CAMERA_ARRIVED" | "WELCOME_FINISHED" | "SEARCH_RESOLVED" | "ORB_IN_PALM") => { if (!sent.current.has(type)) { sent.current.add(type); onEvent({ type, run: s.run }); } };
    const speed = props.reduced ? 20 : 3.5;
    if (controls.current) controls.current.enabled = s.state === "idle" && elapsed > 2;
    if (s.state === "attention" && elapsed > (props.reduced ? 0.25 : 1.15) && controller.gazeError < 0.04) emit("GAZE_SETTLED");
    if (s.state === "pointing" && elapsed > (props.reduced ? 0.3 : 1.35)) emit("GESTURE_READY");
    if (s.state === "guiding") {
      camera.position.lerp(arrival, 1 - Math.exp(-dt * speed));
      controls.current?.target.lerp(ARRIVAL_LOOK, 1 - Math.exp(-dt * speed));
      camera.lookAt(controls.current?.target ?? ARRIVAL_LOOK);
      if (camera.position.distanceTo(arrival) < 0.008 && elapsed > 0.35) emit("CAMERA_ARRIVED");
    } else if (s.state === "attention" || s.state === "thinking" || (s.state === "idle" && s.intent === null && elapsed < 2)) {
      camera.position.lerp(home, 1 - Math.exp(-dt * speed));
      controls.current?.target.lerp(HOME_LOOK, 1 - Math.exp(-dt * speed));
      camera.lookAt(controls.current?.target ?? HOME_LOOK);
    }
    if (s.state === "arrived" && elapsed > (props.reduced ? 0.6 : 2.5)) emit("WELCOME_FINISHED");
    if (s.state === "thinking" && elapsed > (props.reduced ? 0.25 : 1.1)) emit("SEARCH_RESOLVED");
    if (props.memory && (s.state === "summoning" || s.state === "presenting")) {
      const t = props.reduced ? MathUtils.smoothstep(elapsed, 0, 0.35) : MathUtils.smoothstep(elapsed, 0.6, 2.8);
      if (s.state === "presenting") orbPosition.current.copy(controller.palm);
      else {
        orbPosition.current.lerpVectors(origin.current, controller.palm, t);
        orbPosition.current.y += Math.sin(t * Math.PI) * 0.27;
        if (t >= 1 && orbPosition.current.distanceTo(controller.palm) < 0.01) emit("ORB_IN_PALM");
      }
      c.palmError = orbPosition.current.distanceTo(controller.palm);
    } else { orbPosition.current.copy(MEMORY); c.palmError = 0; }
    if (orb.current) {
      orb.current.position.copy(orbPosition.current);
      if (!props.reduced) orb.current.rotation.y += dt * 0.22;
    }
    c.frames.push(delta * 1000);
    if (c.frames.length > 240) c.frames.shift();
    if (c.time - c.reported > 1) {
      c.reported = c.time;
      const sorted = [...c.frames].sort((a, b) => a - b);
      const mean = c.frames.reduce((a, b) => a + b, 0) / c.frames.length;
      props.onMetrics({
        fps: Math.round(1000 / mean), frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures,
        loadMs: c.loadMs, palmError: c.palmError,
        hand: controller.hand.toArray() as Vec3, orb: orbPosition.current.toArray() as Vec3, camera: camera.position.toArray() as Vec3,
        bodyYaw: controller.vrm.scene.rotation.y, headYaw: controller.vrm.humanoid.getNormalizedBoneNode("head")!.rotation.y,
        chestPitch: controller.vrm.humanoid.getNormalizedBoneNode("chest")?.rotation.x ?? 0,
        gazeError: controller.gazeError, blinkPeak: c.blinkPeak,
      });
      c.blinkPeak = 0;
    }
  });

  return <>
    <color attach="background" args={["#050912"]} />
    <ambientLight intensity={0.65} color="#b6c8e6" />
    <directionalLight position={[-2, 4, 5]} intensity={1.4} color="#fff1df" />
    <directionalLight position={[3, 2, -2]} intensity={1.5} color="#6f9dd9" />
    <pointLight position={[-2, 1, 1]} intensity={0.5} color="#b7b7ff" />
    <StarField low />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
      <circleGeometry args={[3.5, 96]} /><meshStandardMaterial color="#101c2d" roughness={0.65} metalness={0.3} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.7, -0.009, 0]}>
      <ringGeometry args={[0.66, 0.67, 96]} /><meshBasicMaterial color="#8abfe7" transparent opacity={0.45} />
    </mesh>
    {model && <primitive object={model.scene} dispose={null} />}
    {!props.planet && <mesh position={PLANET}><octahedronGeometry args={[0.045]} /><meshBasicMaterial color="#aac6e8" wireframe /></mesh>}
    {props.planet && <PlanetMesh appearance={{ ...props.planet.appearance, size: 0.32 }} position={PLANET.toArray() as Vec3} low={props.low} reducedMotion={props.reduced} />}
    {props.memory && <mesh ref={orb} position={MEMORY}>
      <sphereGeometry args={[0.105, 32, 24]} />
      <meshStandardMaterial color={new Color("#8dbdfb")} emissive="#435fac" emissiveIntensity={0.65} roughness={0.18} metalness={0.25} />
      <mesh rotation={[Math.PI / 2.5, 0, 0]}><torusGeometry args={[0.145, 0.006, 8, 56]} /><meshBasicMaterial color="#c9ddff" /></mesh>
      <pointLight color="#93bcff" intensity={0.12} distance={0.6} />
    </mesh>}
    <OrbitControls ref={controls} target={HOME_LOOK} enabled={false} enablePan={false} minDistance={2.1} maxDistance={Math.max(5.5, home.z * 1.3)} maxPolarAngle={Math.PI / 2} />
  </>;
}

class LabBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="alert" className="lab-render-error">3D 场景无法运行。请确认浏览器启用了 WebGL，再刷新实验页。原始档案未被修改。</div> : this.props.children; }
}

export default function LabScene(props: Props) {
  return <LabBoundary><Canvas camera={{ position: HOME.toArray(), fov: 34, near: 0.05, far: 300 }} dpr={props.low ? 1 : [1, 1.5]} gl={{ antialias: !props.low, preserveDrawingBuffer: true }} fallback={<div role="alert">WebGL 不可用，无法验证 3D 动作。可以返回原有档案页面。</div>}>
    <World {...props} />
  </Canvas></LabBoundary>;
}
