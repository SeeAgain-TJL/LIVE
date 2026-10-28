"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDownUp, ArrowLeft, CalendarDays, ChevronRight, Edit3, FolderHeart, Image as ImageIcon, List, Orbit, Plus, Search, Trash2, Video } from "lucide-react";
import type { Memory } from "@/domain/types";
import { memoryMatches, memoryMediaKind, memoryPassesFilter, type MemoryFilter } from "@/domain/memory";
import { periodLabel, planetName, PLANET_TYPES } from "@/domain/planet";
import { useUniverse } from "@/components/providers/universe-provider";
import { PlanetEditor } from "@/components/planets/planet-editor";
import { MemoryEditor } from "./memory-editor";
import { MemoryDetails } from "./memory-details";
import { MemoryGuide, type GuideAction } from "./memory-guide";
import { Modal } from "@/components/ui/modal";
import { StorageState } from "@/components/ui/storage-state";

const MemorySpace = dynamic(() => import("@/components/three/memory-space").then(module => module.MemorySpace), { ssr: false, loading: () => <div className="memory-space-loading">MEMORY SPACE / loading 3D space…</div> });

const ui = {
  back: "\u8fd4\u56de\u6211\u7684\u5b87\u5b99", title: "\u8bb0\u5fc6\u6b8b\u661f\u6bbf\u5802", add: "\u5199\u4e00\u6761\u8bb0\u5fc6", list: "\u5217\u8868\u7ba1\u7406", space: "\u8bb0\u5fc6\u7403\u7a7a\u95f4", all: "\u5168\u90e8\u8bb0\u5fc6", photo: "\u7167\u7247\u8bb0\u5fc6", video: "\u89c6\u9891\u8bb0\u5fc6", search: "\u641c\u7d22\u8bb0\u5fc6", year: "\u6309\u5e74\u4efd\u67e5\u627e", empty: "\u8fd9\u91cc\u8fd8\u6ca1\u6709\u8bb0\u5fc6", deletePlanet: "\u5220\u9664\u8fd9\u9897\u661f\u7403", confirmDelete: "\u786e\u8ba4\u5220\u9664", keep: "\u4fdd\u7559", settings: "\u573a\u666f\u8d28\u91cf", recent: "\u6700\u8fd1\u66f4\u65b0", earliest: "\u6700\u65e9\u8bb0\u5fc6" };

function MemoryKindIcon({ kind }: { kind: ReturnType<typeof memoryMediaKind> }) {
  return kind === "photo" ? <ImageIcon size={13} /> : kind === "video" ? <Video size={13} /> : <FolderHeart size={13} />;
}

export function PlanetMemorySpace({ id }: { id: string }) {
  const router = useRouter();
  const { data, ready, error, deleteMemory, deletePlanet } = useUniverse();
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
  const [quality, setQuality] = useState<"auto" | "high" | "low">("auto");
  const [actionError, setActionError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  if (!ready || error || !data) return <StorageState />;
  const planet = data.planets.find(item => item.id === id);
  if (!planet) return <main className="storage-state"><Orbit size={36} /><p className="eyebrow">WORLD NOT FOUND</p><h1>\u8fd9\u9897\u661f\u7403\u8fd8\u6ca1\u6709\u62b5\u8fbe</h1><Link href="/" className="button"><ArrowLeft size={15} />{ui.back}</Link></main>;
  const media = data.media ?? [];
  const memories = data.memories.filter(memory => memory.planetId === id);
  const filtered = memories.filter(memory => memoryMatches(memory, media, query) && memoryPassesFilter(memory, media, filter) && (!year || memory.occurredOn.startsWith(year))).sort((a, b) => (sort === "desc" ? -1 : 1) * (a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt)));
  const activeSelectedId = selectedId ?? (filtered.length === 1 ? filtered[0].id : null);
  const selected = data.memories.find(memory => memory.id === activeSelectedId && memory.planetId === id) ?? null;
  const selectFirst = (items: Memory[]) => { const target = items[0]; setSelectedId(target?.id ?? null); };
  const guideAction = (action: GuideAction) => {
    if (action === "keyword") { searchRef.current?.focus(); return; }
    if (action === "date") { yearRef.current?.focus(); return; }
    if (action === "all") { setQuery(""); setYear(""); setFilter("all"); selectFirst(memories); return; }
    if (action === "photo" || action === "video") { setFilter(action); setQuery(""); setYear(""); selectFirst(memories.filter(memory => memoryPassesFilter(memory, media, action)).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))); return; }
    if (action === "random") { selectFirst([...filtered].sort(() => Math.random() - 0.5)); return; }
    setSort("desc"); setFilter("all"); setQuery(""); setYear(""); selectFirst([...memories].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)));
  };
  const closeEditor = (savedId?: string) => { setEditor(null); if (savedId) { setSelectedId(savedId); setView("space"); } };
  
  return <main className="archive-shell memory-palace-shell"><div className="archive-stars" aria-hidden="true" /><header className="topbar archive-topbar memory-palace-topbar"><Link href="/" className="back-link"><ArrowLeft size={17} />{ui.back}</Link><div className="memory-palace-title"><span>{planetName(planet)}</span><small>{ui.title} · {memories.length} {"\u6761\u8bb0\u5fc6"}</small></div><div className="memory-top-actions"><button className="button" onClick={() => setEditor("new")}><Plus size={15} />{ui.add}</button><label className="quality-control"><span>{ui.settings}</span><select aria-label={ui.settings} value={quality} onChange={event => setQuality(event.target.value as typeof quality)}><option value="auto">AUTO</option><option value="high">HIGH</option><option value="low">LOW</option></select></label></div></header>
    <div className="memory-palace-layout"><aside className="archive-planet memory-planet-card"><div className="archive-preview"><PlanetPreview appearance={planet.appearance} /></div><p className="eyebrow">{planet.isDemo ? "DEMO WORLD / \u672a\u547d\u540d\u5916\u89c2\u793a\u4f8b" : "A WORLD OF YOUR OWN"}</p><h1>{planetName(planet)}</h1><p className="archive-period"><CalendarDays size={14} />{periodLabel(planet)}</p><div className="archive-tags"><span>{data.galaxies.find(galaxy => galaxy.id === planet.galaxyId)?.name || "\u672a\u5f52\u7c7b\u661f\u7cfb"}</span><span>{PLANET_TYPES.find(type => type.value === planet.appearance.type)?.label}{"\u661f\u7403"}</span></div><p className="archive-description">{planet.description || "\u5173\u4e8e\u8fd9\u6bb5\u65f6\u5149\u7684\u6545\u4e8b\uff0c\u7b49\u4f60\u6162\u6162\u5199\u4e0b\u3002"}</p><button className="button secondary edit-planet" onClick={() => setEditingPlanet(true)}><Edit3 size={14} />{"\u7f16\u8f91\u661f\u7403\u8d44\u6599"}</button><button className="text-button danger-link" onClick={() => setDeletePlanetOpen(true)}><Trash2 size={13} />{ui.deletePlanet}</button><p className="local-note">\u672c\u5730\u5f00\u53d1\u7248 · \u5a92\u4f53\u4fdd\u5b58\u5728\u5f53\u524d\u6d4f\u89c8\u5668</p></aside>
      <section className="memory-space"><div className="archive-breadcrumb">{ui.title}<ChevronRight size={12} /><span>{planetName(planet)}</span></div><header className="memory-heading palace-heading"><div><p className="eyebrow">THE SKY OF YOUR MEMORIES</p><h2>{ui.space}<span>{String(filtered.length).padStart(2, "0")}</span></h2></div><button className="text-button view-toggle" onClick={() => setView(view === "space" ? "list" : "space")}><List size={14} />{view === "space" ? ui.list : ui.space}</button></header><div className="memory-controls"><label className="memory-search"><Search size={14} /><input ref={searchRef} aria-label={ui.search} placeholder={ui.search} value={query} onChange={event => setQuery(event.target.value)} /><kbd>/</kbd></label><label className="memory-year"><CalendarDays size={13} /><input ref={yearRef} aria-label={ui.year} inputMode="numeric" maxLength={4} placeholder={ui.year} value={year} onChange={event => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label><div className="memory-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{ui.all}</button><button className={filter === "photo" ? "active" : ""} onClick={() => setFilter("photo")}><ImageIcon size={12} />{ui.photo}</button><button className={filter === "video" ? "active" : ""} onClick={() => setFilter("video")}><Video size={12} />{ui.video}</button></div></div>
        {view === "space" ? <div className="memory-experience"><MemorySpace memories={filtered} media={media} selectedId={activeSelectedId} onSelect={setSelectedId} quality={quality} /><MemoryGuide count={memories.length} onAction={guideAction} />{selected && <MemoryDetails memory={selected} media={media} planetName={planetName(planet)} onClose={() => setSelectedId(null)} onEdit={() => setEditor(selected)} onDelete={() => setDeleteTarget(selected)} />}<div className="memory-space-hint">\u62d6\u52a8\u65cb\u8f6c · \u6eda\u8f6e\u7f29\u653e · \u70b9\u51fb\u8bb0\u5fc6\u7403</div></div> : <MemoryList memories={filtered} media={media} selectedId={activeSelectedId} onSelect={setSelectedId} onEdit={setEditor} onDelete={setDeleteTarget} sort={sort} onSort={() => setSort(value => value === "desc" ? "asc" : "desc")} />}
        {filtered.length === 0 && view === "list" && <div className="memory-empty compact-empty"><FolderHeart size={28} /><h3>{ui.empty}</h3><p>\u6362\u4e00\u4e2a\u6761\u4ef6\uff0c\u6216\u4e3a\u8fd9\u9897\u661f\u7403\u5199\u4e0b\u7b2c\u4e00\u6bb5\u56de\u5fc6\u3002</p><button className="button secondary" onClick={() => setEditor("new")}><Plus size={14} />{ui.add}</button></div>}
      </section></div>
    {editingPlanet && <PlanetEditor planet={planet} onClose={() => setEditingPlanet(false)} onSaved={() => setEditingPlanet(false)} />}
    {editor && <MemoryEditor planetId={id} memory={editor === "new" ? undefined : editor} onClose={closeEditor} />}
    {deleteTarget && <Modal title="\u5220\u9664\u8fd9\u6761\u8bb0\u5fc6\uff1f" eyebrow="DELETE MEMORY" onClose={() => setDeleteTarget(null)}><div className="delete-confirmation"><p>\u5220\u9664\u540e\u8fd9\u6761\u8bb0\u5fc6\u4e0e\u5176\u5a92\u4f53\u5c06\u4ece\u5f53\u524d\u6863\u6848\u79fb\u9664\u3002</p><div className="button-row"><button className="button secondary" onClick={() => setDeleteTarget(null)}>{ui.keep}</button><button className="button danger" onClick={async () => { await deleteMemory(deleteTarget.id); setDeleteTarget(null); setSelectedId(null); }}>{ui.confirmDelete}</button></div></div></Modal>}
    {deletePlanetOpen && <Modal title="\u5220\u9664\u8fd9\u9897\u661f\u7403\uff1f" eyebrow="DELETE PLANET" onClose={() => setDeletePlanetOpen(false)}><div className="delete-confirmation"><p>\u8fd9\u4f1a\u7ea7\u8054\u5220\u9664\u6240\u6709\u8bb0\u5fc6\u548c\u5a92\u4f53\u3002\u8bf7\u5148\u5b8c\u6210 JSON \u5907\u4efd\u3002</p>{actionError && <p role="alert" className="form-error">{actionError}</p>}<div className="button-row"><button className="button secondary" onClick={() => setDeletePlanetOpen(false)}>{ui.keep}</button><button className="button danger" onClick={async () => { try { await deletePlanet(id); router.push("/"); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "\u5220\u9664\u5931\u8d25"); } }}>{ui.confirmDelete}</button></div></div></Modal>}
  </main>;
}

function MemoryList({ memories, media, selectedId, onSelect, onEdit, onDelete, sort, onSort }: { memories: Memory[]; media: import("@/domain/types").Media[]; selectedId: string | null; onSelect: (id: string) => void; onEdit: (memory: Memory) => void; onDelete: (memory: Memory) => void; sort: "asc" | "desc"; onSort: () => void }) {
  return <div className="memory-list-mode"><div className="memory-list-toolbar"><span>{memories.length} {"\u6761\u8bb0\u5fc6"}</span><button className="text-button" onClick={onSort}><ArrowDownUp size={13} />{sort === "desc" ? ui.recent : ui.earliest}</button></div>{memories.map(memory => { const kind = memoryMediaKind(memory, media); return <article key={memory.id} className={`memory-list-entry ${selectedId === memory.id ? "selected" : ""}`} onClick={() => onSelect(memory.id)}><div className="memory-list-kind"><MemoryKindIcon kind={kind} /></div><div><time>{memory.occurredOn}</time><h3>{memory.title || "\u672a\u547d\u540d\u8bb0\u5fc6"}</h3><p>{memory.body || "\u8fd9\u6761\u8bb0\u5fc6\u53ea\u5305\u542b\u5a92\u4f53\u3002"}</p></div><div className="memory-list-actions"><button className="icon-button" aria-label="\u7f16\u8f91\u8bb0\u5fc6" onClick={event => { event.stopPropagation(); onEdit(memory); }}><Edit3 size={14} /></button><button className="icon-button" aria-label="\u5220\u9664\u8bb0\u5fc6" onClick={event => { event.stopPropagation(); onDelete(memory); }}><Trash2 size={14} /></button></div></article>; })}</div>;
}

const PlanetPreview = dynamic(() => import("@/components/three/universe-scene").then(module => module.PlanetPreview), { ssr: false, loading: () => <div className="preview-fallback">3D preview…</div> });
