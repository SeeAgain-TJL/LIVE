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
  const angle = index * 2.399963;
  const radius = 7 + Math.sqrt(index) * 7;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.8, Math.sin(index * 1.7) * 5];
}

export type TravelTarget = { kind: "galaxy" | "planet"; id: string };
export function travelUrl(target: TravelTarget, trip = Date.now()): string {
  return `/?${target.kind === "galaxy" ? "travelGalaxy" : "travelPlanet"}=${encodeURIComponent(target.id)}&trip=${trip}`;
}
