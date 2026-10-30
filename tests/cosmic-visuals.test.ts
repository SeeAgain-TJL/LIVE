import assert from "node:assert/strict";
import test from "node:test";
import { COSMIC_BUDGETS, galaxyOverview, galaxySamples, galaxyStyle, renderTier } from "../src/domain/cosmic-visuals.ts";
import { createSeed } from "../src/data/seed.ts";

test("derived galaxy geometry is deterministic, volumetric and bounded without changing archives", () => {
  const data = createSeed(), before = JSON.stringify(data);
  const shapes = new Set<string>();
  for (const g of data.galaxies) {
    const a = galaxySamples(g.id, 2000), b = galaxySamples(g.id, 2000), style = galaxyStyle(g.id);
    assert.deepEqual(a, b);
    assert(a.positions.every(Number.isFinite)); assert(a.sizes.every(s => s > 0));
    assert(Math.max(...a.positions.filter((_, i) => i % 3 === 1)) > 0.1);
    assert(Math.max(...a.positions.map(Math.abs)) < style.radius * 1.3);
    assert(a.radii.some(r => r < 0.1) && a.radii.some(r => r > 1));
    shapes.add(JSON.stringify([style.radius, style.arms, style.tilt]));
  }
  assert.equal(shapes.size, data.galaxies.length);
  assert.equal(JSON.stringify(data), before);
});

test("quality budgets decrease monotonically and portrait overview stays finite", () => {
  assert.equal(renderTier("auto", true), "low"); assert.equal(renderTier("auto", false), "medium");
  for (const tier of ["low", "medium", "high"] as const) assert.equal(renderTier(tier, true), tier);
  for (const field of ["stars", "galaxy", "dust", "dpr"] as const) {
    assert(COSMIC_BUDGETS.low[field] < COSMIC_BUDGETS.medium[field]);
    assert(COSMIC_BUDGETS.medium[field] < COSMIC_BUDGETS.high[field]);
  }
  for (const count of [0, 1, 5, 30]) {
    const portrait = galaxyOverview(count, 0.45), landscape = galaxyOverview(count, 1.6);
    assert(portrait.position.every(Number.isFinite));
    assert(portrait.position[2] > landscape.position[2]);
  }
});
