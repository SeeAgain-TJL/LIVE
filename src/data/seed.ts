import type { PlanetAppearance, UniverseData, Vec3 } from "../domain/types.ts";
import { withGalaxyMembership } from "../domain/galaxy.ts";

export function createSeed(): UniverseData {
  const createdAt = new Date().toISOString();
  const samples: { appearance: PlanetAppearance; position: Vec3 }[] = [
    { appearance: { type: "ringed", color: "#c5b194", seed: 17, rings: true, size: 2.6 }, position: [1, 0, 0] },
    { appearance: { type: "ocean", color: "#5c93aa", seed: 91, rings: false, size: 1.25 }, position: [-9, 2.5, 1] },
    { appearance: { type: "rocky", color: "#b17654", seed: 53, rings: false, size: 1.65 }, position: [10, -2, -5] },
    { appearance: { type: "ice", color: "#b7d4df", seed: 38, rings: false, size: 1 }, position: [-4, -4.5, -9] },
    { appearance: { type: "gas", color: "#8899bb", seed: 71, rings: false, size: 1.6 }, position: [6, 5, -13] },
  ];
  return withGalaxyMembership({
    schemaVersion: 2,
    revision: 0,
    universe: { id: "local-universe", name: "UNIVERSE OF ME" },
    galaxies: [
      { id: "growth", name: "成长", color: "#a7c3b2" },
      { id: "friendship", name: "友情", color: "#bab1d8" },
      { id: "career", name: "事业", color: "#a9bfd8" },
      { id: "dream", name: "梦想", color: "#d5bc8f" },
    ],
    planets: samples.map((sample, i) => ({
      id: `demo-${i + 1}`, universeId: "local-universe", galaxyId: null,
      name: null, startDate: null, endDate: null, ongoing: false,
      description: "这是一颗用于体验外观与探索操作的示例星球，不代表你的人生经历。你可以编辑它，亲自赋予它名字和意义。",
      ...sample, visibility: "private", isDemo: true, createdAt, updatedAt: createdAt,
    })),
    memories: [],
    media: [],
  });
}
