"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MemoryInput, Planet, PlanetInput, UniverseData } from "@/domain/types";
import { isDate, nextPosition, validatePlanet } from "@/domain/planet";
import { DATA_KEY, LocalUniverseRepository } from "@/data/local-repository";

interface UniverseContextValue {
  data: UniverseData | null;
  error: string | null;
  ready: boolean;
  createPlanet(input: PlanetInput): Planet;
  updatePlanet(id: string, input: PlanetInput): void;
  saveMemory(planetId: string, input: MemoryInput, id?: string): void;
  deleteMemory(id: string): void;
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

  const updatePlanet = (id: string, input: PlanetInput) => {
    if (!data || !data.planets.some(p => p.id === id)) throw new Error("这颗星球不存在。");
    const issue = validatePlanet(input);
    if (issue) throw new Error(issue);
    commit({ ...data, planets: data.planets.map(p => p.id === id ? { ...p, ...input, isDemo: false, updatedAt: new Date().toISOString() } : p) });
  };

  const saveMemory = (planetId: string, input: MemoryInput, id?: string) => {
    if (!data || !data.planets.some(p => p.id === planetId)) throw new Error("星球不存在。");
    if (!input.title.trim() && !input.body.trim()) throw new Error("请写下标题或正文。");
    if (input.title.length > 120 || input.body.length > 50000) throw new Error("标题最多 120 字，正文最多 50000 字。");
    if (!isDate(input.occurredOn)) throw new Error("请选择有效的发生日期。");
    const now = new Date().toISOString();
    const existing = id ? data.memories.find(m => m.id === id && m.planetId === planetId) : null;
    if (id && !existing) throw new Error("这条记忆不存在。");
    const memory = { ...input, id: existing?.id ?? crypto.randomUUID(), planetId, kind: "text" as const, createdAt: existing?.createdAt ?? now, updatedAt: now };
    commit({ ...data,
      planets: data.planets.map(p => p.id === planetId ? { ...p, updatedAt: now } : p),
      memories: existing ? data.memories.map(m => m.id === id ? memory : m) : [...data.memories, memory],
    });
  };

  const deleteMemory = (id: string) => {
    if (!data) throw new Error("宇宙尚未载入。");
    const memory = data.memories.find(m => m.id === id);
    if (!memory) throw new Error("这条记忆不存在，请刷新后重试。");
    commit({ ...data,
      planets: data.planets.map(p => p.id === memory.planetId ? { ...p, updatedAt: new Date().toISOString() } : p),
      memories: data.memories.filter(m => m.id !== id),
    });
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

  return <UniverseContext.Provider value={{ data, error, ready, createPlanet, updatePlanet, saveMemory, deleteMemory, exportData }}>{children}</UniverseContext.Provider>;
}

export function useUniverse() {
  const context = useContext(UniverseContext);
  if (!context) throw new Error("UniverseProvider is required");
  return context;
}
