import test from "node:test";
import assert from "node:assert/strict";
import type { Memory } from "../src/domain/types.ts";
import { derivePineMemoryAnchors } from "../src/components/forest-lab/pine-memory-anchors.ts";

const collision = { origin: [-100, -100], step: 5, columns: 41, rows: 41,
  heights: Array<number | null>(41 * 41).fill(0) };
const memory = (id: string): Memory => ({ id, planetId: "planet-real", kind: "text", title: id,
  body: "", occurredOn: "2020-01-01", createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z" });

test("forest memory anchors are stable, walkable, and remain attached to real memory records", () => {
  const records = [memory("memory-a"), memory("memory-b"), memory("memory-c")];
  const first = derivePineMemoryAnchors(records, collision, []);
  const again = derivePineMemoryAnchors(records, collision, []);
  assert.deepEqual(first, again);
  assert.deepEqual(first.map(anchor => anchor.memory.id), records.map(item => item.id));
  assert.ok(first.every(({ position }) => position[1] === 1.05 && Math.abs(position[0]) <= 64 && Math.abs(position[2]) <= 88));
  assert.ok(Math.hypot(first[0].position[0] - first[1].position[0], first[0].position[2] - first[1].position[2]) >= 7);
});

test("forest memory anchors avoid blocked ground and tree trunks", () => {
  const blocked = { ...collision, blocked: Array<number>(41 * 41).fill(0) };
  blocked.blocked.fill(1, 0, blocked.columns * 10);
  const anchors = derivePineMemoryAnchors([memory("memory-a")], blocked, [[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]]);
  assert.equal(anchors.length, 1);
  const [x, , z] = anchors[0].position;
  assert.ok(Math.hypot(x, z) >= 2.2);
  assert.deepEqual(derivePineMemoryAnchors([], collision, []), []);
});
