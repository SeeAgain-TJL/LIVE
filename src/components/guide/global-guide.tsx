"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import { ChevronDown, Compass, EyeOff, GripHorizontal, Search, Sparkles, X } from "lucide-react";
import { useUniverse } from "@/components/providers/universe-provider";
import { planetName } from "@/domain/planet";
import { travelUrl, type TravelTarget } from "@/domain/galaxy";
import { useGuide } from "./guide-provider";
import { GuidePortrait } from "./guide-portrait";
import type { GuideAction } from "@/domain/guide";

export function GlobalGuide() {
  const { data, ready, error } = useUniverse();
  const { binding, message, say, planetPreview, promptsEnabled, setPromptsEnabled } = useGuide();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [edge, setEdge] = useState<"left" | "right">("left");
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; left: number } | null>(null);
  const activePlanet = pathname.startsWith("/planet/");
  const autoCompact = planetPreview || (activePlanet && binding?.reading);
  const compact = hidden || collapsed || autoCompact;
  if (!ready || error || !data) return null;

  const travel = (target: TravelTarget) => {
    say(target.kind === "galaxy" ? "我们先去这片星系看看。" : "我会陪你经过星系，走向那颗星球。");
    setExpanded(false); router.push(travelUrl(target));
  };
  const act = (action: GuideAction) => { if (binding) say(binding.act(action)); };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!panel.current) return;
    drag.current = { startX: event.clientX, left: panel.current.getBoundingClientRect().left };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || !panel.current) return;
    const x = Math.max(8, Math.min(innerWidth - panel.current.offsetWidth - 8, drag.current.left + event.clientX - drag.current.startX));
    panel.current.style.left = `${x}px`; panel.current.style.right = "auto";
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || !panel.current) return;
    const bounds = panel.current.getBoundingClientRect();
    setEdge(bounds.x + bounds.width / 2 < innerWidth / 2 ? "left" : "right");
    panel.current.style.left = ""; panel.current.style.right = "";
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const needle = query.trim().toLocaleLowerCase();
  const galaxies = data.galaxies.filter(g => g.name.toLocaleLowerCase().includes(needle));
  const planets = data.planets.filter(p => `${planetName(p)} ${p.description}`.toLocaleLowerCase().includes(needle));

  return <aside ref={panel} onKeyDown={event => { if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); } }} className={`global-guide at-${edge} ${compact ? "is-compact" : ""} ${hidden ? "is-hidden-guide" : ""} ${activePlanet && binding?.reading ? "is-reading" : ""}`} aria-label="全局记忆引导者" data-guide-instance="universe-companion">
    {compact ? <button className="guide-launcher" aria-label={hidden ? "显示记忆引导者" : "展开记忆引导者"} onClick={() => { setHidden(false); setCollapsed(false); setExpanded(true); }}>
      {!hidden && <GuidePortrait />}<Sparkles size={18} /><span>{hidden ? "显示引导者" : "记忆引导者"}</span>
    </button> : <>
      <div className="global-guide-character" aria-hidden="true"><GuidePortrait /></div>
      <div className="global-guide-dialogue">
        <header><strong>记忆引导者</strong><div><button className="guide-small-button" aria-label="隐藏记忆引导者" onClick={() => setHidden(true)}><EyeOff size={16} /></button><button className="guide-small-button" aria-label="收起记忆引导者" onClick={() => setCollapsed(true)}><ChevronDown size={18} /></button></div></header>
        <p className="global-guide-message" aria-live="polite">{message}</p>
        <div className="global-guide-primary"><button onClick={() => { setExpanded(false); say("你可以慢慢看，我就在这里。"); }}><Compass size={16} />自己探索</button><button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><Search size={16} />{expanded ? "收起查找" : activePlanet ? "帮我寻找" : "带我去看看"}</button></div>
      </div>
      <button className="guide-drag-handle" aria-label="拖动引导者，松开后吸附边缘；方向键切换左右" onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setEdge(e.key === "ArrowLeft" ? "left" : "right"); } }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><GripHorizontal size={20} /></button>
    </>}
    {expanded && (!compact || autoCompact) && !hidden && <div className="global-guide-search" aria-label="引导查找面板">
      <header><strong>{activePlanet ? "寻找记忆与目的地" : "想去哪里？"}</strong><button className="guide-small-button" aria-label="关闭引导查找" onClick={() => setExpanded(false)}><X size={18} /></button></header>
      <label className="guide-prompt-setting"><input type="checkbox" checked={promptsEnabled} onChange={e => setPromptsEnabled(e.target.checked)} />飞行与抵达时显示简短提示</label>
      {activePlanet && binding && <div className="global-guide-memory-actions">{([['recent', '最近记忆'], ['photo', '照片记忆'], ['video', '视频记忆'], ['date', '按年份查找'], ['keyword', '关键词搜索'], ['random', '随机打开'], ['all', '返回全部']] as const).map(([action, label]) => <button key={action} onClick={() => { act(action); if (action !== "all") setExpanded(false); }}>{label}</button>)}</div>}
      <label className="guide-destination-search">查找星系或星球<input aria-label="引导者目的地搜索" placeholder="输入星系或星球名称" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="guide-destinations"><h3>星系</h3>{galaxies.map(g => <button key={g.id} onClick={() => travel({ kind: "galaxy", id: g.id })}>前往星系：{g.name}<small>{data.planets.filter(p => p.galaxyId === g.id).length} 颗星球</small></button>)}
        <h3>星球</h3>{planets.map(p => <button key={p.id} onClick={() => travel({ kind: "planet", id: p.id })}>前往星球：{planetName(p)}<small>{data.galaxies.find(g => g.id === p.galaxyId)?.name}{p.isDemo ? " · 外观示例" : ""}</small></button>)}
        {galaxies.length + planets.length === 0 && <p role="status">没有找到这个目的地，试试别的名字。</p>}
      </div>
    </div>}
  </aside>;
}
