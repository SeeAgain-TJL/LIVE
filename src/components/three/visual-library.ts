import type { PlanetAppearance, PlanetType } from "../../domain/types.ts";

export interface VisualPreset {
  id: string;
  name: string;
  description: string;
  type: PlanetType;
  color: string;
  seed: number;
  meridian: number;
  atmosphere: { tint: string; height: number; density: number };
  relief: number;
  ring?: "gold" | "fragments";
  special?: true;
}

export const visualPresets: readonly VisualPreset[] = [
  { id: "red-wastes", name: "赤色荒原星", description: "铁锈色高原之间，一道巨型峡谷切过赤道，低地积着暗红尘埃。", type: "rocky", color: "#b97857", seed: 4100001, meridian: -.35, atmosphere: { tint: "#bd8166", height: .013, density: .19 }, relief: .056 },
  { id: "ancient-strata", name: "远古岩层星", description: "银灰岩层、冷色撞击盆地与交叠的古老坑缘。", type: "rocky", color: "#9e9894", seed: 4100002, meridian: -.46, atmosphere: { tint: "#9c9eaf", height: .006, density: .05 }, relief: .067 },
  { id: "jade-ocean", name: "翡翠海洋星", description: "明亮青绿浅海围绕分散群陆，长云锋沿海盆旋卷。", type: "ocean", color: "#458d85", seed: 4100003, meridian: .12, atmosphere: { tint: "#75c7c8", height: .021, density: .43 }, relief: .017 },
  { id: "abyssal-ocean", name: "深蓝汪洋星", description: "大面积深蓝水面、细岛链和伸向极区的云墙。", type: "ocean", color: "#356799", seed: 4100004, meridian: .54, atmosphere: { tint: "#699fdf", height: .025, density: .51 }, relief: .009 },
  { id: "glacial-rift", name: "极寒冰川星", description: "大范围古冰原被深蓝断裂带割开，错动的冰盖穿过昼夜交界。", type: "ice", color: "#a8c3d2", seed: 4100005, meridian: -.62, atmosphere: { tint: "#9bc6e0", height: .013, density: .23 }, relief: .045 },
  { id: "crystal-frost", name: "水晶寒霜星", description: "冷白霜壳、半透明色调的青蓝矿物区和较平滑的冰面高光。", type: "ice", color: "#bfdcdd", seed: 4100006, meridian: .33, atmosphere: { tint: "#a4e4e9", height: .011, density: .28 }, relief: .032 },
  { id: "tempest", name: "苍穹风暴星", description: "宽窄云带围绕大型风暴眼弯曲，暖色对流区穿插浅色云顶。", type: "gas", color: "#bb9478", seed: 4100007, meridian: -1.30, atmosphere: { tint: "#a9b6cb", height: .021, density: .34 }, relief: 0 },
  { id: "cobalt-giant", name: "深蓝气态星", description: "蓝灰云海上散落冷白高空云团，深色风暴潜在其下。", type: "gas", color: "#4a72ad", seed: 4100008, meridian: -2.60, atmosphere: { tint: "#779de9", height: .024, density: .40 }, relief: 0 },
  { id: "gilded-rings", name: "金辉星环星", description: "暖金巨行星与宽阔薄环，明暗环隙和行星投影随视角展开。", type: "ringed", color: "#c9ad79", seed: 4100009, meridian: .31, atmosphere: { tint: "#c2b19a", height: .016, density: .28 }, relief: 0, ring: "gold" },
  { id: "midnight-arcs", name: "暗夜星环星", description: "暗蓝球体外侧是稀疏断续的环弧，较大的碎片沿断口散开。", type: "ringed", color: "#3f5b80", seed: 4100010, meridian: -.40, atmosphere: { tint: "#8aa9d9", height: .016, density: .25 }, relief: 0, ring: "fragments" },
  { id: "violet-haze", name: "紫雾幻境星", description: "紫蓝云海与稀薄的高空雾边，亮区转为浅紫灰。", type: "gas", color: "#8273ad", seed: 4100011, meridian: .86, atmosphere: { tint: "#aca0e2", height: .028, density: .43 }, relief: 0, special: true },
  { id: "verdant-world", name: "翠绿生命星", description: "宽阔深绿大陆、冷蓝海岸与独立白云；仅展示轨道外观。", type: "ocean", color: "#64856f", seed: 4100012, meridian: -.26, atmosphere: { tint: "#8cc8c1", height: .021, density: .46 }, relief: .016, special: true },
];

export const deferredVisuals = [
  ["熔岩裂谷星", "缺少许可清楚、近景可信的岩壳与熔岩通道组合。"],
  ["极光寒霜星", "缺少经实机验证的磁极极光与低档回退。"],
  ["沙海环带星", "缺少适合轨道尺度的沙丘高程和沙暴层。"],
  ["金属荒原星", "缺少可对齐的金属矿区掩模与实测反射材质。"],
] as const;

const bySeed = new Map(visualPresets.map(preset => [preset.seed, preset]));
export function visualPresetFor({ type, seed }: Pick<PlanetAppearance, "type" | "seed">) {
  const preset = bySeed.get(seed);
  return preset?.type === type ? preset : undefined;
}

export function presetAppearance(preset: VisualPreset, size = 1.6): PlanetAppearance {
  return { type: preset.type, color: preset.color, seed: preset.seed, rings: Boolean(preset.ring), size };
}
