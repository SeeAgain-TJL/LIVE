import assert from "node:assert/strict";
import test from "node:test";
import { safeCameraPosition, searchPlanets, universeOverview } from "../src/domain/exploration.ts";
import { createSeed } from "../src/data/seed.ts";

test("search finds the owning world through memory text without duplicating results", () => {
  const { planets } = createSeed();
  const now = new Date().toISOString();
  const memories = ["a", "b"].map(id => ({ id, planetId: planets[0].id, kind: "text" as const, title: "一次测试记录", body: "保留身体力行的勇气", occurredOn: "2026-10-28", createdAt: now, updatedAt: now }));
  assert.equal(searchPlanets(planets, memories, " 勇气 ").length, 1);
  assert.equal(searchPlanets(planets, memories, "勇气")[0].id, planets[0].id);
  assert.equal(searchPlanets(planets, memories, "无此内容").length, 0);
  assert.equal(searchPlanets(planets, memories, "   ").length, planets.length);
  assert.equal(planets.length, 5);
});

test("overview fits far-away newly created worlds and accounts for narrow mobile viewports", () => {
  const planets = createSeed().planets;
  const desktop = universeOverview(planets, 43, 1.6);
  const mobile = universeOverview(planets, 43, 0.46);
  assert(mobile.position[2] - mobile.target[2] > desktop.position[2] - desktop.target[2]);
  const extended = universeOverview([...planets, { ...planets[0], id: "far", position: [250, 0, 200] }], 43, 1.6);
  assert(extended.farthestDistance > desktop.farthestDistance);
  assert(extended.target[0] > desktop.target[0]);
  assert.deepEqual(universeOverview([], 43, 1).target, [0, 0, 0]);
});

test("camera is projected out of solid planets even when exactly at their center", () => {
  const p = createSeed().planets[0];
  const safe = safeCameraPosition(p.position, [p]);
  assert(Math.hypot(...safe.map((n, i) => n - p.position[i])) >= p.appearance.size + 0.249);
  assert.deepEqual(safeCameraPosition([100, 100, 100], [p]), [100, 100, 100]);
});
