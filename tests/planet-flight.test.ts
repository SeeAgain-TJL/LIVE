import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "../src/data/seed.ts";
import { planetApproach, isPlanetTap } from "../src/domain/planet-flight.ts";
import { planetReturnUrl, validBookmark } from "../src/data/exploration-session.ts";
import type { CameraBookmark, Vec3 } from "../src/domain/types.ts";

test("planet approach stays on the viewing side, fits narrow viewports and stays outside the surface", () => {
  const planets = createSeed().planets;
  for (const p of planets) for (const aspect of [0.39, 0.8, 1.6, 2.5]) for (const direction of [[0, 0.2, 1], [-1, 0.3, -1], [1, 0.1, 0]]) {
    const origin: CameraBookmark = { position: p.position.map((n, i) => n + direction[i] * 50) as Vec3, target: [...p.position] };
    const result = planetApproach(p, origin, planets, aspect);
    const delta = result.position.map((n, i) => n - p.position[i]);
    const distance = Math.hypot(...delta);
    assert(distance > p.appearance.size + 0.25);
    assert(delta.reduce((sum, n, i) => sum + n * direction[i], 0) > 0, "must not orbit around to the opposite side");
    const cross = [delta[1] * direction[2] - delta[2] * direction[1], delta[2] * direction[0] - delta[0] * direction[2], delta[0] * direction[1] - delta[1] * direction[0]];
    assert(Math.hypot(...cross) < 0.00001);
    const radius = p.appearance.size * (p.appearance.rings ? 2.4 : 1.1);
    const halfAngle = Math.atan(Math.tan(43 * Math.PI / 360) * Math.min(1, aspect));
    assert(radius / distance < Math.sin(halfAngle));
    assert.deepEqual(result.target, p.position);
  }
});

test("a planet tap excludes long presses, drags, round-trip movement and multitouch", () => {
  assert.equal(isPlanetTap(0, 1, 50), true);
  assert.equal(isPlanetTap(6.9, 1, 300), true);
  assert.equal(isPlanetTap(8, 1, 100), false);
  assert.equal(isPlanetTap(40, 1, 100), false);
  assert.equal(isPlanetTap(0, 2, 100), false);
  assert.equal(isPlanetTap(0, 1, 700), false);
});

test("optional return bookmarks reject corrupt coordinates and return URLs stay local", () => {
  assert(validBookmark({ position: [0, 0, 10], target: [0, 0, 0] }));
  for (const invalid of [null, {}, { position: [0, NaN, 1], target: [0, 0, 0] }, { position: [0, 0, 0], target: [0, 0, 0] }, { position: [Infinity, 0, 1], target: [0, 0, 0] }, { position: ["1", 2, 3], target: [0, 0, 0] }]) assert.equal(validBookmark(invalid), false);
  const url = new URL(planetReturnUrl("p/&星球", "https://external.test/a"), "http://local.test");
  assert.equal(url.origin, "http://local.test");
  assert.equal(url.searchParams.get("planet"), "p/&星球");
  assert.equal(url.searchParams.get("returnFrom"), "p/&星球");
});
