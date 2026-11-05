import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSeed } from "../../src/data/seed";
import { derivePineMemoryAnchors } from "../../src/components/forest-lab/pine-memory-anchors";
import type { Memory } from "../../src/domain/types";
import { Vector3 } from "three";

test.use({ viewport: { width: 1440, height: 900 }, video: { mode: "on", size: { width: 1440, height: 900 } } });

const navigation = JSON.parse(readFileSync("public/forest-origin-assets/environment/navigation.json", "utf8"));
const safety = JSON.parse(readFileSync("public/forest-origin-assets/scene-repair/memory-safety.json", "utf8"));
const sourceTrees = JSON.parse(readFileSync("public/forest-origin-assets/source-tree-placements.json", "utf8"));
const start = new Vector3(23.155473709106445, 0.9223032593727112, 47.55979919433594);
function chooseReachableMemory() {
  // This seeded ID resolves to a dry bank with a direct route from the real spawn.
  const memory: Memory = { id: "review-memory-269", planetId: "review-planet", kind: "mixed",
      title: "林间的夏日", body: "测试档案中的真实记忆正文。沿着林间微光走近，然后停下来读一会儿。\n\n这份内容仅用于隔离浏览器验收。",
      occurredOn: "2018-06-21", createdAt: "2018-06-21T12:00:00.000Z", updatedAt: "2018-06-21T12:00:00.000Z", mediaIds: ["review-photo", "review-video"] };
  const anchor = derivePineMemoryAnchors([memory], navigation, sourceTrees.map((tree: { matrix: number[][] }) => tree.matrix), safety)[0];
  if (!anchor || !clearWalkRoute(anchor.position)) throw new Error("The test memory no longer has a direct route from spawn.");
  return { memory, position: anchor.position };
}

function clearWalkRoute(target: number[]) {
  const height = (x: number, z: number) => {
    const fx = (x - navigation.origin[0]) / navigation.step, fy = (-z - navigation.origin[1]) / navigation.step;
    const column = Math.max(0, Math.min(navigation.columns - 2, Math.floor(fx))), row = Math.max(0, Math.min(navigation.rows - 2, Math.floor(fy)));
    const a = Math.max(0, Math.min(1, fx - column)), b = Math.max(0, Math.min(1, fy - row));
    const at = (col: number, r: number) => navigation.heights[r * navigation.columns + col] ?? 0;
    return (1 - b) * ((1 - a) * at(column, row) + a * at(column + 1, row)) + b * ((1 - a) * at(column, row + 1) + a * at(column + 1, row + 1));
  };
  const walkable = (x: number, z: number) => {
    const fx = (x - navigation.origin[0]) / navigation.step, fy = (-z - navigation.origin[1]) / navigation.step;
    const column = Math.floor(fx), row = Math.floor(fy);
    if (column < 0 || row < 0 || column + 1 >= navigation.columns || row + 1 >= navigation.rows) return false;
    const ids = [row * navigation.columns + column, row * navigation.columns + column + 1, (row + 1) * navigation.columns + column, (row + 1) * navigation.columns + column + 1];
    return ids.every(index => navigation.heights[index] != null && !navigation.blocked?.[index]);
  };
  const dx = target[0] - start.x, dz = target[2] - start.z, distance = Math.hypot(dx, dz), steps = Math.ceil(distance / .04);
  let x = start.x, z = start.z, y = height(x, z);
  for (let step = 0; step < steps; step++) {
    const nx = x + dx / steps, nz = z + dz / steps, ny = height(nx, nz);
    if (!walkable(nx, nz) || Math.abs(ny - y) >= .55 || sourceTrees.some((tree: { matrix: number[][] }) => Math.hypot(tree.matrix[0][3] - nx, -tree.matrix[1][3] - nz) < .8)) return false;
    x = nx;z = nz;y = ny;
  }
  return true;
}

async function writeMediaBlobs(page: Page) {
  const photo = Array.from(readFileSync("tests/fixtures/memory.png"));
  const video = Array.from(readFileSync("tests/fixtures/memory.webm"));
  await page.evaluate(async ({ photo, video }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("universe-of-me-media", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("blobs");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(new Blob([new Uint8Array(photo)], { type: "image/png" }), "review-photo");
      tx.objectStore("blobs").put(new Blob([new Uint8Array(video)], { type: "video/webm" }), "review-video");
      tx.oncomplete = () => resolve();tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { photo, video });
}

test("Pine Forest opens and closes a real memory during a continuous walk", async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const chosen = chooseReachableMemory();
  const seed = createSeed();
  seed.planets = [{ ...seed.planets[0], id: "review-planet", name: "隔离森林世界", isDemo: false }];
  seed.memories = [chosen.memory];
  seed.media = [
    { id: "review-photo", memoryId: chosen.memory.id, kind: "image", name: "林间照片.png", mimeType: "image/png", size: 0, createdAt: chosen.memory.createdAt },
    { id: "review-video", memoryId: chosen.memory.id, kind: "video", name: "夏日片段.webm", mimeType: "video/webm", size: 0, createdAt: chosen.memory.createdAt },
  ];
  await page.goto("/");
  await page.evaluate(value => localStorage.setItem("universe-of-me:data:v1", JSON.stringify(value)), seed);
  await page.reload();
  await writeMediaBlobs(page);
  const before = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await page.goto("/forest-memory-lab");
  const canvas = page.locator(".forest-lab canvas");
  await expect(page.getByLabel("记忆所属星球")).toHaveValue("review-planet");
  await expect.poll(() => canvas.getAttribute("data-pine-memory-anchors")).toBeTruthy();
  await expect.poll(() => canvas.getAttribute("data-forest-origin-ready")).toBe("true");
  const anchors = JSON.parse((await canvas.getAttribute("data-pine-memory-anchors"))!);
  expect(anchors).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("forest-memory-before.png") });
  await page.getByRole("button", { name: /走进森林/ }).click();
  await expect(page.locator(".fm-walk-note")).toBeVisible();
  await page.screenshot({ path: info.outputPath("forest-memory-exploring.png") });
  await page.waitForTimeout(1200);

  const target = new Vector3(...anchors[0].position as [number, number, number]);
  const box = (await canvas.boundingBox())!;
  await canvas.focus();
  let walking = false;
  try {
    for (let step = 0; step < 120; step++) {
      const walker = await page.evaluate(() => JSON.parse(document.querySelector("canvas")!.dataset.forestWalkerPosition!));
      const cameraPosition = new Vector3(...walker.position as [number, number, number]);
      const delta = target.clone().sub(cameraPosition), distance = Math.hypot(delta.x, delta.z);
      if (distance <= 4.1) break;
      const direction = new Vector3(...walker.direction as [number, number, number]);
      const currentYaw = Math.atan2(-direction.x, -direction.z);
      const desiredYaw = Math.atan2(-delta.x, -delta.z);
      const yawDelta = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
      const drag = Math.max(-150, Math.min(150, -yawDelta / 0.0025));
      if (Math.abs(drag) > 3) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();await page.mouse.move(box.x + box.width / 2 + drag, box.y + box.height / 2, { steps: 6 });await page.mouse.up();
      }
      if (!walking && Math.abs(yawDelta) < .08) { await page.keyboard.down("w"); walking = true; }
      await page.waitForTimeout(350);
    }
  } finally { if (walking) await page.keyboard.up("w"); }
  const walkEvidence = await page.evaluate(() => ({ metrics: JSON.parse(document.querySelector("canvas")!.dataset.forestOriginMetrics ?? "null"), walker: document.querySelector("canvas")!.dataset.forestWalkerPosition ?? null, proximity: document.querySelector(".fm-discovery")?.textContent ?? null }));
  console.log("WALK_EVIDENCE", JSON.stringify({ target: chosen.position, walkEvidence }));
  await info.attach("walk-position", { body: JSON.stringify({ target: chosen.position, walkEvidence }, null, 2), contentType: "application/json" });
  await expect(page.locator(".fm-discovery")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".fm-discovery")).toContainText("林间的夏日");
  await page.screenshot({ path: info.outputPath("forest-memory-discovered.png") });
  await page.keyboard.press("e");
  const reader = page.getByRole("dialog", { name: "林间的夏日" });
  await expect(reader).toBeVisible();
  await expect(reader.locator(".fm-prose")).toContainText("隔离浏览器验收");
  await expect.poll(() => reader.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(640);
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath("forest-memory-reading-photo.png") });
  await reader.getByRole("button", { name: "下一个附件" }).click();
  await expect(reader.locator("video")).toHaveCount(1);
  await expect.poll(() => reader.locator("video").evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("forest-memory-reading-video.png") });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");await expect(reader).toHaveCount(0);
  await page.keyboard.down("w");await page.waitForTimeout(500);await page.keyboard.up("w");
  await page.getByRole("button", { name: "探索设置" }).click();
  const settings=page.getByRole("dialog", { name: "探索与画质" });
  await expect(settings).toBeVisible();
  const quality=settings.getByLabel("森林资源精度");
  await quality.selectOption("high");await expect(quality).toHaveValue("high");
  await quality.selectOption("low");await expect(quality).toHaveValue("low");
  await page.getByRole("button", { name: "关闭探索设置" }).click();
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(before);
  await page.getByRole("link", { name: "退出森林" }).click();
  await expect(page).toHaveURL(/\/planet\/review-planet$/);
  expect(errors).toEqual([]);
  const metrics = await page.evaluate(() => ({ ...JSON.parse(document.querySelector("canvas")?.dataset.forestOriginMetrics ?? "{}"), renderer: document.querySelector("canvas")?.dataset.renderer ?? "" }));
  await info.attach("forest-memory-path", { body: JSON.stringify({ target: chosen.position, metrics }, null, 2), contentType: "application/json" });
});
