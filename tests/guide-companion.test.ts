import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "../src/data/seed.ts";
import { DEFAULT_GUIDE_PREFERENCES, findGuideMemories, guidePosition, snapGuide, validGuidePreferences, memoryDestinationUrl } from "../src/domain/guide-companion.ts";
import { GUIDE_PREFERENCES_KEY, loadGuidePreferences, saveGuidePreferences } from "../src/data/guide-preferences.ts";

test("guide preferences round-trip independently, preserving archive, recovery and optional keys", () => {
  const values = new Map([["universe-of-me:data:v1", "EXACT ARCHIVE"], ["universe-of-me:recovery:v1", "EXACT RECOVERY"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(loadGuidePreferences(storage).preferences, DEFAULT_GUIDE_PREFERENCES);
  assert.equal(values.size, 2, "read must not write a new preference or archive");
  const preferences = { ...DEFAULT_GUIDE_PREFERENCES, edge: "right" as const, heightRatio: .23, hidden: true, promptsEnabled: false, dialogueOpen: true };
  assert.equal(saveGuidePreferences(storage, preferences), "");
  assert.deepEqual(loadGuidePreferences(storage).preferences, preferences);
  assert.equal(values.get("universe-of-me:data:v1"), "EXACT ARCHIVE");
  assert.equal(values.get("universe-of-me:recovery:v1"), "EXACT RECOVERY");
  assert.equal(values.size, 3);
});

test("corrupt or future preferences stay untouched and blocked storage never breaks archives", () => {
  for (const raw of ["{", JSON.stringify({ ...DEFAULT_GUIDE_PREFERENCES, version: 2 }), JSON.stringify({ ...DEFAULT_GUIDE_PREFERENCES, heightRatio: 1.5 })]) {
    let writes = 0;
    const loaded = loadGuidePreferences({ getItem: key => key === GUIDE_PREFERENCES_KEY ? raw : null, setItem: () => { writes++; } });
    assert.equal(loaded.writable, false); assert(loaded.error); assert.equal(writes, 0);
  }
  const unavailable = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("quota"); } };
  assert.equal(loadGuidePreferences(unavailable).writable, false);
  assert(saveGuidePreferences(unavailable, DEFAULT_GUIDE_PREFERENCES).includes("未能保存"));
  for (const p of [null, {}, { ...DEFAULT_GUIDE_PREFERENCES, hidden: "false" }, { ...DEFAULT_GUIDE_PREFERENCES, heightRatio: Infinity }]) assert.equal(validGuidePreferences(p), false);
});

test("guide snaps to both edges, retains vertical preference and stays in bounds after resizing", () => {
  for (const [width, height] of [[1280, 720], [390, 844], [360, 740], [844, 390]]) for (const compact of [false, true]) {
    for (const [x, y] of [[-100, -100], [5000, 5000], [width / 2, height / 2]]) {
      const saved = snapGuide(x, y, width, height, compact);
      const placed = guidePosition(saved, width, height, compact);
      assert(placed.x >= 0 && placed.y >= 0 && placed.x + placed.w <= width && placed.y + placed.h <= height);
      assert(saved.heightRatio >= 0 && saved.heightRatio <= 1);
      assert.equal(saved.edge, x + placed.w / 2 < width / 2 ? "left" : "right");
    }
  }
});

test("cross-planet guide search uses actual dates, text and media without changing the archive", () => {
  const seed = createSeed();
  const now = "2026-01-01T00:00:00.000Z";
  const common = { kind: "text" as const, body: "真实关键词", createdAt: now, updatedAt: now, mediaIds: [] };
  const data = { ...seed, memories: [
    { ...common, id: "old", planetId: seed.planets[0].id, title: "旧文字", occurredOn: "2020-02-29" },
    { ...common, id: "photo", planetId: seed.planets[1].id, title: "照片", occurredOn: "2024-05-02", mediaIds: ["image"] },
    { ...common, id: "video", planetId: seed.planets[1].id, title: "视频", occurredOn: "2025-08-03", mediaIds: ["movie"] },
  ], media: [
    { id: "image", memoryId: "photo", kind: "image" as const, mimeType: "image/png", name: "p.png", size: 10, createdAt: now },
    { id: "movie", memoryId: "video", kind: "video" as const, mimeType: "video/webm", name: "v.webm", size: 10, createdAt: now },
  ] };
  const raw = JSON.stringify(data);
  assert.deepEqual(findGuideMemories(data, "").map(m => m.id), ["video", "photo", "old"]);
  assert.deepEqual(findGuideMemories(data, "关键词", "photo", "2024").map(m => m.id), ["photo"]);
  assert.deepEqual(findGuideMemories(data, "", "text").map(m => m.id), ["old"]);
  assert.deepEqual(findGuideMemories(data, "不存在"), []);
  assert.equal(JSON.stringify(data), raw);
  const url = new URL(memoryDestinationUrl("星/&球", "记忆?/#"), "https://local.test");
  assert.equal(url.origin, "https://local.test"); assert.equal(url.searchParams.get("memory"), "记忆?/#");
});
