import type { UniverseData, UniverseRepository } from "../domain/types.ts";
import { isDate, validatePlanet } from "../domain/planet.ts";
import { createSeed } from "./seed.ts";

export const DATA_KEY = "universe-of-me:data:v1";
export const RECOVERY_KEY = "universe-of-me:recovery:v1";
export const CAMERA_KEY = "universe-of-me:camera:v1";
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const nullableDate = (v: unknown) => v === null || (typeof v === "string" && isDate(v));
const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10000);
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Fail closed on corrupt / future schemas; never silently overwrite personal data. */
export function parseUniverse(raw: string): UniverseData {
  const d: unknown = JSON.parse(raw);
  if (!object(d) || ![1, 2].includes(d.schemaVersion as number) || !Number.isSafeInteger(d.revision) || (d.revision as number) < 0 ||
      !object(d.universe) || !text(d.universe.id, 100) || !text(d.universe.name, 100) ||
      !Array.isArray(d.planets) || !Array.isArray(d.memories) || !Array.isArray(d.galaxies) || (d.schemaVersion === 2 && !Array.isArray(d.media))) throw new Error("数据版本不受支持或档案已损坏。原始数据未被修改，请先导出原始备份。");
  const galaxyIds = new Set<string>();
  for (const g of d.galaxies) {
    if (!object(g) || !text(g.id, 100) || !g.id || galaxyIds.has(g.id) || !text(g.name, 60) || typeof g.color !== "string" || !/^#[a-f\d]{6}$/i.test(g.color)) throw new Error("星系数据不完整。");
    galaxyIds.add(g.id);
  }
  const planetIds = new Set<string>();
  for (const p of d.planets) {
    if (!object(p) || !text(p.id, 100) || !p.id || planetIds.has(p.id) || p.universeId !== d.universe.id ||
        !(p.name === null || text(p.name, 60)) || !text(p.description, 4000) || !nullableDate(p.startDate) || !nullableDate(p.endDate) ||
        typeof p.ongoing !== "boolean" || !(p.galaxyId === null || galaxyIds.has(p.galaxyId as string)) ||
        !vector(p.position) || p.visibility !== "private" || typeof p.isDemo !== "boolean" || !timestamp(p.createdAt) || !timestamp(p.updatedAt) ||
        !object(p.appearance) || !["rocky", "ocean", "gas", "ice", "ringed"].includes(p.appearance.type as string) ||
        typeof p.appearance.color !== "string" || !/^#[a-f\d]{6}$/i.test(p.appearance.color) ||
        typeof p.appearance.rings !== "boolean" || !Number.isSafeInteger(p.appearance.seed) ||
        typeof p.appearance.size !== "number" || !Number.isFinite(p.appearance.size) || p.appearance.size < 0.5 || p.appearance.size > 4) throw new Error("星球数据不完整。原始数据未被修改。");
    if (validatePlanet(p as unknown as UniverseData["planets"][number])) throw new Error("星球日期范围无效。");
    planetIds.add(p.id);
  }
  const memoryIds = new Set<string>();
  for (const m of d.memories) {
    if (!object(m) || !text(m.id, 100) || !m.id || memoryIds.has(m.id) || !planetIds.has(m.planetId as string) ||
        !["text", "mixed"].includes(m.kind as string) || !text(m.title, 120) || !text(m.body, 50000) || (!m.body.trim() && !m.title.trim()) ||
        (m.mediaIds !== undefined && (!Array.isArray(m.mediaIds) || m.mediaIds.some((id: unknown) => typeof id !== "string"))) ||
        typeof m.occurredOn !== "string" || !isDate(m.occurredOn) || !timestamp(m.createdAt) || !timestamp(m.updatedAt)) throw new Error("记忆数据不完整。原始数据未被修改。");
    memoryIds.add(m.id);
  }
  const media = Array.isArray(d.media) ? d.media : [];
  const mediaIds = new Set<string>();
  for (const m of media) {
    if (!object(m) || !text(m.id, 100) || !m.id || mediaIds.has(m.id) || !planetIds.size || !text(m.memoryId, 100) ||
        !["image", "video"].includes(m.kind as string) || !text(m.name, 255) || !text(m.mimeType, 100) ||
        !Number.isSafeInteger(m.size) || (m.size as number) < 0 || !timestamp(m.createdAt)) throw new Error("Media metadata is invalid.");
    mediaIds.add(m.id);
  }
  const memoryIdsForMedia = new Set((d.memories as Array<Record<string, unknown>>).map(m => m.id as string));
  if (media.some(m => !memoryIdsForMedia.has((m as Record<string, unknown>).memoryId as string))) throw new Error("Media metadata is invalid.");
  if ((d.memories as Array<Record<string, unknown>>).some(m => (m.mediaIds as string[] | undefined)?.some(id => !mediaIds.has(id)))) throw new Error("Memory media references are invalid.");
  const normalized = {
    ...(d as Record<string, unknown>), schemaVersion: 2,
    memories: (d.memories as Array<Record<string, unknown>>).map(m => ({ ...m, kind: m.kind === "mixed" ? "mixed" : "text", mediaIds: Array.isArray(m.mediaIds) ? m.mediaIds : [] })),
    media,
  } as unknown as UniverseData;
  return normalized;
}

export class LocalUniverseRepository implements UniverseRepository {
  private readonly storage: StoragePort;
  constructor(storage: StoragePort) { this.storage = storage; }
  load(): UniverseData {
    const raw = this.storage.getItem(DATA_KEY);
    return raw === null ? createSeed() : parseUniverse(raw);
  }
  save(data: UniverseData, expectedRevision: number): UniverseData {
    const current = this.storage.getItem(DATA_KEY);
    if ((current === null && expectedRevision !== 0) || (current !== null && parseUniverse(current).revision !== expectedRevision)) throw new Error("另一标签页已更新或移除了宇宙。请刷新后重试，以免覆盖新记录。");
    const next = { ...data, revision: expectedRevision + 1 };
    const serialized = JSON.stringify(next);
    parseUniverse(serialized);
    try {
      // Preserve last known good snapshot. If either write fails, do not claim success.
      if (current) this.storage.setItem(RECOVERY_KEY, current);
      this.storage.setItem(DATA_KEY, serialized);
    } catch {
      throw new Error("本地保存失败，可能是浏览器空间不足或禁用了存储。内容仍在表单中，请复制或导出备份后重试。");
    }
    return next;
  }
}
