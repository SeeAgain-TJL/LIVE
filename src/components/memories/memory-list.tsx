import { ArrowDownUp, Edit3, FileText, Image as ImageIcon, Layers, Trash2, Video } from "lucide-react";
import { memoryMediaKind } from "@/domain/memory";
import type { Media, Memory } from "@/domain/types";

export function MemoryList({ memories, media, selectedId, onSelect, onEdit, onDelete, sort, onSort }: {
  memories: Memory[]; media: Media[]; selectedId: string | null; onSelect: (id: string) => void;
  onEdit: (memory: Memory) => void; onDelete: (memory: Memory) => void; sort: "asc" | "desc"; onSort: () => void;
}) {
  return <div className="memory-list-mode"><div className="memory-list-toolbar"><span>按发生时间浏览</span><button className="text-button" onClick={onSort}><ArrowDownUp size={16} />{sort === "desc" ? "从近到远" : "从远到近"}</button></div>
    {memories.map(memory => {
      const kind = memoryMediaKind(memory, media);
      const Icon = kind === "photo" ? ImageIcon : kind === "video" ? Video : kind === "mixed" ? Layers : FileText;
      return <article key={memory.id} className={`memory-list-entry ${selectedId === memory.id ? "selected" : ""}`}>
        <button className="memory-list-open" onClick={() => onSelect(memory.id)} aria-label={`打开记忆：${memory.title || "未命名记忆"}`}>
          <span className="memory-list-kind"><Icon size={20} /></span><span><time>{memory.occurredOn}</time><strong>{memory.title || "未命名记忆"}</strong><span className="memory-list-excerpt">{memory.body || "这条记忆包含媒体附件。"}</span></span>
        </button>
        <div className="memory-list-actions"><button className="icon-button" aria-label={`编辑记忆：${memory.title || "未命名记忆"}`} onClick={() => onEdit(memory)}><Edit3 size={18} /></button><button className="icon-button danger-icon" aria-label={`删除记忆：${memory.title || "未命名记忆"}`} onClick={() => onDelete(memory)}><Trash2 size={18} /></button></div>
      </article>;
    })}
  </div>;
}
