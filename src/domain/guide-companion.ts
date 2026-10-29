import type { UniverseData } from "./types.ts";
import { memoryMatches, memoryPassesFilter } from "./memory.ts";

export type GuideState = "idle" | "welcome" | "thinking" | "speaking" | "guiding" | "arrived";
export interface GuidePreferences {
  version: 1;
  edge: "left" | "right";
  heightRatio: number;
  hidden: boolean;
  dialogueOpen: boolean;
  promptsEnabled: boolean;
}
export const DEFAULT_GUIDE_PREFERENCES: GuidePreferences = { version: 1, edge: "left", heightRatio: 1, hidden: false, dialogueOpen: false, promptsEnabled: true };
export function validGuidePreferences(value: unknown): value is GuidePreferences {
  if (!value || typeof value !== "object") return false;
  const p = value as GuidePreferences;
  return p.version === 1 && (p.edge === "left" || p.edge === "right") && Number.isFinite(p.heightRatio) && p.heightRatio >= 0 && p.heightRatio <= 1
    && typeof p.hidden === "boolean" && typeof p.dialogueOpen === "boolean" && typeof p.promptsEnabled === "boolean";
}
export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, n));
export function guideBounds(width: number, height: number, compact = false) {
  const mobile = width <= 760;
  const w = compact ? 52 : mobile ? 104 : 140;
  const h = compact ? 52 : mobile ? 180 : height <= 760 ? 190 : 232;
  return { w, h, minX: 12, maxX: Math.max(12, width - w - 12), minY: 88, maxY: Math.max(88, height - h - 20) };
}
export function guidePosition(p: Pick<GuidePreferences, "edge" | "heightRatio">, width: number, height: number, compact = false) {
  const b = guideBounds(width, height, compact);
  return { ...b, x: p.edge === "left" ? b.minX : b.maxX, y: b.minY + p.heightRatio * (b.maxY - b.minY) };
}
export function snapGuide(x: number, y: number, width: number, height: number, compact = false): Pick<GuidePreferences, "edge" | "heightRatio"> {
  const b = guideBounds(width, height, compact);
  return { edge: x + b.w / 2 < width / 2 ? "left" : "right", heightRatio: b.maxY === b.minY ? 1 : (clamp(y, b.minY, b.maxY) - b.minY) / (b.maxY - b.minY) };
}
export type GuideMemoryFilter = "all" | "text" | "photo" | "video";
export function findGuideMemories(data: UniverseData, query: string, filter: GuideMemoryFilter = "all", year = "") {
  return data.memories.filter(m => memoryMatches(m, data.media ?? [], query) && (filter === "text" ? !m.mediaIds?.length : memoryPassesFilter(m, data.media ?? [], filter)) && (!year || m.occurredOn.startsWith(year)))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export function memoryDestinationUrl(planetId: string, memoryId?: string) {
  return `/planet/${encodeURIComponent(planetId)}${memoryId ? `?memory=${encodeURIComponent(memoryId)}` : ""}`;
}
