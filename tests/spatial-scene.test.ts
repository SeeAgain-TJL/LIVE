import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "../src/data/seed.ts";
import { orbitFrame, safeStellarCamera, stellarSource, travelArc } from "../src/domain/spatial-scene.ts";
import { universeOverview } from "../src/domain/exploration.ts";
import { galaxyPosition } from "../src/domain/galaxy.ts";

const length = (v: number[]) => Math.hypot(...v);
test("one stellar source stays outside saved planets and the overview includes its visual bounds", () => {
  const planets = createSeed().planets, original = JSON.stringify(planets), source = stellarSource(planets);
  for (const planet of planets) assert(length(planet.position.map((n, i) => n - source.position[i])) > planet.appearance.size + source.radius);
  const view = universeOverview(planets, 43, 1.6, [{ position: source.position, size: source.radius }]);
  assert(view.position.every(Number.isFinite));
  assert(view.target[0] < universeOverview(planets, 43, 1.6).target[0]);
  assert.equal(JSON.stringify(planets), original);
  const inside = safeStellarCamera(source.position, source);
  assert(Math.abs(length(inside.map((n, i) => n - source.position[i])) - source.radius - 1.2) < 1e-8);
  assert.deepEqual(safeStellarCamera(view.position, source), view.position);
});

test("tilted orbits pass through original coordinates, have orthogonal equal-radius axes and do not flatten the archive", () => {
  const planets = createSeed().planets, source = stellarSource(planets);
  const planes = planets.map((planet, index) => {
    const { axis, tangent, radius } = orbitFrame(planet, source, index);
    assert(Math.abs(axis.reduce((dot, n, i) => dot + n * tangent[i], 0)) < 1e-7);
    assert(Math.abs(length(tangent) - radius) < 1e-8);
    axis.forEach((n, i) => assert(Math.abs(n + source.position[i] - planet.position[i]) < 1e-8));
    return tangent[1] / radius;
  });
  assert(Math.max(...planes) - Math.min(...planes) > .2);
});

test("travel arc eases in and out, honours reduced motion and the overview spans genuinely different depths", () => {
  assert.equal(travelArc(0, 100, false), 0);
  assert(travelArc(1, 100, false) < 1e-10);
  assert(travelArc(.5, 100, false) > travelArc(.25, 100, false));
  assert(travelArc(.001, 100, false) / .001 < .1);
  assert.equal(travelArc(.5, 100, true), 0);
  const depths = Array.from({ length: 5 }, (_, i) => galaxyPosition(i)[2]);
  assert(Math.max(...depths) - Math.min(...depths) >= 200);
});
