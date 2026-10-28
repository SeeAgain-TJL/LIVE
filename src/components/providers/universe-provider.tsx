"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MemoryInput, Planet, PlanetInput, UniverseData, Media } from "@/domain/types";
import { isDate, nextPosition, validatePlanet } from "@/domain/planet";
import { DATA_KEY, LocalUniverseRepository } from "@/data/local-repository";
import { deleteMedia, putMedia } from "@/data/media-store";

interface UniverseContextValue {
  data: UniverseData | null;
  error: string | null;
  ready: boolean;
  createPlanet(input: PlanetInput): Planet;
  updatePlanet(id: string, input: PlanetInput): Promise<void>;
  deletePlanet(id: string): Promise<void>;
  saveMemory(planetId: string, input: MemoryInput, id?: string): Promise<void>;
  deleteMemory(id: string): Promise<void>;
  exportData(raw?: boolean): void;
}

const UniverseContext = createContext<UniverseContextValue | null>(null);

export function UniverseProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<UniverseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        setData(new LocalUniverseRepository(localStorage).load());
        setError(null);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "浏览器存储不可用。");
      }
      setReady(true);
    };
    // Read an external browser store only after hydration. Later reads arrive via storage events.
    load();
    const sync = (event: StorageEvent) => { if (event.key === DATA_KEY || event.key === null) load(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const commit = useCallback((next: UniverseData) => {
    if (!data) throw new Error("宇宙尚未载入，暂时不能保存。");
    const saved = new LocalUniverseRepository(localStorage).save(next, data.revision);
    setData(saved);
  }, [data]);

  const createPlanet = (input: PlanetInput) => {
    if (!data) throw new Error("宇宙尚未载入。");
    const issue = validatePlanet(input);
    if (issue) throw new Error(issue);
    const now = new Date().toISOString();
    const planet: Planet = {
      ...input, id: crypto.randomUUID(), universeId: data.universe.id,
      position: nextPosition(data.planets), visibility: "private", isDemo: false,
      createdAt: now, updatedAt: now,
    };
    commit({ ...data, planets: [...data.planets, planet] });
    return planet;
  };

  const updatePlanet = async (id: string, input: PlanetInput) => {
    if (!data || !data.planets.some(p => p.id === id)) throw new Error("这颗星球不存在。");
    const issue = validatePlanet(input);
    if (issue) throw new Error(issue);
    commit({ ...data, planets: data.planets.map(p => p.id === id ? { ...p, ...input, isDemo: false, updatedAt: new Date().toISOString() } : p) });
  };

  const deletePlanet = async (id: string) => {
    if (!data || !data.planets.some(p => p.id === id)) throw new Error("这颗星球不存在。");
    const memoryIds = data.memories.filter(m => m.planetId === id).flatMap(m => m.mediaIds ?? []);
    commit({ ...data, planets: data.planets.filter(p => p.id !== id), memories: data.memories.filter(m => m.planetId !== id), media: (data.media ?? []).filter(m => !memoryIds.includes(m.id)) });
    await deleteMedia(memoryIds);
  };

  const saveMemory = async (planetId: string, input: MemoryInput, id?: string) => {
    if (!data || !data.planets.some(p => p.id === planetId)) throw new Error("星球不存在。");
    if (!input.title.trim() && !input.body.trim()) throw new Error("请写下标题或正文。");
    if (input.title.length > 120 || input.body.length > 50000) throw new Error("标题最多 120 字，正文最多 50000 字。");
    if (!isDate(input.occurredOn)) throw new Error("请选择有效的发生日期。");
    const now = new Date().toISOString();
    const existing = id ? data.memories.find(m => m.id === id && m.planetId === planetId) : null;
    if (id && !existing) throw new Error("这条记忆不存在。");
    const files = input.files ?? [];
    for (const file of files) {
      if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) throw new Error("仅支持图片或视频文件。");
      if (file.size > 100 * 1024 * 1024) throw new Error("单个媒体文件不能超过 100 MB。");
    }
    const memoryId = existing?.id ?? crypto.randomUUID();
    const uploaded: Media[] = [];
    for (const file of files) {
      const media = { id: crypto.randomUUID(), memoryId, kind: file.type.startsWith("video/") ? "video" as const : "image" as const, name: file.name.slice(0, 255), mimeType: file.type, size: file.size, createdAt: now };
      await putMedia(media.id, file); uploaded.push(media);
    }
    const retained = (existing?.mediaIds ?? []).filter(mediaId => !(input.removeMediaIds ?? []).includes(mediaId));
    const memory = { id: memoryId, planetId, title: input.title, body: input.body, occurredOn: input.occurredOn, kind: (retained.length || uploaded.length) ? "mixed" as const : "text" as const, mediaIds: [...retained, ...uploaded.map(m => m.id)], createdAt: existing?.createdAt ?? now, updatedAt: now };
    commit({ ...data,
      planets: data.planets.map(p => p.id === planetId ? { ...p, updatedAt: now } : p),
      memories: existing ? data.memories.map(m => m.id === id ? memory : m) : [...data.memories, memory],
      media: [...(data.media ?? []).filter(m => !(input.removeMediaIds ?? []).includes(m.id)), ...uploaded],
    });
    await deleteMedia(input.removeMediaIds ?? []);
  };

  const deleteMemory = async (id: string) => {
    if (!data) throw new Error("宇宙尚未载入。");
    const memory = data.memories.find(m => m.id === id);
    if (!memory) throw new Error("这条记忆不存在，请刷新后重试。");
    commit({ ...data,
      planets: data.planets.map(p => p.id === memory.planetId ? { ...p, updatedAt: new Date().toISOString() } : p),
      memories: data.memories.filter(m => m.id !== id),
    });
    await deleteMedia(memory.mediaIds ?? []);
  };

  const exportData = (raw = false) => {
    const content = raw ? localStorage.getItem(DATA_KEY) : JSON.stringify(data, null, 2);
    if (!content) throw new Error("没有可以导出的数据。");
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `universe-of-me-${new Date().toISOString().slice(0, 10)}${raw ? "-raw" : ""}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <UniverseContext.Provider value={{ data, error, ready, createPlanet, updatePlanet, deletePlanet, saveMemory, deleteMemory, exportData }}>{children}</UniverseContext.Provider>;
}

export function useUniverse() {
  const context = useContext(UniverseContext);
  if (!context) throw new Error("UniverseProvider is required");
  return context;
}
