import type { Memory, Planet, PlanetInput, Vec3 } from "./types.ts";

export const PLANET_TYPES = [
  { value: "rocky", label: "岩石", hint: "山脉与大地" },
  { value: "ocean", label: "海洋", hint: "海岸与云层" },
  { value: "gas", label: "气态", hint: "流动的气旋" },
  { value: "ice", label: "冰冻", hint: "冰川与裂隙" },
  { value: "ringed", label: "星环", hint: "尘埃的圆舞曲" },
] as const;

export function planetName(planet: Planet): string {
  return planet.name || "未命名草稿";
}

/** Demo geometry remains in the local archive for compatibility, but becomes a personal
 * world as soon as the user has attached a real memory to it. */
export function isPersonalPlanet(planet: Planet, memories: Memory[]): boolean {
  return !planet.isDemo || memories.some(memory => memory.planetId === planet.id);
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePlanet(input: PlanetInput): string | null {
  if (input.name && input.name.length > 60) return "星球名称最多 60 个字符。";
  if (input.description.length > 4000) return "星球介绍最多 4000 个字符。";
  if (input.startDate && !isDate(input.startDate)) return "请选择有效的开始日期。";
  if (input.endDate && !isDate(input.endDate)) return "请选择有效的结束日期。";
  if (input.ongoing && input.endDate) return "持续中的阶段不能同时设置结束日期。";
  if (input.endDate && !input.startDate) return "设置结束日期前，请先设置开始日期。";
  if (input.startDate && input.endDate && input.endDate < input.startDate) return "结束日期不能早于开始日期。";
  return null;
}

export function matchesYear(planet: Planet, year: number): boolean {
  if (!planet.startDate) return false;
  const first = Number(planet.startDate.slice(0, 4));
  const last = planet.endDate ? Number(planet.endDate.slice(0, 4)) : planet.ongoing ? new Date().getFullYear() : first;
  return year >= first && year <= last;
}

export function periodLabel(planet: Planet): string {
  if (!planet.startDate) return "时间尚未设定";
  const start = planet.startDate.replaceAll("-", ".");
  return `${start}${planet.ongoing ? " — 至今" : planet.endDate ? ` — ${planet.endDate.replaceAll("-", ".")}` : ""}`;
}

export function nextPosition(planets: Planet[]): Vec3 {
  // Deterministic spiral: never stack new planets at the origin.
  const index = planets.length;
  const angle = index * 2.3999632297;
  const radius = 11 + Math.sqrt(index) * 3.5;
  return [Math.cos(angle) * radius, Math.sin(index * 1.7) * 4, Math.sin(angle) * radius];
}
