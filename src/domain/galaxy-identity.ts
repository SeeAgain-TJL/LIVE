import type { Vec3 } from "./types.ts";

export interface GalaxyIdentity {
  accent: string;
  cool: string;
  warm: string;
  stellar: string;
  orbitalTilt: Vec3;
  dust: number;
  mood: string;
}

const IDENTITIES: Record<string, GalaxyIdentity> = {
  growth: { accent: "#9fc9b3", cool: "#355f6b", warm: "#9e8060", stellar: "#ffd29a", orbitalTilt: [.08, .2, -.16], dust: .8, mood: "缓慢生长的绿金星尘" },
  friendship: { accent: "#c5b6ed", cool: "#3d426d", warm: "#927caa", stellar: "#c7c9ff", orbitalTilt: [.32, -.45, .14], dust: .65, mood: "被蓝紫微光连接的星群" },
  career: { accent: "#a9d1eb", cool: "#294d73", warm: "#8a6f61", stellar: "#e6f0ff", orbitalTilt: [-.22, .58, .2], dust: .5, mood: "清冷而坚定的远方航道" },
  dream: { accent: "#efd09b", cool: "#624863", warm: "#b78d5c", stellar: "#ffe0a5", orbitalTilt: [.46, .16, .38], dust: .95, mood: "暖色星云里未抵达的愿景" },
  unclassified: { accent: "#a9c7f0", cool: "#345170", warm: "#806f6b", stellar: "#f5d1a0", orbitalTilt: [.16, -.25, -.12], dust: .55, mood: "等待被命名的深空" },
};

export function galaxyIdentity(id: string): GalaxyIdentity {
  const known = IDENTITIES[id];
  if (known) return known;
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const hue = (hash >>> 0) % 360;
  return { accent: `hsl(${hue} 54% 74%)`, cool: `hsl(${hue} 38% 30%)`, warm: "#8b7168", stellar: "#f2d4ae", orbitalTilt: [.15, (hash % 80) / 100 - .4, -.18], dust: .55, mood: "一片尚未写下注解的星域" };
}
