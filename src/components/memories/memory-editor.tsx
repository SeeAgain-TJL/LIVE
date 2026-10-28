"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Feather } from "lucide-react";
import type { Memory } from "@/domain/types";
import { useUniverse } from "@/components/providers/universe-provider";
import { Modal } from "@/components/ui/modal";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MemoryEditor({ planetId, memory, onClose }: { planetId: string; memory?: Memory; onClose: () => void }) {
  const { saveMemory } = useUniverse();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState(memory?.title ?? "");
  const [body, setBody] = useState(memory?.body ?? "");
  const [occurredOn, setOccurredOn] = useState(memory?.occurredOn ?? today());
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await saveMemory(planetId, { title: title.trim(), body: body.trim(), occurredOn, files }, memory?.id); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败，内容仍保留在表单中。"); }
  };
  return <Modal title={memory ? "重新读过，再添一笔" : "留住这一刻"} eyebrow={memory ? "EDIT A MEMORY" : "A MOMENT WORTH KEEPING"} onClose={onClose}>
    <form className="memory-editor" onSubmit={submit}><label className="field">发生日期<input type="date" required value={occurredOn} onChange={e => setOccurredOn(e.target.value)} /></label><label className="field">记忆标题<input autoFocus maxLength={120} placeholder="给这一个瞬间起个名字（可选）" value={title} onChange={e => setTitle(e.target.value)} /></label><label className="field">写下你的记忆<textarea rows={9} maxLength={50000} placeholder="有些细节，现在不记下来，以后就忘了。" value={body} onChange={e => setBody(e.target.value)} /></label><label className="field">添加照片或视频<input type="file" accept="image/*,video/*" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} /><span className="field-help">开发版媒体保存在当前浏览器；单个文件最大 100 MB。</span></label><div className="memory-editor-count">{body.length.toLocaleString()} / 50,000 · {files.length} 个待上传文件</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="memory-editor-footer"><span><Feather size={13} />文字与媒体会保存到当前浏览器</span><button className="button" type="submit">保存记忆<ArrowRight size={15} /></button></div></form>
  </Modal>;
}
