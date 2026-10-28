"use client";

import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, RefreshCw, Sparkles } from "lucide-react";
import type { Planet, PlanetAppearance, PlanetInput } from "@/domain/types";
import { PLANET_TYPES } from "@/domain/planet";
import { useUniverse } from "@/components/providers/universe-provider";
import { Modal } from "@/components/ui/modal";

const Preview = dynamic(() => import("@/components/three/universe-scene").then(m => m.PlanetPreview), { ssr: false, loading: () => <div className="preview-fallback">正在生成星球…</div> });
const COLORS = ["#c5b194", "#5c93aa", "#b17654", "#b7d4df", "#8899bb", "#a6b59a", "#b18a9f", "#d3ad72"];

export function PlanetEditor({ planet, onClose, onSaved }: { planet?: Planet; onClose: () => void; onSaved: (id: string) => void }) {
  const { data, createPlanet, updatePlanet } = useUniverse();
  const [name, setName] = useState(planet?.name ?? "");
  const [description, setDescription] = useState(planet?.isDemo ? "" : planet?.description ?? "");
  const [startDate, setStartDate] = useState(planet?.startDate ?? "");
  const [endDate, setEndDate] = useState(planet?.endDate ?? "");
  const [ongoing, setOngoing] = useState(planet?.ongoing ?? false);
  const [galaxyId, setGalaxyId] = useState(planet?.galaxyId ?? "");
  const [appearance, setAppearance] = useState<PlanetAppearance>(() => planet?.appearance ?? { type: "ocean", color: "#5c93aa", seed: Math.floor(Math.random() * 100000), rings: false, size: 1.6 });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changeLook = (update: Partial<PlanetAppearance>) => setAppearance(a => ({ ...a, ...update }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const input: PlanetInput = { name: name.trim() || null, description: description.trim(), startDate: startDate || null, endDate: ongoing ? null : endDate || null, ongoing, galaxyId: galaxyId || null, appearance };
      if (planet) { updatePlanet(planet.id, input); onSaved(planet.id); }
      else onSaved(createPlanet(input).id);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); setSaving(false); }
  };
  return <Modal title={planet ? "重新描绘这颗星球" : "让一段人生，成为星球"} eyebrow={planet ? "EDIT YOUR PLANET" : "A NEW WORLD BEGINS"} onClose={onClose} wide>
    <form onSubmit={submit} className="planet-editor">
      <div className="editor-fields">
        <label className="field">星球名称 <span>由你亲自命名</span><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="哪一段人生，值得拥有一颗星球？" /></label>
        <p className="field-help">暂时没有名字也没关系，可以保存为未命名草稿。</p>
        <div className="field-grid"><label className="field">开始日期<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label className="field">结束日期<input type="date" value={endDate} min={startDate || undefined} disabled={ongoing} onChange={e => setEndDate(e.target.value)} /></label></div>
        <label className="check-field"><input type="checkbox" checked={ongoing} onChange={e => { setOngoing(e.target.checked); if (e.target.checked) setEndDate(""); }} />这段人生，仍在继续</label>
        <label className="field">星球介绍<textarea rows={3} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} placeholder="留下一些关于这段时光的线索…" /></label>
        <label className="field">所属星系<select value={galaxyId} onChange={e => setGalaxyId(e.target.value)}><option value="">暂不分类</option>{data?.galaxies.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      </div>
      <div className="editor-appearance"><div className="preview-orbit"><Preview appearance={appearance} /><span className="preview-caption">实时 3D 预览 · 拖动旋转</span></div>
        <p className="eyebrow">PLANET COMPOSITION</p>
        <div className="type-options">{PLANET_TYPES.map(type => <button type="button" className={appearance.type === type.value ? "type-option selected" : "type-option"} key={type.value} onClick={() => changeLook({ type: type.value, rings: type.value === "ringed" || appearance.rings })} title={type.hint}>{type.label}</button>)}</div>
        <div className="color-options">{COLORS.map(color => <button type="button" key={color} style={{ background: color }} className={appearance.color === color ? "swatch selected" : "swatch"} aria-label={`颜色 ${color}`} aria-pressed={appearance.color === color} onClick={() => changeLook({ color })}>{appearance.color === color && <Check size={15} />}</button>)}<label className="custom-color" title="自定义颜色"><input type="color" value={appearance.color} aria-label="自定义星球颜色" onChange={e => changeLook({ color: e.target.value })} /></label></div>
        <div className="look-controls"><label className="check-field"><input type="checkbox" checked={appearance.rings} onChange={e => changeLook({ rings: e.target.checked })} />添加星环</label><button type="button" className="text-button" onClick={() => changeLook({ seed: Math.floor(Math.random() * 100000) })}><RefreshCw size={13} />换一种纹理</button></div>
        <label className="field size-field">星球大小 <span>{appearance.size.toFixed(1)}</span><input type="range" min="0.7" max="3" step="0.1" value={appearance.size} onChange={e => changeLook({ size: Number(e.target.value) })} /></label>
      </div>
      <footer className="editor-footer">{error && <p className="form-error" role="alert">{error}</p>}<span><Sparkles size={13} />本地开发版 · 保存于当前浏览器</span><button className="button" disabled={saving} type="submit">{saving ? "正在保存…" : planet ? "保存星球" : "诞生一颗星球"}<ArrowRight size={16} /></button></footer>
    </form>
  </Modal>;
}
