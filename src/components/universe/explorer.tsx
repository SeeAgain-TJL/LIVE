"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ChevronRight, CircleHelp, Compass, Download, Focus, Globe2, List, LockKeyhole, Maximize, Orbit, Plus, Search, Settings2, Sparkles, X } from "lucide-react";
import type { Planet, Quality } from "@/domain/types";
import { isPersonalPlanet, matchesYear, periodLabel, planetName, PLANET_TYPES } from "@/domain/planet";
import { useUniverse } from "@/components/providers/universe-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { StorageState } from "@/components/ui/storage-state";
import { searchPlanets } from "@/domain/exploration";
import { useGuide } from "@/components/guide/guide-provider";
import { galaxyCameraKey } from "@/data/local-repository";
import { usePlanetJourney } from "./use-planet-journey";
import { TravelModeSelect } from "./travel-mode-select";
import { useCosmicQuality, useTravelMode } from "@/components/three/use-render-preferences";

const Scene = dynamic(() => import("@/components/three/universe-scene"), { ssr: false, loading: () => <div className="scene-loading"><Orbit size={28} className="slow-spin" /><span>正在点亮星空</span></div> });

export function UniverseExplorer({ galaxyId }: { galaxyId: string }) {
  const { data, ready, error, exportData } = useUniverse();
  const { setPlanetPreview } = useGuide();
  const router = useRouter();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("planet"));
  const [returnPlanetId] = useState(params.get("returnFrom"));
  const { phase, locked, flight, sceneAvailable, fly: requestFlight, cancel, approach, arrive, overview, returned, unavailable } = usePlanetJourney(!!returnPlanetId);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [showList, setShowList] = useState(false);
  const [editor, setEditor] = useState<"new" | Planet | null>(null);
  const [dialog, setDialog] = useState<"help" | "settings" | null>(null);
  const [quality, setQuality] = useCosmicQuality();
  const [travelMode, setTravelMode] = useTravelMode();
  const [showOrbits, setShowOrbits] = useState(true);
  const [newPlanetId, setNewPlanetId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [cinemaMode, setCinemaMode] = useState(false);
  const handledTravel = useRef("");
  useEffect(() => { setPlanetPreview(!!selectedId && !locked); return () => setPlanetPreview(false); }, [selectedId, locked, setPlanetPreview]);
  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
      const element = event.target as HTMLElement;
      if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) return;
      event.preventDefault(); setShowList(true);
      requestAnimationFrame(() => document.getElementById("planet-search")?.focus());
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const selectPlanet = useCallback((id: string) => {
    if (locked) return;
    setSelectedId(id);
    if (window.matchMedia("(max-width: 760px)").matches) setShowList(false);
  }, [locked]);
  const fly = useCallback((id: string, enter = false) => {
    if (locked) return;
    if (!enter) setSelectedId(id);
    if (window.matchMedia("(max-width: 760px)").matches) setShowList(false);
    requestFlight(id, enter);
  }, [locked, requestFlight]);
  const returnComplete = useCallback(() => {
    returned();
    // Consume a transient query synchronously. A delayed router.replace here could
    // override a newer user navigation (e.g. returning immediately to the universe).
    const path = `/galaxy/${encodeURIComponent(galaxyId)}`;
    if (returnPlanetId && window.location.pathname === path && new URLSearchParams(window.location.search).get("returnFrom") === returnPlanetId) {
      window.history.replaceState(null, "", `${path}?planet=${encodeURIComponent(returnPlanetId)}`);
    }
  }, [returned, returnPlanetId, galaxyId]);
  const travelPlanet = params.get("travelPlanet");
  const trip = params.get("trip") ?? "";
  useEffect(() => {
    if (!data || !travelPlanet) return;
    const key = `${travelPlanet}/${trip}`;
    if (handledTravel.current === key) return;
    const frame = requestAnimationFrame(() => {
      handledTravel.current = key;
      const target = data.planets.find(p => p.id === travelPlanet && p.galaxyId === galaxyId);
      if (target) { window.history.replaceState(null, "", `/galaxy/${encodeURIComponent(galaxyId)}?planet=${encodeURIComponent(target.id)}`); fly(target.id, true); }
      else setNotice("目标星球已移动或不存在，请重新选择。");
    });
    return () => cancelAnimationFrame(frame);
  }, [data, travelPlanet, trip, galaxyId, fly, router]);
  if (!ready || error || !data) return <StorageState />;
  const galaxy = data.galaxies.find(g => g.id === galaxyId);
  if (!galaxy) return <main className="storage-state"><h1>没有找到这片星系</h1><Link href="/" className="button">返回宇宙</Link></main>;
  const allGalaxyPlanets = data.planets.filter(p => p.galaxyId === galaxyId);
  const planets = allGalaxyPlanets.filter(p => isPersonalPlanet(p, data.memories));
  const examples = allGalaxyPlanets.filter(p => !isPersonalPlanet(p, data.memories));
  const selected = planets.find(p => p.id === selectedId) ?? null;
  const filtered = searchPlanets(planets, data.memories, query).filter(p => !year || matchesYear(p, Number(year)));
  const personalCount = planets.length;
  const selectedGalaxy = data.galaxies.find(g => g.id === selected?.galaxyId);
  return <main className={`universe-shell galaxy-planet-shell ${phase === "transition" ? "is-entering" : ""} ${cinemaMode ? "is-cinema" : ""}`} data-journey-phase={phase} data-hud-mode={cinemaMode ? "cinema" : "explore"} aria-busy={locked}>
    <div className="cosmic-backdrop" aria-hidden="true" />
    <div className="universe-canvas" aria-label="三维人生宇宙。单击星球自动进入，拖动旋转；列表可查看资料或直接访问档案。"><Scene key={galaxyId} galaxyId={galaxyId} returnPlanetId={returnPlanetId} locked={locked} planets={planets} bookmarkKey={galaxyCameraKey(galaxyId)} selectedId={selectedId} flight={flight} onEnter={id => fly(id, true)} onArrival={arrive} onApproach={approach} onReturned={returnComplete} onUnavailable={unavailable} quality={quality} travelMode={travelMode} showOrbits={showOrbits} newPlanetId={newPlanetId} onCreateVacancy={() => { if (!locked) setEditor("new"); }} /></div>
    <div className="screen-vignette" aria-hidden="true" />
    {planets.length === 0 && <div className="empty-galaxy-hud" role="status"><span className="eyebrow">UNCLAIMED ORBITS</span><strong>这片星系还没有你的星球</strong><p>场景中的虚线星位只是未来的位置，不是已经存在的记忆。</p><button className="button secondary" onClick={() => setEditor("new")}><Plus size={14} />创建第一颗星球</button></div>}
    <header className="topbar"><Link href="/" className="brand" aria-label="UNIVERSE OF ME 首页"><span className="brand-mark"><Orbit size={25} strokeWidth={1.2} /></span><span>UNIVERSE <em>OF</em> ME<small>A LIFETIME, IN ORBIT</small></span></Link><div className="topbar-center"><span className="live-dot" />私人宇宙<span className="topbar-divider" />本地开发版</div><div className="topbar-actions"><button className="hud-mode-toggle" aria-pressed={cinemaMode} onClick={() => setCinemaMode(value => !value)}>{cinemaMode ? "返回探索界面" : "电影模式"}</button><IconButton label="探索指南" disabled={locked} onClick={() => setDialog("help")}><CircleHelp size={18} /></IconButton><IconButton label="渲染与数据设置" disabled={locked} onClick={() => setDialog("settings")}><Settings2 size={18} /></IconButton><button className="button create-top" disabled={locked} onClick={() => setEditor("new")}><Plus size={15} />创建星球</button></div></header>
    <section className="intro"><nav className="exploration-breadcrumb" aria-label="探索路径"><Link href="/">宇宙</Link><ChevronRight size={15} /><span>{galaxy.name}</span></nav><h1>{galaxy.name}</h1><p className="intro-copy">这里有 {planets.length} 颗星球。<br />走近一颗，重访属于它的时光。</p></section>
    <aside className={`planet-library ${showList ? "is-open" : "is-closed"}`} inert={!showList || cinemaMode} aria-label="星球检索与列表"><div className="library-heading"><span>我的星球 <small>{String(personalCount).padStart(2, "0")}</small></span><span className="demo-count">{examples.length ? `${examples.length} 个待赋予意义` : ""}</span></div><label className="search-box"><Search size={15} /><input id="planet-search" aria-label="搜索星球" value={query} placeholder="寻找一段时光…" onChange={e => setQuery(e.target.value)} />{query && <button className="clear-search" aria-label="清除搜索" onClick={() => setQuery("")}><X size={13} /></button>}<kbd>/</kbd></label><div className="filter-row"><span className="current-galaxy-label">{galaxy.name}</span><input type="number" min="1" max="9999" aria-label="按年份查找" placeholder="按年份查找" value={year} onChange={e => setYear(e.target.value)} /></div>
      <div className="planet-list">{filtered.map(planet => <button key={planet.id} className={`planet-list-item ${selectedId === planet.id ? "selected" : ""}`} disabled={locked} title="查看星球资料" onClick={() => selectPlanet(planet.id)}><span className={`planet-dot ${planet.appearance.rings ? "has-ring" : ""}`} style={{ "--planet-color": planet.appearance.color } as React.CSSProperties} /><span className="list-planet-text"><strong>{planetName(planet)}</strong><small>{planet.isDemo ? `${PLANET_TYPES.find(t => t.value === planet.appearance.type)?.label}星球 · 外观示例` : periodLabel(planet)}</small></span><ChevronRight size={14} /></button>)}{filtered.length === 0 && <div className="list-empty"><Search size={20} /><p>{planets.length ? "还没有找到这段时光" : "这片星系还没有记忆星球，可以创建第一颗。场景中的环境天体与碎片带不包含记忆档案。"}</p><button className="text-button" onClick={() => { setQuery(""); setYear("");  }}>清除筛选</button></div>}</div>
      <button className="library-create" disabled={locked} onClick={() => setEditor("new")}><Plus size={15} /><span>为下一段人生，留一个位置</span><ArrowRight size={14} /></button>{examples.length > 0 && <details className="example-library"><summary>外观示例（未计入我的星球）</summary><div>{examples.map(example => <Link key={example.id} href={'/planet/' + example.id}>{planetName(example)} · 编辑后加入我的星球</Link>)}</div></details>}
    </aside>
    <div className="orbit-caption" aria-hidden="true"><span>EXPLORATION / 001</span><i /><span>EVERY WORLD HAS A STORY</span></div>
    {selected && !locked && <aside className="selection-card" aria-label="选中星球"><div className="selection-top"><button type="button" className="icon-button selection-close" aria-label="关闭星球预览" onClick={() => setSelectedId(null)}><X size={15} /></button><span className="eyebrow">{selected.isDemo ? "DEMO PLANET" : "SELECTED WORLD"}</span><span className="selection-number">{String(data.planets.indexOf(selected) + 1).padStart(2, "0")}</span></div><div className="selection-orbit" style={{ "--planet-color": selected.appearance.color } as React.CSSProperties}><Globe2 size={24} strokeWidth={1} /><span>{PLANET_TYPES.find(t => t.value === selected.appearance.type)?.label}星球</span></div><h2>{planetName(selected)}</h2><p className="selection-period">{periodLabel(selected)}</p><p className="selection-description">{selected.isDemo ? "一颗等待被赋予意义的星球。试着靠近它，或亲手写下属于你的名字。" : selected.description || "每一颗星球，都从一个值得珍藏的瞬间开始。"}</p><div className="selection-meta"><span>{selectedGalaxy?.name || "未归类星系"}</span><span>{data.memories.filter(m => m.planetId === selected.id).length} 条记忆</span></div><button className="button enter-button" onClick={() => fly(selected.id, true)}>进入记忆空间<ArrowRight size={16} /></button><div className="selection-links"><button className="text-button" disabled={!sceneAvailable} onClick={() => fly(selected.id)}><Focus size={13} />靠近星球</button><button className="text-button" onClick={() => setEditor(selected)}>编辑星球<ChevronRight size={12} /></button></div><Link href={`/planet/${selected.id}`} className="accessible-archive-link">直接打开档案 ↗</Link></aside>}
    <div className="galaxy-back-navigation"><Link href="/">← 返回宇宙星系</Link></div><div className="scene-tools"><IconButton label="返回星系全景" disabled={locked || !sceneAvailable} onClick={overview}><Maximize size={18} /></IconButton><span /><IconButton label={showList ? "收起星球列表" : "展开星球列表"} active={showList} onClick={() => setShowList(v => !v)}><List size={18} /></IconButton></div>
    <footer className="explorer-footer"><div className="mode-indicator"><Compass size={17} /><span>自由探索</span><span className="mode-tag">FREE EXPLORATION</span></div><div className="navigation-help"><span>拖动 <small>旋转视角</small></span><i /><span>滚轮 / 双指 <small>缩放</small></span><i /><span>单击星球 <small>自动进入</small></span></div><div className="coordinates"><span className="live-dot" />{selected ? selected.position.map(n => n.toFixed(1)).join(" / ") : "0.0 / 0.0 / 0.0"}<ArrowDownLeft size={13} /></div></footer>
    <div className="local-disclaimer"><LockKeyhole size={11} />本地演示 · 数据仅保存在此浏览器，请定期导出备份</div>
    {editor && <PlanetEditor planet={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} defaultGalaxyId={galaxyId} onSaved={(id, savedGalaxyId) => { if (savedGalaxyId !== galaxyId) { router.push(`/galaxy/${encodeURIComponent(savedGalaxyId)}?planet=${encodeURIComponent(id)}`); setEditor(null); return; } setEditor(null); setSelectedId(id); setNewPlanetId(id); setQuery(""); setYear("");  requestFlight(id); if (window.matchMedia("(max-width: 760px)").matches) setShowList(false); }} />}
    {dialog === "help" && <Modal title="跟随引力，开始探索" eyebrow="A SMALL GUIDE TO YOUR UNIVERSE" onClose={() => setDialog(null)}><div className="guide-content"><div><Compass /><p><strong>自由探索</strong>拖动空白区域旋转视角，滚轮或双指缩放。触屏可用双指平移。</p></div><div><Focus /><p><strong>靠近一段人生</strong>单击 3D 星球自动飞近并进入；拖动不会进入，飞行中按 Escape 取消。</p></div><div><Orbit /><p><strong>重访记忆</strong>左侧列表查看星球资料，或直接打开档案；返回时恢复所属星系与进入前的视角。</p></div><div><Sparkles /><p><strong>宇宙从你开始</strong>初始的五颗均为未命名外观示例。创建或编辑星球，由你决定名字、时间和意义。</p></div></div></Modal>}
    {dialog === "settings" && <Modal title="让探索适合你" eyebrow="PREFERENCES & LOCAL DATA" onClose={() => setDialog(null)}><div className="settings-content"><TravelModeSelect value={travelMode} onChange={setTravelMode} /><p>舒适模式固定视场、放慢靠近并停稳后自动进入；系统减少动态偏好优先。</p><label className="field">渲染质量<select value={quality} onChange={e => setQuality(e.target.value as Quality)}><option value="auto">自动 · 手机与低核心设备使用简化渲染</option><option value="high">高质量 · 更细腻的球面与星空</option><option value="medium">中质量 · 平衡星尘密度与分辨率</option><option value="low">简化 · 降低分辨率、面数与恒星数量</option></select></label><label className="field"><span><input type="checkbox" checked={showOrbits} onChange={e => setShowOrbits(e.target.checked)} /> 显示三维轨道</span></label><p>系统会遵循设备的「减少动态效果」偏好，关闭自转并缩短镜头过渡。</p><hr /><h3>你的记忆，属于你</h3><p>当前为开发阶段本地存储，尚未接入账号、加密、数据库或云端同步。清理浏览器数据会移除记录。请勿将此版本作为重要记忆的唯一副本。</p><button className="button secondary" onClick={() => { try { exportData(); setNotice("已生成 JSON 备份，包含资料与媒体元数据，不含媒体原文件。"); } catch (e) { setNotice((e as Error).message); } }}><Download size={15} />导出档案元数据</button>{notice && <p role="status" className="export-notice">{notice}</p>}<small>格式：JSON v2 · 不包含 IndexedDB 媒体 Blob，请单独备份原文件。</small></div></Modal>}
    {locked && <div className="planet-journey-status" role="status"><span>{phase === "returning" ? "正在回到星球外部" : phase === "cancelling" ? "正在恢复探索视角" : phase === "transition" ? "正在进入记忆殿堂" : "正在靠近星球"}</span>{phase !== "returning" && phase !== "cancelling" && <button onClick={cancel}>取消进入 · ESC</button>}</div>}
    <div className="entry-transition" aria-hidden="true"><Orbit size={32} /><span>正在进入记忆的引力场</span></div>
  </main>;
}
