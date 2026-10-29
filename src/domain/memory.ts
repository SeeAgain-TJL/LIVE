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
  if (total <= 1) return [0, 0, 0];
  const angle = index * 2.3999632297;
  const radius = 2.5 + Math.sqrt(index + 1) * 1.45;
  const layer = total <= 1 ? 0 : ((index % 3) - 1) * 1.35;
  return [Math.cos(angle) * radius, layer + Math.sin(index * 1.31) * 0.8, Math.sin(angle) * radius];
}

/** Frames the spatial index, rather than increasing the size of an individual orb. */
export function memoryView(total: number, selectedIndex: number, aspect: number) {
  const safeAspect = Math.max(0.25, aspect);
  const halfFov = 46 * Math.PI / 360;
  if (selectedIndex >= 0 && selectedIndex < total) {
    const orb = memoryPosition(selectedIndex, total);
    const target: Vec3 = [orb[0] + (safeAspect >= 1.25 ? 1.8 : 0), orb[1], orb[2]];
    const distance = Math.max(8, 4 / safeAspect);
    return { target, position: [target[0], target[1] + 0.5, target[2] + distance] as Vec3, distance };
  }
  let radius = 2.5;
  for (let i = 0; i < total; i++) radius = Math.max(radius, Math.hypot(...memoryPosition(i, total)) + 1.3);
  const distance = Math.max(11, radius / Math.sin(Math.atan(Math.tan(halfFov) * Math.min(1, safeAspect))));
  return { target: [0, 0, 0] as Vec3, position: [0, 0.7, distance] as Vec3, distance };
}
