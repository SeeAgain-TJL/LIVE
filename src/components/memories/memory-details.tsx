"use client";

import { Edit3, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
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
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      // A nested native edit/delete dialog owns Escape until it is dismissed.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      const fallback = document.querySelector<HTMLButtonElement>('[aria-controls="world-management"]');
      if (previous?.isConnected && previous !== document.body && previous.getClientRects().length) previous.focus({ preventScroll: true });
      else fallback?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return <article className="memory-detail-panel" role="dialog" aria-modal="false" aria-labelledby={titleId}>
    <header><div><p className="memory-detail-date"><time dateTime={memory.occurredOn}>{memory.occurredOn}</time> · 记忆档案</p><h2 id={titleId}>{memory.title || text.unnamed}</h2></div><button ref={closeButton} type="button" className="icon-button" aria-label={text.close} onClick={event => { event.stopPropagation(); onClose(); }}><X size={22} /></button></header>
    <div className="memory-detail-meta"><span>{text.planet}</span><strong>{planetName}</strong></div>
    <div className="memory-detail-content">
    {memory.body && <p className="memory-detail-body">{memory.body}</p>}
    <div className="memory-detail-media">{(memory.mediaIds ?? []).map(id => { const item = media.find(candidate => candidate.id === id); return item ? <MediaAttachment key={item.id} media={item} /> : null; })}</div>
    </div>
    <footer><button className="button secondary" onClick={onEdit}><Edit3 size={14} />{text.edit}</button><button className="icon-button danger-icon" aria-label={text.remove} onClick={onDelete}><Trash2 size={15} /></button></footer>
  </article>;
}
