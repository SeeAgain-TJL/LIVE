import type { CameraBookmark } from "../domain/types.ts";

export interface PlanetVisit {
  planetId: string;
  galaxyId: string;
  origin: CameraBookmark;
  arrival: CameraBookmark;
}
export const visitKey = (planetId: string) => `universe-of-me:visit:v1:${encodeURIComponent(planetId)}`;

export function validBookmark(value: unknown): value is CameraBookmark {
  if (!value || typeof value !== "object") return false;
  const b = value as CameraBookmark;
  const vector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10000);
  return vector(b.position) && vector(b.target) && Math.hypot(...b.position.map((n, i) => n - b.target[i])) >= 1;
}

/** Optional tab-local navigation state, never archive data or media. */
export function saveVisit(visit: PlanetVisit): void {
  try { sessionStorage.setItem(visitKey(visit.planetId), JSON.stringify(visit)); } catch { /* Return still uses the per-galaxy camera bookmark. */ }
}

export function readVisit(planetId: string, galaxyId: string): PlanetVisit | null {
  try {
    const raw = sessionStorage.getItem(visitKey(planetId));
    const value = raw ? JSON.parse(raw) as PlanetVisit : null;
    return value?.planetId === planetId && value.galaxyId === galaxyId && validBookmark(value.origin) && validBookmark(value.arrival) ? value : null;
  } catch { return null; }
}

export function planetReturnUrl(planetId: string, galaxyId: string): string {
  return `/galaxy/${encodeURIComponent(galaxyId)}?planet=${encodeURIComponent(planetId)}&returnFrom=${encodeURIComponent(planetId)}`;
}
