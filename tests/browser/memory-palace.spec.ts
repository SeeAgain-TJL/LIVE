import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { memoryPosition, memoryView } from "../../src/domain/memory";

test.use({ reducedMotion: "reduce" });

async function enterNewPlanet(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "创建星球", exact: true }).click();
  await page.getByLabel("星球名称", { exact: false }).fill("记忆空间验收");
  await page.getByRole("button", { name: "诞生一颗星球" }).click();
  await page.getByRole("button", { name: "进入记忆空间", exact: true }).click();
  await expect(page).toHaveURL(/\/planet\//);
}

async function writeMemory(page: Page, title: string, date = "2026-10-01") {
  await page.getByRole("button", { name: "写一条记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill(title);
  await page.getByLabel("发生日期", { exact: true }).fill(date);
  await page.getByLabel("写下你的记忆", { exact: true }).fill(`这是一条隔离浏览器中的验收记录：${title}。`);
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel").getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function clickSingleOrb(page: Page) {
  const canvas = page.locator(".memory-space-canvas canvas");
  await expect(canvas).toBeVisible();
  // Centered single-orb overview; this is a real raycast into the WebGL scene.
  const size = await canvas.boundingBox();
  await canvas.click({ position: { x: size!.width / 2, y: size!.height / 2 } });
}

async function snapshot(page: Page) {
  return page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
}

async function clickOverviewOrb(page: Page, index: number, total: number) {
  const canvas = page.locator(".memory-space-canvas canvas");
  const box = (await canvas.boundingBox())!;
  const view = memoryView(total, -1, box.width / box.height);
  const camera = new PerspectiveCamera(46, box.width / box.height, 0.1, 1000);
  camera.position.fromArray(view.position); camera.lookAt(...view.target); camera.updateMatrixWorld();
  const point = new Vector3(...memoryPosition(index, total)).project(camera);
  await canvas.click({ position: { x: (point.x + 1) * box.width / 2, y: (1 - point.y) * box.height / 2 } });
}

test("single orb closes with × and Escape, reopens by raycast, and never edits or mutates data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enterNewPlanet(page);
  await writeMemory(page, "唯一记忆");
  const saved = await snapshot(page);
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await clickSingleOrb(page);
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "列表管理", exact: true })).toBeFocused();
  await clickSingleOrb(page);
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  expect(await snapshot(page)).toBe(saved);
  await page.screenshot({ path: "test-results/memory-space-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("switch memories, give nested dialogs Escape priority, edit/save and retain records on refresh", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enterNewPlanet(page);
  await writeMemory(page, "第一段记忆");
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("尚未保存的修改");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".memory-detail-panel").getByRole("heading", { name: "第一段记忆", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("已编辑的记忆");
  await page.getByLabel("发生日期", { exact: true }).fill("2025-05-06");
  await page.getByLabel("写下你的记忆", { exact: true }).fill("长篇阅读验收。\n".repeat(80));
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("已编辑的记忆");
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await writeMemory(page, "第二段记忆", "2026-09-03");
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await clickOverviewOrb(page, 1, 2);
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("已编辑的记忆");
  await page.keyboard.press("Escape");
  await clickOverviewOrb(page, 0, 2);
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("第二段记忆");
  await page.getByRole("button", { name: "列表管理", exact: true }).click();
  await page.getByRole("button", { name: "打开记忆：已编辑的记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("已编辑的记忆");
  await page.getByRole("button", { name: "打开记忆：第二段记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("第二段记忆");
  await page.getByRole("button", { name: "删除记忆", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await page.getByLabel("搜索记忆", { exact: true }).fill("已编辑");
  await expect(page.locator(".memory-list-entry")).toHaveCount(1);
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "打开记忆：已编辑的记忆", exact: true }).click();
  expect(await page.locator(".memory-detail-content").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.screenshot({ path: "test-results/memory-reading-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "列表管理", exact: true }).click();
  await expect(page.locator(".memory-list-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "打开记忆：已编辑的记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-date")).toContainText("2025-05-06");
  await expect(page.locator(".memory-detail-body")).toContainText("长篇阅读验收。");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "返回我的宇宙", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("guide uses real filters, image/video survive refresh and media deletion remains valid", async ({ page }) => {
  await enterNewPlanet(page);
  // Original synthetic fixtures; no user assets or third-party network dependency.
  await page.getByRole("button", { name: "写一条记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("照片与视频");
  await page.getByLabel("发生日期", { exact: true }).fill("2024-04-12");
  await page.getByLabel("添加照片或视频", { exact: true }).setInputFiles([
    "tests/fixtures/memory.png", "tests/fixtures/memory.webm",
  ]);
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel img")).toBeVisible();
  await page.locator(".memory-detail-panel video").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".memory-detail-panel video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  await page.reload();
  await page.getByRole("button", { name: "帮我寻找", exact: true }).click();
  await page.getByRole("button", { name: "照片记忆", exact: true }).last().click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("照片与视频");
  await expect.poll(() => page.locator(".memory-detail-panel img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await page.locator(".memory-detail-panel video").scrollIntoViewIfNeeded();
  await page.locator(".memory-detail-panel video").evaluate((video: HTMLVideoElement) => video.play());
  await expect.poll(() => page.locator(".memory-detail-panel video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.getByRole("button", { name: "视频记忆", exact: true }).last().click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("照片与视频");
  const mediaBeforeEdit = JSON.parse((await snapshot(page))!).media;
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("写下你的记忆", { exact: true }).fill("编辑正文后仍保留原有照片和视频。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  expect(JSON.parse((await snapshot(page))!).media).toEqual(mediaBeforeEdit);
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.getByRole("button", { name: "按年份查找", exact: true }).click();
  await expect(page.getByLabel("按年份查找", { exact: true })).toBeFocused();
  await page.getByLabel("按年份查找", { exact: true }).fill("2024");
  await expect(page.locator(".memory-orb-label")).toHaveCount(1);
  await page.getByRole("button", { name: "关键词搜索", exact: true }).click();
  await expect(page.getByLabel("搜索记忆", { exact: true })).toBeFocused();
  await page.getByLabel("搜索记忆", { exact: true }).fill("照片与视频");
  await page.getByRole("button", { name: "随机打开", exact: true }).click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("照片与视频");
  await page.getByRole("button", { name: "删除记忆", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  const stored = JSON.parse((await snapshot(page))!);
  expect(stored.memories).toHaveLength(0); expect(stored.media).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "这里还没有记忆", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "帮我寻找", exact: true }).click();
  await page.getByRole("button", { name: "照片记忆", exact: true }).last().click();
  await expect(page.locator(".guide-copy")).toContainText("暂时没有找到");
  const blobCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("universe-of-me-media", 1);
    request.onsuccess = () => { const db = request.result; const count = db.transaction("blobs").objectStore("blobs").count(); count.onsuccess = () => { db.close(); resolve(count.result); }; count.onerror = () => reject(count.error); };
    request.onerror = () => reject(request.error);
  }));
  expect(blobCount).toBe(0);
});

test("mobile drawer and guide remain readable, fit viewport and preserve a saved edit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterNewPlanet(page);
  await writeMemory(page, "手机验收");
  const drawer = page.locator(".memory-detail-panel");
  const bounds = await drawer.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await expect(page.locator(".memory-guide")).not.toBeVisible();
  expect(await page.locator(".memory-detail-body").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: "test-results/memory-reading-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("写下你的记忆", { exact: true }).fill("手机编辑后保留的文字。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await expect(page.locator(".memory-guide")).toBeVisible();
  expect(await page.locator(".guide-copy p").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  await expect(page.getByRole("button", { name: "展开记忆引导者", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/memory-space-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "列表管理", exact: true }).click();
  await page.getByRole("button", { name: "打开记忆：手机验收", exact: true }).click();
  await expect(page.locator(".memory-detail-body")).toHaveText("手机编辑后保留的文字。");
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "关闭记忆详情", exact: true })).toBeInViewport();
});
