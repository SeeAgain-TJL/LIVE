"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useState, type CSSProperties } from "react";
import { Vector3 } from "three";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { PlanetMesh } from "@/components/three/planet-mesh";
import { exteriorReadiness } from "@/components/three/use-planet-textures";
import { deferredVisuals, presetAppearance, visualPresets } from "@/components/three/visual-library";
import { SceneBoundary } from "@/components/three/scene-boundary";

const tiers = [["high", "高"], ["medium", "中"], ["low", "低"]] as const;
const views = [["front", "正面", 24, 4.3], ["side", "侧面", 83, 4.3], ["back", "背光", 148, 4.3], ["near", "近景", 48, 2.6], ["far", "远景", 33, 10.2]] as const;
const light = [-6, 5, 6] as const;
const star = new Vector3(...light).normalize();
const up = new Vector3(.2, .08, 1);
const tangent = up.clone().addScaledVector(star, -up.dot(star)).normalize();
const kinds = { rocky: "岩石", ocean: "海洋", ice: "冰冻", gas: "气态", ringed: "星环" };
type View = typeof views[number][0];
type Status = "loading" | "ready" | "missing";

function Readiness({ onStatus }: { onStatus: (status: Status) => void }) {
  const current = useRef<Status>("loading");
  useFrame(({ gl }) => {
    const maps = exteriorReadiness(gl);
    const status = maps.failed > 0 ? "missing" : maps.targets && !maps.pending ? "ready" : "loading";
    if (current.current !== status) { current.current = status; onStatus(status); }
  });
  return null;
}

export function LibraryGallery() {
  const [index, setIndex] = useState(0);
  const [tier, setTier] = useState<RenderTier>("high");
  const [view, setView] = useState<View>("front");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const preset = visualPresets[index], appearance = presetAppearance(preset);
  const shot = views.find(v => v[0] === view) ?? views[0];
  const radians = shot[2] * Math.PI / 180;
  const distance = shot[3] * appearance.size * (preset.ring && view !== "near" ? 1.7 : 1);
  const camera = star.clone().multiplyScalar(Math.cos(radians)).addScaledVector(tangent, Math.sin(radians)).multiplyScalar(distance);
  const mode = status === "ready" ? "贴图已就绪" : status === "missing" ? "贴图不可用" : "正在加载贴图";

  return <main className="pvl" style={{ "--pvl-accent": preset.color } as CSSProperties}>
    <header className="pvl-header">
      <div><p className="pvl-kicker">UNIVERSE OF ME <span> / </span> EXTERIOR ATLAS</p><h1>星球视觉库 <sup>V1</sup></h1></div>
      <div className="pvl-index"><b>{String(visualPresets.length).padStart(2, "0")}</b> 种可探索外观<br /><span>展示样例 · 不含个人记忆</span></div>
    </header>
    <div className="pvl-layout">
      <section className="pvl-stage" aria-label="星球实时 3D 观测">
        <div className="pvl-viewport" data-visual-status={status} data-visual-tier={tier} data-visual-view={view}>
          <div className="pvl-stage-tag">ORBITAL VIEW <span> / </span> {shot[1]}<span> · </span>{mode}</div>
          <div className="pvl-cross" aria-hidden="true">+</div><div className="pvl-cross pvl-cross-right" aria-hidden="true">+</div>
          <SceneBoundary fallback={<div className="pvl-fallback">当前设备无法显示 3D，可继续浏览外观与资产来源。</div>}>
            <Canvas camera={{ position: camera.toArray(), fov: 39, near: .1, far: 100 }} dpr={[1, 1.5]}
              gl={{ alpha: true, antialias: true, powerPreference: "low-power" }} fallback={<div className="pvl-fallback">当前设备不支持 WebGL。</div>}>
              <ambientLight intensity={.20} color="#8d9db4" />
              <directionalLight position={[...light]} intensity={3} color="#fff1dd" />
              <PlanetMesh key={preset.id} appearance={appearance} tier={tier} lightPosition={[...light]} reducedMotion />
              <CameraView position={camera} revision={revision} />
              <Readiness key={preset.id + tier} onStatus={setStatus} />
            </Canvas>
          </SceneBoundary>
          {status === "missing" && <p className="pvl-fallback" role="status">当前档位的外观资产未能加载。可尝试切换档位或选择其他外观。</p>}
          <div className="pvl-stage-help">拖动旋转 · 滚轮缩放</div>
        </div>
        <div className="pvl-controls">
          <div role="group" aria-label="观测视角">{views.map(([id, title]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => { setView(id); setRevision(r => r + 1); }}>{title}</button>)}</div>
          <div role="group" aria-label="画质">{tiers.map(([id, title]) => <button type="button" key={id} aria-pressed={tier === id} onClick={() => { if (id !== tier) { setStatus("loading"); setTier(id); } }}>{title}</button>)}</div>
        </div>
        <div className="pvl-caption">
          <p className="pvl-kicker">ATLAS {String(index + 1).padStart(2, "0")} <span>/</span> {kinds[preset.type]}{preset.special ? " · 特色" : ""}</p>
          <h2>{preset.name}</h2><p>{preset.description}</p>
        </div>
      </section>
      <aside className="pvl-catalog" aria-label="外观目录">
        <p className="pvl-kicker">CATALOG <span>/</span> 外观目录</p>
        <ol>{visualPresets.map((item, i) => <li key={item.id}><button type="button" data-preset={item.id} aria-pressed={i === index} onClick={() => { if (i !== index) { setStatus("loading"); setIndex(i); setRevision(r => r + 1); } }}>
          <span className="pvl-number">{String(i + 1).padStart(2, "0")}</span><span className="pvl-dot" style={{ background: item.color }} /><strong>{item.name}</strong><span className="pvl-kind">{item.special ? "特色" : kinds[item.type]}</span>
        </button></li>)}</ol>
        <details><summary>暂未开放 · {deferredVisuals.length} 种特色外观</summary><dl>{deferredVisuals.map(([name, reason]) => <div key={name}><dt>{name}</dt><dd>{reason}</dd></div>)}</dl></details>
      </aside>
    </div>
    <footer className="pvl-credits">
      <span>地图经重组、调色或重新取样，用于原创外观。无机构背书。</span>
      <span><a href="https://www.solarsystemscope.com/textures/">Solar System Scope / INOVE</a>（<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>） · <a href="https://svs.gsfc.nasa.gov/4720/">Ernie Wright / NASA SVS</a> · <a href="https://maps.jpl.nasa.gov/tmaps/">JPL / Caltech / USGS；Don Davis（海王星插画）</a></span>
      <a href="/planet-visual-assets/v1/credits.json">逐项资产与使用条款</a>
    </footer>
  </main>;
}

function CameraView({ position, revision }: { position: Vector3; revision: number }) {
  const previous = useRef(-1);
  useFrame(({ camera, invalidate }) => {
    if (previous.current === revision) return;
    previous.current = revision;
    camera.position.copy(position);
    camera.lookAt(0, 0, 0);
    invalidate();
  }, -2);
  return <OrbitControls enablePan={false} minDistance={2.85} maxDistance={32} />;
}
