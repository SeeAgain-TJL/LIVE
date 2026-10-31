"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Edit3, Orbit, Plus, Trash2, X, List, Settings2 } from "lucide-react";
import type { Memory, Quality } from "@/domain/types";
import { memoryMatches, memoryPassesFilter, type MemoryFilter } from "@/domain/memory";
import { periodLabel, planetName } from "@/domain/planet";
import { useUniverse } from "@/components/providers/universe-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { Modal } from "@/components/ui/modal";
import { StorageState } from "@/components/ui/storage-state";
import { MemoryEditor } from "./memory-editor";
import { MemoryDetails } from "./memory-details";
import type { GuideAction } from "@/domain/guide";
import { MemoryGuideBridge, useGuide } from "@/components/guide/guide-provider";
import { MemoryToolbar } from "./memory-toolbar";
import { MemoryList } from "./memory-list";
import { PlanetExitLink } from "./planet-exit-link";

const MemorySpace = dynamic(() => import("@/components/three/memory-space").then(module => module.MemorySpace), {
  ssr: false, loading: () => <div className="memory-space-loading">正在展开记忆空间…</div>,
});
const PlanetWorld = dynamic(() => import("@/components/three/planet-world").then(module => module.PlanetWorld), {
  ssr: false, loading: () => <div className="memory-space-loading">正在生成星球世界…</div>,
});

export function PlanetMemorySpace({ id }: { id: string }) {
  const router = useRouter();
  const { settleTravel } = useGuide();
  const { data, ready, error, deleteMemory, deletePlanet } = useUniverse();
  const params = useSearchParams();
  const requestedMemory = params.get("memory");
  const handledMemory = useRef("");
  // Selection is always explicit. Inferring it from a single result reopens a dismissed drawer.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<"new" | Memory | null>(null);
  const [editingPlanet, setEditingPlanet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deletePlanetOpen, setDeletePlanetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [view, setView] = useState<"space" | "list">("list");
  const [worldMode, setWorldMode] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [night, setNight] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const onWorldReady = useCallback(() => setWorldReady(true), []);
  const [quality, setQuality] = useState<Quality>("auto");
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!requestedMemory) { handledMemory.current = ""; return; }
    if (!ready || !data || !requestedMemory || handledMemory.current === requestedMemory) return;
    const frame = requestAnimationFrame(() => {
      handledMemory.current = requestedMemory;
      const target = data.memories.find(m => m.id === requestedMemory && m.planetId === id);
      if (target) { setQuery(""); setYear(""); setFilter("all"); setSelectedId(target.id); }
      else setActionError("这段记忆已不存在，或不属于当前星球。可以重新查找。");
      router.replace(`/planet/${encodeURIComponent(id)}`, { scroll: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, data, requestedMemory, id, router]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      event.preventDefault(); setSelectedId(null); setManagerOpen(true); requestAnimationFrame(() => searchRef.current?.focus());
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  if (!ready || error || !data) return <StorageState />;
  const planet = data.planets.find(item => item.id === id);
  if (!planet) return <main className="storage-state"><Orbit size={36} /><h1>这颗星球还没有抵达</h1><Link href="/" className="button"><ArrowLeft size={16} />返回我的宇宙</Link></main>;
  const media = data.media ?? [];
  const memories = data.memories.filter(memory => memory.planetId === id);
  const filtered = memories.filter(memory => memoryMatches(memory, media, query)
    && memoryPassesFilter(memory, media, filter) && (!year || memory.occurredOn.startsWith(year)))
    .sort((a, b) => (sort === "desc" ? -1 : 1) * (a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt)));
  const selected = memories.find(memory => memory.id === selectedId) ?? null;
  const resetFilters = () => { setQuery(""); setYear(""); setFilter("all"); setSelectedId(null); };
  const guideAction = (action: GuideAction): string => {
    if (action === "keyword") { setSelectedId(null); setManagerOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); return "在管理面板输入关键词，我会在这颗星球里寻找。"; }
    if (action === "date") { setSelectedId(null); setManagerOpen(true); requestAnimationFrame(() => yearRef.current?.focus()); return "在管理面板输入年份，看看那段时间留下了什么。"; }
    if (action === "all") { resetFilters(); return `这里有你保存的 ${memories.length} 条记忆。`; }
    let candidates = filtered;
    if (action !== "random") {
      resetFilters(); setSort("desc");
      const nextFilter = action === "photo" || action === "video" ? action : "all";
      setFilter(nextFilter);
      candidates = memories.filter(memory => memoryPassesFilter(memory, media, nextFilter))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
    }
    const target = candidates[action === "random" ? Math.floor(Math.random() * candidates.length) : 0];
    setSelectedId(target?.id ?? null);
    if (target) setManagerOpen(false);
    return target ? `这段记忆记录于 ${target.occurredOn}。你可以慢慢看。` : "暂时没有找到这样的记忆，要换一个条件吗？";
  };
  const closeEditor = (savedId?: string) => {
    setEditor(null);
    if (savedId) { resetFilters(); setManagerOpen(false); setSelectedId(savedId); }
  };
  const confirmDelete = async (wholePlanet: boolean) => {
    if (deleting) return;
    setDeleting(true); setActionError("");
    try {
      if (wholePlanet) { await deletePlanet(id); router.push(`/galaxy/${encodeURIComponent(planet.galaxyId!)}`); }
      else if (deleteTarget) { await deleteMemory(deleteTarget.id); setDeleteTarget(null); setSelectedId(null); }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "删除失败，请重试。"); }
    finally { setDeleting(false); }
  };

  return <main className="archive-shell memory-palace-shell world-first-shell">
    <MemoryGuideBridge planetId={id} act={guideAction} reading={!!selected} worldReady={worldReady || !worldMode} />
    <section className="world-stage" aria-label={worldMode ? "星球生命世界" : "记忆球空间"}>
      {worldMode ? <PlanetWorld planet={planet} memories={memories} media={media} selectedId={selectedId} onSelect={setSelectedId} quality={quality} night={night} onReady={onWorldReady} onUnavailable={settleTravel} /> : <MemorySpace memories={filtered} media={media} selectedId={selectedId} onSelect={setSelectedId} quality={quality} />}
    </section>
    <header className="world-hud scene-hud">
      <PlanetExitLink planetId={id} galaxyId={planet.galaxyId!} />
      <div className="world-title"><h1>{planetName(planet)}</h1><span>{memories.length} 条记忆</span></div>
      <div className="world-hud-actions">
        <button className="button secondary" aria-label="记忆管理" aria-expanded={managerOpen} aria-controls="world-management" onClick={() => { setSelectedId(null);setManagerOpen(value => !value); }}><List size={18} /><span>记忆管理</span></button>
        <button className="button" onClick={() => setEditor("new")}><Plus size={18} /><span>写一条记忆</span></button>
        <button className="icon-button" aria-label="世界设置与帮助" onClick={() => setHelpOpen(true)}><Settings2 size={18} /></button>
      </div>
    </header>
    {!worldMode && <button className="return-world button secondary" onClick={() => setWorldMode(true)}>返回生命世界</button>}
    {managerOpen && <aside id="world-management" className="world-management hud-panel" aria-label="记忆管理面板" onKeyDown={event => { if (event.key === "Escape" && !selected && !document.querySelector("dialog[open]")) { event.stopPropagation();setManagerOpen(false); } }}>
      <header><h2>记忆档案</h2><button className="icon-button" aria-label="返回世界" onClick={() => setManagerOpen(false)}><X size={20} /></button></header>
      <nav className="exploration-breadcrumb" aria-label="探索路径"><Link href="/">宇宙</Link><span>›</span><Link href={`/galaxy/${encodeURIComponent(planet.galaxyId!)}`}>{data.galaxies.find(g => g.id === planet.galaxyId)?.name}</Link></nav>
      <details className="world-planet-info"><summary>星球资料</summary><p>{planet.description || "尚未添加星球介绍。"}</p><p><CalendarDays size={15} />{periodLabel(planet)}</p><button className="button secondary" onClick={() => setEditingPlanet(true)}><Edit3 size={16} />编辑星球资料</button><button className="text-button danger-link" onClick={() => setDeletePlanetOpen(true)}><Trash2 size={16} />删除这颗星球</button></details>
      <MemoryToolbar query={query} year={year} filter={filter} view={view} quality={quality} count={filtered.length} searchRef={searchRef} yearRef={yearRef}
        onQuery={setQuery} onYear={setYear} onFilter={setFilter} onView={() => { setView("list");setWorldMode(false);setManagerOpen(false); }} onQuality={setQuality} />
      <MemoryList memories={filtered} media={media} selectedId={selectedId} onSelect={id => { setSelectedId(id);setManagerOpen(false); }} onEdit={setEditor} onDelete={memory => { setActionError("");setDeleteTarget(memory); }} sort={sort} onSort={() => setSort(value => value === "desc" ? "asc" : "desc")} />
      {!filtered.length && <p className="world-manager-empty">{memories.length ? "没有符合条件的记忆。" : "这里还没有记忆，世界已经可以探索。"}</p>}
      <p className="palace-storage-note">本地开发版：文字在 localStorage，媒体在 IndexedDB。仅此浏览器与访问地址可读；请保留媒体原文件。</p>
    </aside>}
    {helpOpen && <Modal eyebrow="WORLD" title="探索这个世界" onClose={() => setHelpOpen(false)}><div className="settings-content"><p>拖动观察，双指或右键平移，滚轮缩放。点击地面后也可以用 WASD 在有限区域内移动。发光记忆对象对应你保存的真实记录。</p><button className="button secondary" aria-pressed={night} onClick={() => setNight(value => !value)}>{night ? "切换到白昼" : "切换到夜晚"}</button><p>昼夜为手动光照预设，没有自动时间或生态模拟。</p><label className="field">场景质量<select aria-label="世界渲染质量" value={quality} onChange={event => setQuality(event.target.value as Quality)}><option value="auto">自动</option><option value="high">高</option><option value="low">简化</option></select></label><p>角色仍使用开发预览资产。点击交谈、拖动移动，可在对话中隐藏并从星光入口恢复。</p><p>这是本地开发版，没有账号、加密或云端同步。请定期导出档案，另存媒体原文件。</p></div></Modal>}
    {selected && <MemoryDetails key={selected.id} memory={selected} media={media} planetName={planetName(planet)} onClose={closeDetails}
      onEdit={() => setEditor(selected)} onDelete={() => { setActionError(""); setDeleteTarget(selected); }} />}
    {editingPlanet && <PlanetEditor planet={planet} onClose={() => setEditingPlanet(false)} onSaved={() => setEditingPlanet(false)} />}
    {editor && <MemoryEditor planetId={id} memory={editor === "new" ? undefined : editor} onClose={closeEditor} />}
    {(deleteTarget || deletePlanetOpen) && <Modal title={deletePlanetOpen ? "删除这颗星球？" : "删除这条记忆？"} eyebrow="删除确认" onClose={() => { if (!deleting) { setDeleteTarget(null); setDeletePlanetOpen(false); } }}>
      <div className="delete-confirmation"><p>{deletePlanetOpen ? "这会删除星球及其中全部记忆和本地媒体。JSON 导出仅含元数据，不包含媒体文件；请先单独保存重要资料。" : "这条记忆与其媒体将从当前浏览器档案移除。此操作不能撤销。"}</p>
        {actionError && <p role="alert" className="form-error">{actionError}</p>}
        <div className="button-row"><button className="button secondary" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeletePlanetOpen(false); }}>保留</button><button className="button danger" disabled={deleting} onClick={() => void confirmDelete(deletePlanetOpen)}>{deleting ? "正在删除…" : "确认删除"}</button></div>
      </div>
    </Modal>}
  </main>;
}
