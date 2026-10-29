"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Orbit, Plus, Search } from "lucide-react";
import { useUniverse } from "@/components/providers/universe-provider";
import { useGuide } from "@/components/guide/guide-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { StorageState } from "@/components/ui/storage-state";
import { DEFAULT_GALAXY } from "@/domain/galaxy";
import type { GalaxyFlight } from "@/components/three/galaxy-scene";

const Scene = dynamic(() => import("@/components/three/galaxy-scene"), { ssr: false, loading: () => <div className="scene-loading">正在展开星系…</div> });

export function GalaxyExplorer() {
  const { data, ready, error, exportData } = useUniverse();
  const { say } = useGuide();
  const router = useRouter();
  const params = useSearchParams();
  const [flight, setFlight] = useState<GalaxyFlight | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const handled = useRef("");
  const pendingPlanet = useRef<string | null>(null);
  const travelGalaxy = params.get("travelGalaxy");
  const travelPlanet = params.get("travelPlanet");
  const trip = params.get("trip") ?? "";
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
      setFlight({ id: target, nonce: ++sequence.current });
      // Consume commands so browser Back / reload does not start the trip again.
      router.replace("/", { scroll: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, travelGalaxy, travelPlanet, trip, router]);
  const arrive = useCallback((id: string) => {
    const planet = pendingPlanet.current;
    say(planet ? "目标就在前面。我们继续靠近那颗星球。" : "已经到了。选一颗星球，看看里面的时光。") ;
    router.push(`/galaxy/${encodeURIComponent(id)}${planet ? `?travelPlanet=${encodeURIComponent(planet)}&trip=${Date.now()}` : ""}`);
  }, [router, say]);
  if (!ready || error || !data) return <StorageState />;
  const counts = Object.fromEntries(data.galaxies.map(g => [g.id, data.planets.filter(p => p.galaxyId === g.id).length]));
  const enter = (id: string) => { pendingPlanet.current = null; say("我们先去这片星系看看。"); setFlight({ id, nonce: ++sequence.current }); };
  return <main className="universe-shell galaxy-universe-shell">
    <div className="cosmic-backdrop" /><div className="universe-canvas" aria-label="宇宙中的三维星系"><Scene galaxies={data.galaxies} counts={counts} flight={flight} onEnter={enter} onArrival={arrive} /></div><div className="screen-vignette" aria-hidden="true" />
    <header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><Orbit size={25} /></span><span>UNIVERSE <em>OF</em> ME<small>我的人生宇宙</small></span></Link><div className="galaxy-top-actions"><button className="text-button" onClick={() => { try { exportData(); setNotice("已导出 JSON 元数据；媒体原文件请单独备份。"); } catch (cause) { setNotice((cause as Error).message); } }}><Download size={16} />导出档案</button><button className="button" onClick={() => setCreating(true)}><Plus size={17} />创建星球</button></div></header>
    <section className="galaxy-intro"><p>宇宙 / 星系 / 星球 / 记忆</p><h1>人生的每一程，<br />都有自己的引力。</h1><p>先选择一片星系，再走近属于你的时光。<span className="galaxy-mobile-storage">本地开发版 · 资料仅保存在此浏览器</span></p></section>
    <aside className="galaxy-library" aria-label="星系列表"><header><h2>我的星系</h2><span>{data.galaxies.length} 片星系</span></header><label className="galaxy-search"><Search size={18} /><input aria-label="搜索星系" value={query} placeholder="寻找一片星系" onChange={e => setQuery(e.target.value)} /></label>
      <div className="galaxy-list">{data.galaxies.filter(g => g.name.includes(query.trim())).map(g => <article key={g.id}><button onClick={() => enter(g.id)} aria-label={`进入星系：${g.name}`}><i style={{ background: g.color }} /><span><strong>{g.name}</strong><small>{counts[g.id]} 颗星球{counts[g.id] === 0 ? " · 等待你的故事" : ""}</small></span><ArrowRight size={17} /></button><Link href={`/galaxy/${encodeURIComponent(g.id)}`} aria-label={`直接打开星系：${g.name}`}>直接进入 ↗</Link></article>)}</div>
      {data.galaxies.filter(g => g.name.includes(query.trim())).length === 0 && <p role="status">没有找到这片星系。</p>}
    </aside>
    <div className="galaxy-navigation-hint">点击星系飞近并进入 · 拖动旋转 · 滚轮缩放</div>
    <p className={`galaxy-local-note ${notice ? "has-notice" : ""}`} role="status">{notice || "本地开发版 · 资料仅保存在此浏览器，请单独备份媒体原文件。"}</p>
    {flight && <button className="galaxy-skip-flight" onClick={() => arrive(flight.id)}>跳过飞行，直接进入</button>}
    {creating && <PlanetEditor defaultGalaxyId={DEFAULT_GALAXY.id} onClose={() => setCreating(false)} onSaved={(id, galaxyId) => { setCreating(false); router.push(`/galaxy/${encodeURIComponent(galaxyId)}?planet=${encodeURIComponent(id)}`); }} />}
  </main>;
}
