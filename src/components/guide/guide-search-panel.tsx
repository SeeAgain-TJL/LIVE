"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { UniverseData } from "@/domain/types";
import { isPersonalPlanet, planetName } from "@/domain/planet";
import { findGuideMemories, type GuideMemoryFilter } from "@/domain/guide-companion";
import type { TravelTarget } from "@/domain/galaxy";
import { useGuide } from "./guide-provider";

export function GuideSearchPanel({ data, initialMode, recent, onClose, onActionComplete, onTravel, onOpenMemory }: {
  data: UniverseData; initialMode: "destinations" | "memories"; recent: boolean; onClose: () => void;
  onActionComplete: () => void; onTravel: (target: TravelTarget) => void; onOpenMemory: (id: string) => void;
}) {
  const { binding, say, travelling, promptsEnabled, setPromptsEnabled } = useGuide();
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GuideMemoryFilter>("all");
  const [year, setYear] = useState("");
  const [limit, setLimit] = useState(20);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  const needle = query.trim().toLocaleLowerCase();
  const galaxies = data.galaxies.filter(g => g.name.toLocaleLowerCase().includes(needle));
  const planets = data.planets.filter(p => isPersonalPlanet(p, data.memories) && `${planetName(p)} ${p.description}`.toLocaleLowerCase().includes(needle));
  const memories = findGuideMemories(data, query, filter, year);
  return <section className="companion-search global-guide-search" role="region" aria-label="引导查找面板">
    <header><strong>{mode === "destinations" ? "想去哪里？" : recent ? "最近留下的时光" : "寻找一段记忆"}</strong><button className="guide-small-button" aria-label="关闭引导查找" onClick={onClose}><X size={20} /></button></header>
    <div className="companion-search-tabs" role="group" aria-label="查找范围"><button aria-pressed={mode === "destinations"} onClick={() => { setMode("destinations"); setQuery(""); }}>星系与星球</button><button aria-pressed={mode === "memories"} onClick={() => { setMode("memories"); setQuery(""); }}>全部记忆</button></div>
    <label className="guide-destination-search">{mode === "destinations" ? "查找星系或星球" : "搜索标题与正文"}<input ref={search} aria-label={mode === "destinations" ? "引导者目的地搜索" : "引导者记忆搜索"} value={query} onChange={e => { setQuery(e.target.value); setLimit(20); }} placeholder={mode === "destinations" ? "输入星系或星球名称" : "输入你记得的词语"} /></label>
    {mode === "memories" && <div className="companion-memory-filters"><label>记忆类型<select value={filter} onChange={e => { setFilter(e.target.value as GuideMemoryFilter); setLimit(20); }}><option value="all">全部类型</option><option value="text">文字记忆</option><option value="photo">照片记忆</option><option value="video">视频记忆</option></select></label><label>发生年份<input aria-label="引导者记忆年份" type="number" min="1" max="9999" value={year} onChange={e => { setYear(e.target.value); setLimit(20); }} placeholder="所有年份" /></label></div>}
    {binding && <div className="global-guide-memory-actions" aria-label="当前星球快捷查找">{([['recent', '最近记忆'], ['photo', '照片记忆'], ['video', '视频记忆'], ['date', '按年份查找'], ['keyword', '关键词搜索'], ['random', '随机打开'], ['all', '返回全部']] as const).map(([action, label]) => <button key={action} disabled={travelling} onClick={() => { say(binding.act(action)); onActionComplete(); }}>{label}</button>)}</div>}
    <div className="guide-destinations">{mode === "destinations" ? <>
      <h3>星系 · {galaxies.length}</h3>{galaxies.slice(0, limit).map(g => <button key={g.id} disabled={travelling} onClick={() => onTravel({ kind: "galaxy", id: g.id })}>前往星系：{g.name}<small>{data.planets.filter(p => p.galaxyId === g.id && isPersonalPlanet(p, data.memories)).length} 颗我的星球</small></button>)}
      <h3>星球 · {planets.length}</h3>{planets.slice(0, limit).map(p => <button key={p.id} disabled={travelling} onClick={() => onTravel({ kind: "planet", id: p.id })}>前往星球：{planetName(p)}<small>{data.galaxies.find(g => g.id === p.galaxyId)?.name}{p.isDemo ? " · 外观示例" : ""}</small></button>)}
      {!galaxies.length && !planets.length && <p role="status">没有找到这个目的地，试试别的名字。</p>}
    </> : <><h3>找到 {memories.length} 条记忆 · 按发生日期从近到远</h3>{memories.slice(0, limit).map(m => <button key={m.id} disabled={travelling} onClick={() => onOpenMemory(m.id)}>打开记忆：{m.title || "无标题记忆"}<small>{m.occurredOn} · {planetName(data.planets.find(p => p.id === m.planetId)!)}</small></button>)}{!memories.length && <p role="status">暂时没有找到这样的记忆，要换一个条件吗？</p>}</>}
      {(mode === "memories" ? memories.length : Math.max(galaxies.length, planets.length)) > limit && <button onClick={() => setLimit(v => v + 20)}>显示更多结果</button>}
    </div>
    <label className="guide-prompt-setting"><input type="checkbox" checked={promptsEnabled} onChange={e => setPromptsEnabled(e.target.checked)} />飞行与抵达时显示简短提示</label>
  </section>;
}
