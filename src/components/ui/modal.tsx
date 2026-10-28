"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ title, eyebrow, children, onClose, wide = false }: {
  title: string; eyebrow: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="modal-header"><div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><button type="button" className="icon-button" aria-label="关闭窗口" onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}
