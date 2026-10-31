import assert from "node:assert/strict";
import test from "node:test";
import { worldHeight, worldMemoryPosition, WORLD_BATCH_SIZE } from "../src/domain/planet-world.ts";

test("world anchors are keyed by real IDs, bounded, above ground and independent of list order", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `saved-memory-${i}`);
  const before = new Map(ids.map(id => [id, worldMemoryPosition(id)]));
  for (const id of ids.reverse()) {
    const p = worldMemoryPosition(id);
    assert.deepEqual(p, before.get(id));
    assert(p.every(Number.isFinite));assert(Math.abs(p[0]) < 20 && Math.abs(p[2]) < 20);
    assert(p[1] > worldHeight(p[0], p[2]) + 1);
  }
  assert(WORLD_BATCH_SIZE <= 24);
  assert(worldHeight(-14, 0) < 0, "lake basin must be below water");
  assert(worldHeight(6, 0) > 0, "memory clearing must be dry");
});
