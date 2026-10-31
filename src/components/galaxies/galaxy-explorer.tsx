"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Orbit, Plus, Search } from "lucide-react";
import { useUniverse } from "@/components/providers/universe-provider";
import { useGuide, useGuideTravelScope } from "@/components/guide/guide-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { StorageState } from "@/components/ui/storage-state";
import { Modal } from "@/components/ui/modal";
import { DEFAULT_GALAXY } from "@/domain/galaxy";
import type { GalaxyFlight } from "@/components/three/galaxy-scene";
import { useCosmicQuality, useTravelMode } from "@/components/three/use-render-preferences";
import { markGalaxyArrival } from "@/data/cosmic-preferences";
import { TravelModeSelect } from "@/components/universe/travel-mode-select";
import type { Quality } from "@/domain/types";
import { isPersonalPlanet } from "@/domain/planet";

const Scene = dynamic(() => import("@/components/three/galaxy-scene"), { ssr: false, loading: () => <div className="scene-loading">正在展开星系…</div> });

export function GalaxyExplorer() {
  const { data, ready, error, exportData } = useUniverse();
  const { cue } = useGuide();
  useGuideTravelScope();
  const router = useRouter();
  const params = useSearchParams();
  const [flight, setFlight] = useState<GalaxyFlight | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useCosmicQuality();
  const [travelMode, setTravelMode] = useTravelMode();
  const [transition, setTransition] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const committed = useRef(false);
  const activeFlight = useRef(false);
  const cancelFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const handled = useRef("");
  const pendingPlanet = useRef<string | null>(null);
  const restored = useCallback(() => {
    if (cancelFallback.current) clearTimeout(cancelFallback.current);
    cancelFallback.current = null; activeFlight.current = false;
  }, []);
  const travelGalaxy = params.get("travelGalaxy");
  const travelPlanet = params.get("travelPlanet");
  const trip = params.get("trip") ?? "";
  useEffect(() => {
    if (!flight) return;
    router.prefetch(`/galaxy/${encodeURIComponent(flight.id)}`);
    // Load the existing planet scene during the 2.8s approach, not after route change.
    void import("@/components/three/universe-scene").catch(() => { /* Route retains its loading/failure UI. */ });
  }, [flight, router]);
  const cancel = useCallback(() => {
    if (committed.current) return;
    pendingPlanet.current = null;
    // Keep navigation locked until the camera has returned from cancellation.
    // Also release a lost/unavailable Canvas; it cannot send a completion event.
    if (cancelFallback.current) clearTimeout(cancelFallback.current);
    cancelFallback.current = setTimeout(restored, 3000);
    setFlight(null); setTransition(false);
  }, [restored]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && activeFlight.current) { e.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); if (cancelFallback.current) clearTimeout(cancelFallback.current); };
  }, [cancel]);
  useEffect(() => {
    if (travelGalaxy || travelPlanet || flight) return;
    const frame = requestAnimationFrame(() => cue("universeWelcome"));
    return () => cancelAnimationFrame(frame);
  }, [travelGalaxy, travelPlanet, flight, cue]);
  useEffect(() => {
    if (!data || (!travelGalaxy && !travelPlanet)) return;
    const key = `${travelGalaxy}/${travelPlanet}/${trip}`;
    if (handled.current === key) return;
    // URL changes are navigation commands; start after the incoming scene has mounted.
    const frame = requestAnimationFrame(() => {
      handled.current = key;
      const planet = data.planets.find(p => p.id === travelPlanet);
      const target = planet?.galaxyId ?? travelGalaxy;
      if (!target || !data.galaxies.some(g => g.id === target)) { setNotice("这个目的地已不存在，请重新选择。"); return; }
      pendingPlanet.current = planet?.id ?? null;
        activeFlight.current = true; setTransition(false);
      cue("galaxyDeparture"); setFlight({ id: target, nonce: ++sequence.current });
      // Consume commands so browser Back / reload does not start the trip again.
      window.history.replaceState(null, "", "/");
    });
    return () => cancelAnimationFrame(frame);
  }, [data, travelGalaxy, travelPlanet, trip, router, cue]);
  const arrive = useCallback((id: string) => {
    if (!activeFlight.current || committed.current) return;
    committed.current = true;
    const planet = pendingPlanet.current;
    setTransition(true);
    markGalaxyArrival(id); cue("galaxyArrived");
    router.push(`/galaxy/${encodeURIComponent(id)}${planet ? `?travelPlanet=${encodeURIComponent(planet)}&trip=${Date.now()}` : ""}`);
  }, [router, cue]);
  if (!ready || error || !data) return <StorageState />;
  const counts = Object.fromEntries(data.galaxies.map(g => [g.id, data.planets.filter(p => p.galaxyId === g.id && isPersonalPlanet(p, data.memories)).length]));
  const enter = (id: string) => { if (activeFlight.current) return; activeFlight.current = true; pendingPlanet.current = null; cue("galaxyDeparture"); setFlight({ id, nonce: ++sequence.current }); };
  return <main className={`universe-shell galaxy-universe-shell ${transition ? "galaxy-crossing" : ""} ${cinemaMode ? "is-cinema" : ""} ${libraryOpen ? "is-library-open" : "is-library-collapsed"}`} data-hud-mode={cinemaMode ? "cinema" : "explore"} data-galaxy-flight={flight ? transition ? "crossing" : "flying" : "idle"}>
    <div className="cosmic-backdrop" /><div className="universe-canvas" aria-label="宇宙中的三维星系"><Scene galaxies={data.galaxies} counts={counts} flight={flight} quality={quality} travelMode={travelMode} onEnter={enter} onArrival={arrive} onRestored={restored} /></div><div className="screen-vignette" aria-hidden="true" />
    <div className="galaxy-crossing-veil" aria-hidden="true" />
    <div className="cosmic-controls"><button className="hud-mode-toggle" aria-pressed={cinemaMode} onClick={() => setCinemaMode(value => !value)}>{cinemaMode ? "返回探索界面" : "电影模式"}</button><button className="hud-library-toggle" aria-expanded={libraryOpen} aria-controls="galaxy-library" onClick={() => setLibraryOpen(value => !value)}>{libraryOpen ? "收起导航" : "打开导航"}</button><button disabled={!!flight} onClick={() => setSettingsOpen(true)}>设置与帮助</button></div>
    <header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><Orbit size={25} /></span><span>UNIVERSE <em>OF</em> ME<small>我的人生宇宙</small></span></Link><div className="galaxy-top-actions"><button className="text-button" onClick={() => { try { exportData(); setNotice("已导出 JSON 元数据；媒体原文件请单独备份。"); } catch (cause) { setNotice((cause as Error).message); } }}><Download size={16} />导出档案</button><button className="button" onClick={() => setCreating(true)}><Plus size={17} />创建星球</button></div></header>
    <section className="galaxy-intro"><p>宇宙 / 星系 / 星球 / 记忆</p><h1>人生的每一程，<br />都有自己的引力。</h1><p>先选择一片星系，再走近属于你的时光。<span className="galaxy-mobile-storage">本地开发版 · 资料仅保存在此浏览器</span></p></section>
    <aside id="galaxy-library" className="galaxy-library" aria-label="星系列表" aria-hidden={!libraryOpen || cinemaMode} inert={!libraryOpen || cinemaMode}><header><h2>我的星系</h2><span>{data.galaxies.length} 片星系</span></header><label className="galaxy-search"><Search size={18} /><input aria-label="搜索星系" value={query} placeholder="寻找一片星系" onChange={e => setQuery(e.target.value)} /></label>
      <div className="galaxy-list">{data.galaxies.filter(g => g.name.includes(query.trim())).map(g => <article key={g.id}><button onClick={() => enter(g.id)} aria-label={`进入星系：${g.name}`}><i style={{ background: g.color }} /><span><strong>{g.name}</strong><small>{counts[g.id]} 颗星球{counts[g.id] === 0 ? " · 等待你的故事" : ""}</small></span><ArrowRight size={17} /></button><Link href={`/galaxy/${encodeURIComponent(g.id)}`} aria-label={`直接打开星系：${g.name}`}>直接进入 ↗</Link></article>)}</div>
      {data.galaxies.filter(g => g.name.includes(query.trim())).length === 0 && <p role="status">没有找到这片星系。</p>}
    </aside>
    <div className="galaxy-navigation-hint">点击星系进入 · 拖动旋转 · 右键拖动平移 · 滚轮缩放</div>
    <p className={`galaxy-local-note ${notice ? "has-notice" : ""}`} role="status">{notice || "本地开发版 · 资料仅保存在此浏览器，请单独备份媒体原文件。"}</p>
    {flight && <div className="galaxy-flight-actions" role="status"><span>正在走近{data.galaxies.find(g => g.id === flight.id)?.name}</span><button onClick={cancel}>取消飞行 · ESC</button><button onClick={() => arrive(flight.id)}>跳过飞行，直接进入</button></div>}
    {settingsOpen && <Modal title="探索设置" eyebrow="UNIVERSE" onClose={() => setSettingsOpen(false)}><div className="settings-content"><label className="cosmic-quality">画质<select aria-label="宇宙渲染质量" value={quality} disabled={!!flight} onChange={e => setQuality(e.target.value as Quality)}><option value="auto">自动</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><TravelModeSelect value={travelMode} onChange={setTravelMode} disabled={!!flight} /><p>拖动观察，滚轮缩放，点击星系进入。飞行中 ESC 取消。</p><p>当前是浏览器本地开发版，导出 JSON 不包含媒体原文件。角色使用开发预览素材。</p></div></Modal>}
    {creating && <PlanetEditor defaultGalaxyId={DEFAULT_GALAXY.id} onClose={() => setCreating(false)} onSaved={(id, galaxyId) => { setCreating(false); router.push(`/galaxy/${encodeURIComponent(galaxyId)}?planet=${encodeURIComponent(id)}`); }} />}
  </main>;
}
