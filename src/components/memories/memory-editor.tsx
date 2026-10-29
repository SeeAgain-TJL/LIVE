"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Feather } from "lucide-react";
import type { Memory } from "@/domain/types";
import { useUniverse } from "@/components/providers/universe-provider";
import { Modal } from "@/components/ui/modal";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MemoryEditor({ planetId, memory, onClose }: { planetId: string; memory?: Memory; onClose: (savedId?: string) => void }) {
  const { saveMemory } = useUniverse();
  const fieldId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState(memory?.title ?? "");
  const [body, setBody] = useState(memory?.body ?? "");
  const [occurredOn, setOccurredOn] = useState(memory?.occurredOn ?? today());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const savedId = await saveMemory(planetId, { title: title.trim(), body: body.trim(), occurredOn, files }, memory?.id);
      onClose(savedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，内容仍保留在表单中。"); }
    finally { setSaving(false); }
  };
  return <Modal title={memory ? "重新读过，再添一笔" : "留住这一刻"} eyebrow={memory ? "编辑记忆" : "新增记忆"} onClose={() => { if (!saving) onClose(); }}>
    <form className="memory-editor" onSubmit={submit} aria-busy={saving}>
      <div className="field"><label htmlFor={`${fieldId}-date`}>发生日期</label><input id={`${fieldId}-date`} type="date" required value={occurredOn} onChange={event => setOccurredOn(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${fieldId}-title`}>记忆标题</label><input id={`${fieldId}-title`} autoFocus maxLength={120} placeholder="给这一个瞬间起个名字（可选）" value={title} onChange={event => setTitle(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${fieldId}-body`}>写下你的记忆</label><textarea id={`${fieldId}-body`} rows={9} maxLength={50000} placeholder="有些细节，现在不记下来，以后就忘了。" value={body} onChange={event => setBody(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${fieldId}-files`}>添加照片或视频</label><input id={`${fieldId}-files`} type="file" accept="image/*,video/*" multiple aria-describedby={`${fieldId}-help`} onChange={event => setFiles(Array.from(event.target.files ?? []))} /><p id={`${fieldId}-help`} className="field-help">开发版媒体保存在当前浏览器；单个文件最大 100 MB。已有附件会保留。</p></div>
      <div className="memory-editor-count">{body.length.toLocaleString()} / 50,000 · {files.length} 个待上传文件</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="memory-editor-footer"><span><Feather size={15} />文字与媒体会保存到当前浏览器</span><button className="button" type="submit" disabled={saving}>{saving ? "正在保存…" : "保存记忆"}<ArrowRight size={16} /></button></div>
    </form>
  </Modal>;
}
