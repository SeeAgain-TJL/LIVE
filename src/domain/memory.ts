import type { Media, Memory, Vec3 } from "./types.ts";

export type MemoryMediaKind = "text" | "photo" | "video" | "mixed";
export type MemoryFilter = "all" | "photo" | "video";

export function memoryMediaKind(memory: Memory, media: Media[]): MemoryMediaKind {
  const kinds = (memory.mediaIds ?? []).map(id => media.find(item => item.id === id)?.kind).filter(Boolean);
  if (kinds.length === 0) return "text";
  if (kinds.every(kind => kind === "image")) return "photo";
  if (kinds.every(kind => kind === "video")) return "video";
  return "mixed";
}

export function memoryMatches(memory: Memory, media: Media[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const names = (memory.mediaIds ?? []).map(id => media.find(item => item.id === id)?.name ?? "").join(" ");
  return `${memory.title} ${memory.body} ${memory.occurredOn} ${names}`.toLocaleLowerCase().includes(needle);
}

export function memoryPassesFilter(memory: Memory, media: Media[], filter: MemoryFilter): boolean {
  const kind = memoryMediaKind(memory, media);
  return filter === "all" || kind === filter || (filter === "photo" && kind === "mixed") || (filter === "video" && kind === "mixed");
}

export function memoryPosition(index: number, total: number): Vec3 {
  const angle = index * 2.3999632297;
  const radius = 2.5 + Math.sqrt(index + 1) * 1.45;
  const layer = total <= 1 ? 0 : ((index % 3) - 1) * 1.35;
  return [Math.cos(angle) * radius, layer + Math.sin(index * 1.31) * 0.8, Math.sin(angle) * radius];
}
