import type { Galaxy, UniverseData, Vec3 } from "./types.ts";

export const DEFAULT_GALAXY: Galaxy = { id: "unclassified", name: "未分类星系", color: "#94b7ee" };

/** Pure, idempotent relationship migration; never renames or moves existing classified planets. */
export function withGalaxyMembership(data: UniverseData): UniverseData {
  return {
    ...data,
    galaxies: data.galaxies.some(g => g.id === DEFAULT_GALAXY.id) ? data.galaxies : [DEFAULT_GALAXY, ...data.galaxies],
    planets: data.planets.map(p => p.galaxyId == null ? { ...p, galaxyId: DEFAULT_GALAXY.id } : p),
  };
}

export function galaxyPosition(index: number): Vec3 {
  // Staggered depths, not a flat golden-angle catalogue. Derived scene positions only.
  const composition: Vec3[] = [[10, -4, 22], [-22, 16, -38], [37, 18, -118], [-36, -17, -88], [52, -20, -190]];
  if (index < composition.length) return [...composition[index]];
  const angle = index * 2.399963;
  const radius = 36 + Math.sqrt(index) * 13;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, -30 - index * 11];
}

export type TravelTarget = { kind: "galaxy" | "planet"; id: string };
export function travelUrl(target: TravelTarget, trip = Date.now()): string {
  return `/?${target.kind === "galaxy" ? "travelGalaxy" : "travelPlanet"}=${encodeURIComponent(target.id)}&trip=${trip}`;
}
