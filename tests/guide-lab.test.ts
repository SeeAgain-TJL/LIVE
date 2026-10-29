import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { initialActor, reduceActor, inspectLabGlb } from "../src/domain/guide-lab.ts";
import { readLabArchive } from "../src/data/guide-lab-reader.ts";
import { createSeed } from "../src/data/seed.ts";

test("lab actions wait for rig and camera events; stale completion cannot navigate", () => {
  let s = reduceActor(initialActor, { type: "TRAVEL", planetId: "p" });
  assert.equal(s, initialActor);
  s = reduceActor(s, { type: "MODEL_READY" });
  s = reduceActor(s, { type: "TRAVEL", planetId: "p" });
  assert.equal(s.state, "attention");
  const run = s.run;
  assert.equal(reduceActor(s, { type: "TRAVEL", planetId: "other" }), s);
  assert.equal(reduceActor(s, { type: "CAMERA_ARRIVED", run }), s);
  s = reduceActor(s, { type: "GAZE_SETTLED", run });
  assert.equal(s.state, "pointing");
  s = reduceActor(s, { type: "GESTURE_READY", run });
  assert.equal(s.state, "guiding");
  const cancelled = reduceActor(s, { type: "CANCEL" });
  assert.equal(reduceActor(cancelled, { type: "CAMERA_ARRIVED", run }), cancelled);
  s = reduceActor(s, { type: "CAMERA_ARRIVED", run });
  assert.equal(s.state, "arrived");
  s = reduceActor(s, { type: "WELCOME_FINISHED", run });
  assert.equal(s.state, "idle");
});

test("memory presentation waits for palm-space arrival; loading cancels an active action", () => {
  let s = reduceActor(initialActor, { type: "MODEL_READY" });
  s = reduceActor(s, { type: "FIND_MEMORY", memoryId: "real-memory", planetId: "real-planet" });
  const run = s.run;
  assert.equal(s.state, "thinking");
  assert.equal(reduceActor(s, { type: "ORB_IN_PALM", run }), s);
  s = reduceActor(s, { type: "SEARCH_RESOLVED", run });
  assert.equal(s.state, "summoning");
  s = reduceActor(s, { type: "ORB_IN_PALM", run });
  assert.equal(s.state, "presenting");
  assert.equal(s.memoryId, "real-memory");
  s = reduceActor(s, { type: "MODEL_LOADING" });
  assert.equal(s.ready, false);
  assert.equal(s.memoryId, null);
  assert.equal(reduceActor(s, { type: "ORB_IN_PALM", run }), s);
});

test("lab archive reader normalizes in memory only, does not initialize, migrate or repair storage", () => {
  const seed = createSeed();
  seed.galaxies = []; seed.planets = seed.planets.map(p => ({ ...p, galaxyId: null }));
  const raw = JSON.stringify(seed);
  let reads = 0;
  const archive = readLabArchive({ getItem() { reads++; return raw; } });
  assert.equal(reads, 1);
  assert.equal(archive!.planets.length, seed.planets.length);
  assert.ok(archive!.planets.every(p => p.galaxyId === "unclassified"));
  assert.equal(JSON.stringify(seed), raw);
  assert.equal(readLabArchive({ getItem: () => null }), null);
  assert.throws(() => readLabArchive({ getItem: () => "corrupt" }));
});

function binary(json: object) {
  const text = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(text.length / 4) * 4;
  const buffer = Buffer.alloc(20 + padded, 32);
  buffer.writeUInt32LE(0x46546c67, 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(padded, 12); buffer.writeUInt32LE(0x4e4f534a, 16); text.copy(buffer, 20);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test("asset gate accepts real VRM1 sample, rejects external resources, wrong format and broken GLB", () => {
  const model = fs.readFileSync("public/characters/guide-lab/pixiv-sample.vrm");
  const bytes = model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength);
  assert.ok(inspectLabGlb(bytes, "model"));
  assert.throws(() => inspectLabGlb(bytes, "animation"), /VRM Animation/);
  assert.throws(() => inspectLabGlb(new ArrayBuffer(24), "model"), /GLB/);
  assert.throws(() => inspectLabGlb(binary({ extensions: { VRMC_vrm: { specVersion: "1.0" } }, images: [{ uri: "https://example.com/private.png" }] }), "model"), /外部/);
  assert.throws(() => inspectLabGlb(binary({ extensions: { VRMC_vrm: { specVersion: "0.0" } } }), "model"), /1.0/);
});
