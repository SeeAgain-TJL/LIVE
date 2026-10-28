"use client";

import { Edit3, Trash2, X } from "lucide-react";
import type { Media, Memory } from "@/domain/types";
import { MediaAttachment } from "./media-attachment";

const text = {
  unnamed: "\u672a\u547d\u540d\u8bb0\u5fc6",
  close: "\u5173\u95ed\u8bb0\u5fc6\u8be6\u60c5",
  edit: "\u7f16\u8f91\u8bb0\u5fc6",
  remove: "\u5220\u9664\u8bb0\u5fc6",
  planet: "\u6240\u5c5e\u661f\u7403",
};

export function MemoryDetails({ memory, media, planetName, onClose, onEdit, onDelete }: {
  memory: Memory; media: Media[]; planetName: string; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return <article className="memory-detail-panel" aria-label={text.unnamed}>
    <header><div><p className="eyebrow">MEMORY ORB / {memory.occurredOn}</p><h2>{memory.title || text.unnamed}</h2></div><button className="icon-button" aria-label={text.close} onClick={onClose}><X size={17} /></button></header>
    <div className="memory-detail-meta"><span>{text.planet}</span><strong>{planetName}</strong><time>{memory.occurredOn}</time></div>
    {memory.body && <p className="memory-detail-body">{memory.body}</p>}
    <div className="memory-detail-media">{(memory.mediaIds ?? []).map(id => { const item = media.find(candidate => candidate.id === id); return item ? <MediaAttachment key={item.id} media={item} /> : null; })}</div>
    <footer><button className="button secondary" onClick={onEdit}><Edit3 size={14} />{text.edit}</button><button className="icon-button danger-icon" aria-label={text.remove} onClick={onDelete}><Trash2 size={15} /></button></footer>
  </article>;
}
