"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { ActorEvent } from "@/domain/guide-lab";
import { actorBusy, actorLines, initialActor, reduceActor } from "@/domain/guide-lab";
import { readLabArchive } from "@/data/guide-lab-reader";
import type { UniverseData } from "@/domain/types";
import { sampleActor, type LabActorAsset, type LabMetrics } from "./asset-contract";
import type { ModelStatus } from "./lab-scene";
import { useReducedMotion } from "@/components/three/use-render-preferences";

const Scene = dynamic(() => import("./lab-scene"), { ssr: false, loading: () => <p className="lab-wait">正在准备 3D 实验场景…</p> });

export function GuideLab() {
  const [archive, setArchive] = useState<UniverseData | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [planetId, setPlanetId] = useState("");
  const [memoryId, setMemoryId] = useState("");
  const [query, setQuery] = useState("");
  const [snapshot, dispatch] = useReducer(reduceActor, initialActor);
  const [asset, setAsset] = useState<LabActorAsset>(sampleActor);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<ModelStatus>({ phase: "loading", message: "等待加载模型…" });
  const [metrics, setMetrics] = useState<LabMetrics | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [low, setLow] = useState(false);
  const [animation, setAnimation] = useState<{ buffer: ArrayBuffer; serial: number } | null>(null);
  const [animationStatus, setAnimationStatus] = useState("");
  const reduced = useReducedMotion();
  const busy = actorBusy(snapshot);

  useEffect(() => {
    const read = () => {
      try { setArchive(readLabArchive(localStorage)); setArchiveError(null); }
      catch (error) { setArchive(null); setArchiveError(error instanceof Error ? error.message : "无法读取当前浏览器档案。"); }
    };
    // Read-only subscription. No seed save, migration, preferences, or media DB opens.
    const timer = setTimeout(read, 0);
    window.addEventListener("storage", read); window.addEventListener("focus", read);
    return () => { clearTimeout(timer); window.removeEventListener("storage", read); window.removeEventListener("focus", read); };
  }, []);

  useEffect(() => {
    if (asset.status !== "user-local") return;
    return () => URL.revokeObjectURL(asset.url);
  }, [asset]);

  const onEvent = useCallback((event: ActorEvent) => {
    dispatch(event);
    setEvents(previous => [...previous.slice(-11), event.type]);
  }, []);

  const cancel = useCallback(() => { setAnimation(null); setAnimationStatus(""); onEvent({ type: "CANCEL" }); }, [onEvent]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [cancel]);

  const planet = archive?.planets.find(p => p.id === (snapshot.planetId ?? planetId)) ?? archive?.planets.find(p => p.id === planetId) ?? null;
  const memories = useMemo(() => (archive?.memories ?? []).filter(m => (!planetId || m.planetId === planetId) && `${m.title} ${m.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)), [archive, planetId, query]);
  const selectedMemory = archive?.memories.find(m => m.id === (snapshot.memoryId ?? memoryId)) ?? null;
  const ready = snapshot.ready && status.phase === "ready";
  const disabled = !ready || busy || !!animation;

  return <main className="guide-lab" data-actor-state={snapshot.state} data-model-status={status.phase}>
    <header className="lab-header"><div><Link href="/">← 返回宇宙</Link><p>CHARACTER RESEARCH / 01</p><h1>记忆引导者 · VRM 实验室</h1></div><span className="lab-badge">独立技术实验 · 未替换正式角色</span></header>
    <div className="lab-layout">
      <section className="lab-viewport" aria-label="VRM 骨骼动作实验场景">
        <Scene key={reload} asset={asset} snapshot={snapshot} planet={planet} memory={selectedMemory} animation={animation} reduced={reduced} low={low} onEvent={onEvent} onStatus={setStatus} onAnimationStatus={setAnimationStatus} onMetrics={setMetrics} />
        <div className="lab-model-caption"><span>VRM 1.0 / 真实骨骼渲染</span><strong>{asset.label}</strong><small>当前样本用于验证动作；银蓝长发、成年星空服装原创模型尚待制作。</small></div>
        <div className="lab-stage-caption" aria-live="polite"><span data-testid="actor-state">{snapshot.state}</span><p>{actorLines[snapshot.state]}</p>{selectedMemory && <small>{selectedMemory.title || "无标题记忆"} · {selectedMemory.occurredOn}</small>}</div>
        {status.phase !== "ready" && <div className="lab-loading" role={status.phase === "error" ? "alert" : "status"}><strong>{status.phase === "error" ? "模型未能就绪" : "正在准备人物"}</strong><p>{status.message}</p>{status.phase === "error" && <button onClick={() => setReload(n => n + 1)}>重试模型加载</button>}</div>}
      </section>
      <aside className="lab-controls" aria-label="动作实验控制">
        <p className={`lab-status ${status.phase}`} role="status">{status.message}</p>
        <section><h2>01 · 引导出发与抵达</h2><label htmlFor="lab-planet">当前浏览器的星球</label><select id="lab-planet" value={planetId} disabled={busy} onChange={e => { cancel(); setPlanetId(e.target.value); setMemoryId(""); }}><option value="">选择一颗星球</option>{archive?.planets.map((p, i) => <option key={p.id} value={p.id}>{p.name || `未命名草稿 ${i + 1}`}{p.isDemo ? "（外观示例）" : ""}</option>)}</select>
          <button className="lab-primary" disabled={disabled || !planetId} onClick={() => onEvent({ type: "TRAVEL", planetId })}>A → B · 注视、指引、飞行、欢迎</button>
          <div className="lab-button-row"><button disabled={disabled} onClick={() => onEvent({ type: "INSPECT" })}>注视与转身</button><button disabled={disabled} onClick={() => onEvent({ type: "WELCOME" })}>欢迎动作</button></div>
          <p className="lab-note">镜头在实验场景中真实移动，正式宇宙的路由和镜头控制保持原样。无星球时，注视使用空间校准目标。</p>
        </section>
        <section><h2>02 · 召唤真实记忆</h2><label htmlFor="lab-query">查找当前星球的记忆</label><input id="lab-query" type="search" placeholder="标题或正文关键词" value={query} disabled={busy} onChange={e => setQuery(e.target.value)} />
          <label htmlFor="lab-memory">找到 {memories.length} 条 · 选择目标</label><select id="lab-memory" disabled={busy} value={memoryId} onChange={e => { cancel(); setMemoryId(e.target.value); }}><option value="">选择真实记忆</option>{memories.slice(0, 100).map(m => <option key={m.id} value={m.id}>{m.occurredOn} · {m.title || "无标题记忆"}</option>)}</select>
          {memories.length > 100 && <p className="lab-note">仅显示前 100 条，请用关键词缩小结果。</p>}
          <button className="lab-primary" disabled={disabled || !memories.some(m => m.id === memoryId)} onClick={() => { const m = memories.find(m => m.id === memoryId); if (m) onEvent({ type: "FIND_MEMORY", memoryId: m.id, planetId: m.planetId }); }}>C · 注视 → 伸手 → 掌心展示</button>
          {!memories.length && <p className="lab-note">没有符合条件的真实记忆。请在原有记忆空间保存后回来；实验页不会生成经历。</p>}
        </section>
        <div className="lab-button-row"><button onClick={cancel}>取消动作 / Escape</button><label className="lab-check"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} />简化渲染</label></div>
        {reduced && <p className="lab-note">已尊重系统减少动态效果：缩短动作、不循环呼吸与眨眼。</p>}
        <details className="lab-assets"><summary>资产接口与诊断</summary><p className="lab-note">{asset.provenance}。本地导入只在当前标签页使用，不上传、不保存。</p><label>替换为已获授权的自包含 VRM 1.0<input aria-label="导入本地 VRM" type="file" accept=".vrm" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 35 * 1024 * 1024) { setAnimationStatus("模型须小于 35 MB。"); return; } cancel(); setAsset({ ...sampleActor, id: crypto.randomUUID(), label: `本地模型：${f.name} · 待美术审核`, status: "user-local", url: URL.createObjectURL(f), provenance: "用户自行导入，授权由提供者确认" }); setReload(n => n + 1); e.target.value = ""; }} /></label>
          <button disabled={busy} onClick={() => { cancel(); setAsset(sampleActor); setReload(n => n + 1); }}>恢复官方技术样本</button>
          <label>可选：本地授权 VRM Animation 1.0<input aria-label="导入 VRMA 动作" type="file" accept=".vrma" disabled={disabled || reduced} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 35 * 1024 * 1024) { setAnimationStatus("动作文件须小于 35 MB。"); return; } try { setAnimation({ buffer: await f.arrayBuffer(), serial: Date.now() }); } catch { setAnimationStatus("无法读取动作文件。"); } }} /></label>
          {animationStatus && <p role="status" className="lab-note">{animationStatus}</p>}
          <p className="lab-note">当前 A/B/C 使用项目原创骨骼关键帧 + 双骨 IK；VRMA 接口已接通，尚无最终授权动作文件。</p>
          <output data-testid="lab-metrics" data-values={metrics ? JSON.stringify(metrics) : undefined}>{metrics ? `${metrics.fps} FPS · p95 ${metrics.frameP95.toFixed(1)} ms\n${metrics.calls} draw calls · ${metrics.triangles.toLocaleString()} triangles · ${metrics.textures} textures\n模型 ${Math.round(metrics.loadMs)} ms · 掌心误差 ${(metrics.palmError * 100).toFixed(2)} cm` : "等待采样…"}</output>
          <p className="lab-note">滚动约 240 帧窗口；仅反映当前浏览器，不代表真机性能。实验录屏保留绘图缓冲区会增加开销。</p>
          <ol data-testid="lab-event-log">{events.map((event, i) => <li key={i}>{event}</li>)}</ol>
        </details>
        {archiveError && <p role="alert" className="lab-note">{archiveError} 原文未修改。</p>}
        {!archive && !archiveError && <p className="lab-note">当前 origin 没有已保存档案。请使用与你日常相同的主机和端口；可以先验证独立骨骼动作。</p>}
        <p className="lab-readonly">只读开发档案 · 不写 localStorage · 不访问 IndexedDB · 不联网检索私人记忆</p>
      </aside>
    </div>
    {snapshot.state === "presenting" && selectedMemory && <section className="lab-memory-preview" aria-label="掌心记忆内容"><div><span>掌心中的真实记忆 · {selectedMemory.occurredOn}</span><h2>{selectedMemory.title || "无标题记忆"}</h2><p>{selectedMemory.body}</p>{!!selectedMemory.mediaIds?.length && <small>含 {selectedMemory.mediaIds.length} 个媒体附件；为保持只读，实验不打开媒体数据库。</small>}</div><button onClick={cancel}>放回记忆球</button></section>}
  </main>;
}
