"use client";

/* eslint-disable react-hooks/immutability -- R3F owns the mutable camera and diagnostic WebGL canvas. */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { ACESFilmicToneMapping, DoubleSide, Mesh, Vector3 } from "three";

const target = new Vector3(0, 7.5, 0);
const views = { near: new Vector3(18, 9, 18), mid: new Vector3(37, 12, 37) };
type View = keyof typeof views;

type Variant = "original" | "previous" | "meshopt" | "lod10" | "lod03" | "lod01" | "sourceFir";
type AlphaMode = "blend" | "cut";

function Tree({ variant, alphaMode }: { variant: Variant; alphaMode: AlphaMode }) {
  const files: Record<Variant, string> = {
    original: "pine_02_unreduced.glb",
    previous: "pine-high.glb",
    meshopt: "pine_02_meshopt_webp.glb",
    lod10: "pine_02_lod10_webp.glb",
    lod03: "pine_02_lod03_webp.glb",
    lod01: "pine_02_lod01_webp.glb",
    sourceFir: "silver_fir_02-meshopt-webp.glb",
  };
  const gltf = useGLTF((variant === "sourceFir" ? "/forest-origin-assets/trees/" : "/forest-lab-assets/") + files[variant]);
  useMemo(() => {
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.name.includes("pine_twig") && !material.name.includes("fir_twig")) continue;
        material.transparent = alphaMode === "blend";
        material.alphaTest = alphaMode === "cut" ? 0.5 : 0;
        material.depthWrite = alphaMode === "cut";
        material.side = DoubleSide;
        material.needsUpdate = true;
      }
    });
  }, [gltf, alphaMode]);
  return <primitive object={gltf.scene} />;
}

function CameraAndMetrics({ view }: { view: View }) {
  const { camera, gl } = useThree();
  const control = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const samples = useRef<number[]>([]);
  const lastReport = useRef(0);
  useEffect(() => {
    camera.position.copy(views[view]);
    camera.lookAt(target);
    control.current?.target.copy(target);
    control.current?.update();
  }, [camera, view]);
  useFrame((_, delta) => {
    samples.current.push(delta * 1000);
    if (samples.current.length > 120) samples.current.shift();
    const now = performance.now();
    if (now - lastReport.current < 1000) return;
    const values = [...samples.current].sort((a, b) => a - b);
    const medianMs = values[Math.floor(values.length / 2)] ?? 0;
    const canvas = gl.domElement;
    canvas.dataset.singleTreeReady = "true";
    canvas.dataset.singleTreeMetrics = JSON.stringify({ fps: medianMs ? 1000 / medianMs : 0,
      medianMs, p95Ms: values[Math.floor(values.length * 0.95)] ?? 0,
      triangles: gl.info.render.triangles, calls: gl.info.render.calls,
      textures: gl.info.memory.textures, geometries: gl.info.memory.geometries });
    lastReport.current = now;
  });
  return <OrbitControls ref={control} target={target} minDistance={10} maxDistance={80} />;
}

export function SingleTreeLab() {
  const [view, setView] = useState<View>("near");
  const [variant, setVariant] = useState<Variant>("original");
  const [alphaMode, setAlphaMode] = useState<AlphaMode>("cut");
  return <main style={{ position: "fixed", inset: 0, background: "#8a9d9d" }}>
    <Canvas key={`${variant}-${alphaMode}`} camera={{ position: views.near.toArray(), fov: 35.6, near: 0.1, far: 180 }}
      dpr={1} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping }}>
      <color attach="background" args={["#8a9d9d"]} />
      <Environment files="/forest-lab-assets/sky.hdr" environmentIntensity={0.8} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[15, 28, 18]} intensity={2.1} />
      <Suspense fallback={null}><Tree variant={variant} alphaMode={alphaMode} /><CameraAndMetrics view={view} /></Suspense>
    </Canvas>
    <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8 }}>
      {(["near", "mid"] as const).map(value => <button key={value} type="button" onClick={() => setView(value)}
        aria-pressed={view === value} style={{ padding: "8px 12px", background: "#172421", color: "white", border: "1px solid #a9bdb0" }}>
        {value === "near" ? "近景" : "中景"}
      </button>)}
      {(["original", "meshopt", "sourceFir", "lod10", "lod03", "lod01", "previous"] as const).map(value => <button key={value} type="button" onClick={() => setVariant(value)}
        aria-pressed={variant === value} style={{ padding: "8px 12px", background: "#172421", color: "white", border: "1px solid #a9bdb0" }}>
        {value === "original" ? "完整原树" : value === "meshopt" ? "无减面压缩" : value === "sourceFir" ? "已固化冷杉" : value === "lod10" ? "受限简化 10%" : value === "lod03" ? "受限简化 3%" : value === "lod01" ? "受限简化 1%" : "旧减面导出"}
      </button>)}
      {(["cut", "blend"] as const).map(value => <button key={value} type="button" onClick={() => setAlphaMode(value)}
        aria-pressed={alphaMode === value} style={{ padding: "8px 12px", background: "#172421", color: "white", border: "1px solid #a9bdb0" }}>
        {value === "cut" ? "Alpha 裁切" : "Alpha 混合"}
      </button>)}
    </div>
  </main>;
}
