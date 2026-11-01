import assert from "node:assert/strict";
import test from "node:test";
import { coastPlaces } from "../src/domain/coast-composition.ts";
import { sliceWorldHeight, sliceWorldMemoryPosition } from "../src/domain/planet-world.ts";

test("coastal quality tiers preserve the overlook and reduce vegetation without stored data", () => {
  const high = coastPlaces("forest", "high");
  const medium = coastPlaces("forest", "medium");
  const low = coastPlaces("forest", "low");
  assert.ok(high.length > medium.length && medium.length > low.length);
  for (const place of high) {
    assert.ok(Number.isFinite(place.scale) && sliceWorldHeight(place.x, place.z) > .3);
    assert.ok(!(place.z > -9 && place.x < 24), "arrival overlook must remain clear");
  }
  assert.deepEqual(coastPlaces("forest", "high"), high);
});

test("real memory markers remain above the revised terrain and empty archives create none", () => {
  const ids = ["an-existing-memory", "another-real-id"];
  for (const id of ids) {
    const [x, y, z] = sliceWorldMemoryPosition(id);
    assert.ok(y > sliceWorldHeight(x, z) + 1);
  }
  assert.deepEqual(ids.map(sliceWorldMemoryPosition).length, ids.length);
});
