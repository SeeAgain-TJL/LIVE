import type { RefObject } from "react";
import { CalendarDays, Image as ImageIcon, List, Orbit, Search, Video } from "lucide-react";
import type { Quality } from "@/domain/types";
import type { MemoryFilter } from "@/domain/memory";

interface ToolbarProps {
  query: string; year: string; filter: MemoryFilter; view: "space" | "list"; quality: Quality; count: number;
  searchRef: RefObject<HTMLInputElement | null>; yearRef: RefObject<HTMLInputElement | null>;
  onQuery: (value: string) => void; onYear: (value: string) => void; onFilter: (value: MemoryFilter) => void;
  onView: () => void; onQuality: (value: Quality) => void;
}

export function MemoryToolbar({ query, year, filter, view, quality, count, searchRef, yearRef, onQuery, onYear, onFilter, onView, onQuality }: ToolbarProps) {
  return <section className="memory-controls" aria-label="查找与管理记忆">
    <div className="memory-search-group">
      <label className="memory-search"><Search size={18} /><input ref={searchRef} aria-label="搜索记忆" placeholder="搜索标题、正文、附件" value={query} onChange={event => onQuery(event.target.value)} /><kbd>/</kbd></label>
      <label className="memory-year"><CalendarDays size={17} /><input ref={yearRef} aria-label="按年份查找" inputMode="numeric" maxLength={4} placeholder="年份" value={year} onChange={event => onYear(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
    </div>
    <div className="memory-filters" role="group" aria-label="记忆类型">
      {([['all', '全部记忆', Orbit], ['photo', '照片记忆', ImageIcon], ['video', '视频记忆', Video]] as const).map(([value, label, Icon]) =>
        <button key={value} aria-pressed={filter === value} onClick={() => onFilter(value)}><Icon size={16} />{label}</button>)}
    </div>
    <div className="memory-management-group"><span className="memory-result-count" aria-live="polite">{count} 条</span>
      <button className="text-button view-toggle" onClick={onView}>{view === "space" ? <List size={17} /> : <Orbit size={17} />}{view === "space" ? "列表管理" : "记忆球空间"}</button>
      <label className="quality-control"><span>场景质量</span><select aria-label="场景质量" value={quality} onChange={event => onQuality(event.target.value as Quality)}><option value="auto">自动</option><option value="high">高质量</option><option value="low">简化</option></select></label>
    </div>
  </section>;
}
