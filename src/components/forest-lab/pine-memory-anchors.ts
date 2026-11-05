import type { Collision } from "./forest-origin-lab";
import type { Memory } from "@/domain/types";

export interface PineMemoryAnchor { memory: Memory; position: [number, number, number] }
export interface PineMemorySafety { origin: number[]; step: number; columns: number; rows: number; safe: number[] }

function hash(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

function terrainAt(collision: Collision, x: number, z: number, safety?: PineMemorySafety) {
  const fx = (x - collision.origin[0]) / collision.step;
  const fy = (-z - collision.origin[1]) / collision.step;
  const column = Math.floor(fx), row = Math.floor(fy);
  if (column < 0 || row < 0 || column + 1 >= collision.columns || row + 1 >= collision.rows) return null;
  const ids = [row * collision.columns + column, row * collision.columns + column + 1,
    (row + 1) * collision.columns + column, (row + 1) * collision.columns + column + 1];
  if (ids.some(index => collision.heights[index] == null || collision.blocked?.[index] || (safety && !safety.safe[index]))) return null;
  const a = fx - column, b = fy - row;
  const at = (index: number) => collision.heights[index]!;
  return (1 - b) * ((1 - a) * at(ids[0]) + a * at(ids[1])) + b * ((1 - a) * at(ids[2]) + a * at(ids[3]));
}

export function derivePineMemoryAnchors(memories: Memory[], collision: Collision, trunks: number[][][], safety?: PineMemorySafety): PineMemoryAnchor[] {
  if (safety && (safety.columns!==collision.columns || safety.rows!==collision.rows || safety.step!==collision.step || safety.origin.some((v,i)=>v!==collision.origin[i]) || safety.safe.length!==collision.columns*collision.rows)) return [];
  const occupied: [number, number][] = [];
  return memories.map((memory, index) => {
    const seed = hash(memory.id), golden = 2.399963229728653;
    for (let attempt = 0; attempt < 96; attempt++) {
      const angle = (seed % 10000) / 10000 * Math.PI * 2 + attempt * golden;
      const radius = 4 + Math.sqrt(attempt) * 2.4;
      const x = Math.max(-64, Math.min(64, Math.sin(angle) * (25 + radius) + ((index % 3) - 1) * 5));
      const z = Math.max(-88, Math.min(74, Math.cos(angle) * (38 + radius) - 8));
      const height = terrainAt(collision, x, z, safety);
      if (height == null || occupied.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 7)) continue;
      if (trunks.some(matrix => Math.hypot(matrix[0][3] - x, -matrix[1][3] - z) < 2.2)) continue;
      occupied.push([x, z]);
      return { memory, position: [x, height + 1.05, z] };
    }
    return null;
  }).filter((item): item is PineMemoryAnchor => item !== null);
}
