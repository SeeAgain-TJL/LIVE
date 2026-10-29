"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Edit3, Orbit, Plus, Trash2 } from "lucide-react";
import type { Memory, Quality } from "@/domain/types";
import { memoryMatches, memoryPassesFilter, type MemoryFilter } from "@/domain/memory";
import { periodLabel, planetName } from "@/domain/planet";
import { useUniverse } from "@/components/providers/universe-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { Modal } from "@/components/ui/modal";
import { StorageState } from "@/components/ui/storage-state";
import { MemoryEditor } from "./memory-editor";
import { MemoryDetails } from "./memory-details";
import { MemoryGuide, type GuideAction } from "./memory-guide";
import { MemoryToolbar } from "./memory-toolbar";
import { MemoryList } from "./memory-list";

const MemorySpace = dynamic(() => import("@/components/three/memory-space").then(module => module.MemorySpace), {
  ssr: false, loading: () => <div className="memory-space-loading">正在展开记忆空间…</div>,
});

export function PlanetMemorySpace({ id }: { id: string }) {
  const router = useRouter();
  const { data, ready, error, deleteMemory, deletePlanet } = useUniverse();
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
  const [view, setView] = useState<"space" | "list">("space");
  const [quality, setQuality] = useState<Quality>("auto");
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      event.preventDefault(); searchRef.current?.focus();
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
  const selected = filtered.find(memory => memory.id === selectedId) ?? null;
  const resetFilters = () => { setQuery(""); setYear(""); setFilter("all"); setSelectedId(null); };
  const guideAction = (action: GuideAction): string => {
    if (action === "keyword") { searchRef.current?.focus(); return "在上方输入关键词，我会在这颗星球里寻找。"; }
    if (action === "date") { yearRef.current?.focus(); return "在上方输入年份，看看那段时间留下了什么。"; }
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
    if (target) setView("space");
    return target ? `这段记忆记录于 ${target.occurredOn}。你可以慢慢看。` : "暂时没有找到这样的记忆，要换一个条件吗？";
  };
  const closeEditor = (savedId?: string) => {
    setEditor(null);
    if (savedId) { resetFilters(); setSelectedId(savedId); }
  };
  const confirmDelete = async (wholePlanet: boolean) => {
    if (deleting) return;
    setDeleting(true); setActionError("");
    try {
      if (wholePlanet) { await deletePlanet(id); router.push("/"); }
      else if (deleteTarget) { await deleteMemory(deleteTarget.id); setDeleteTarget(null); setSelectedId(null); }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "删除失败，请重试。"); }
    finally { setDeleting(false); }
  };

  return <main className="archive-shell memory-palace-shell">
    <div className="archive-stars" aria-hidden="true" />
    <header className="topbar archive-topbar memory-palace-topbar">
      <Link href="/" className="back-link"><ArrowLeft size={18} /><span>返回我的宇宙</span></Link>
      <div className="memory-palace-title"><small>星穹记忆殿堂 · {memories.length} 条记忆</small><h1>{planetName(planet)}</h1></div>
      <button className="button" onClick={() => setEditor("new")}><Plus size={18} />写一条记忆</button>
    </header>
    <div className="memory-palace-layout">
      <section className="planet-summary" aria-label="星球简介">
        <div><p className="planet-summary-description">{planet.description || "关于这段时光的故事，等你慢慢写下。"}</p>
          <p className="planet-summary-meta"><CalendarDays size={15} />{periodLabel(planet)}<span>· {data.galaxies.find(galaxy => galaxy.id === planet.galaxyId)?.name || "未归类星系"}</span>{planet.isDemo && <span>· 外观示例</span>}</p></div>
        <details className="planet-info-menu"><summary>星球资料</summary><div className="planet-info-popover">
          <p>{planet.description || "尚未添加星球介绍。"}</p>
          <button className="button secondary" onClick={() => setEditingPlanet(true)}><Edit3 size={16} />编辑星球资料</button>
          <button className="text-button danger-link" onClick={() => { setActionError(""); setDeletePlanetOpen(true); }}><Trash2 size={16} />删除这颗星球</button>
        </div></details>
      </section>
      <MemoryToolbar query={query} year={year} filter={filter} view={view} quality={quality} count={filtered.length}
        searchRef={searchRef} yearRef={yearRef}
        onQuery={value => { setQuery(value); setSelectedId(null); }} onYear={value => { setYear(value); setSelectedId(null); }}
        onFilter={value => { setFilter(value); setSelectedId(null); }} onView={() => setView(value => value === "space" ? "list" : "space")} onQuality={setQuality} />
      <section className={`memory-experience ${view === "list" ? "is-list" : ""}`} aria-label={view === "space" ? "记忆球空间" : "记忆列表"}>
        {view === "space" ? <>
          <MemorySpace memories={filtered} media={media} selectedId={selected?.id ?? null} onSelect={setSelectedId} quality={quality} />
          <div hidden={!!selected}><MemoryGuide onAction={guideAction} /></div>
          <p className="memory-space-hint">拖动旋转 · 滚轮或双指缩放 · 点击记忆球阅读</p>
        </> : <MemoryList memories={filtered} media={media} selectedId={selected?.id ?? null} onSelect={setSelectedId}
          onEdit={setEditor} onDelete={memory => { setActionError(""); setDeleteTarget(memory); }} sort={sort} onSort={() => setSort(value => value === "desc" ? "asc" : "desc")} />}
        {filtered.length === 0 && <div className="palace-empty" role="status"><Orbit size={30} /><h2>{memories.length ? "没有符合条件的记忆" : "这里还没有记忆"}</h2><p>{memories.length ? "换一个关键词、年份或类型，继续寻找。" : "用上方的「写一条记忆」，留住第一段时光。"}</p>{memories.length > 0 && <button className="button secondary" onClick={resetFilters}>返回全部记忆</button>}</div>}
      </section>
      <p className="palace-storage-note">本地开发版：文字保存在 localStorage，媒体保存在 IndexedDB，仅限当前浏览器与访问地址。请保留原始媒体副本。</p>
    </div>
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
