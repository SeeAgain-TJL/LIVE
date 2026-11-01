import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { createSeed } from "../../src/data/seed";

test.use({ viewport: { width: 1440, height: 900 }, video: { mode: "on", size: { width: 1440, height: 900 } } });
const archiveKey = "universe-of-me:data:v1";

async function ready(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).getAttribute("data-render-metrics"), { timeout: 45_000 }).toBeTruthy();
}
async function raycast(page: Page, selector: string, position: number[], fov: number) {
  await ready(page, selector);
  const canvas = page.locator(selector), box = (await canvas.boundingBox())!;
  const metrics = JSON.parse((await canvas.getAttribute("data-render-metrics"))!);
  const camera = new PerspectiveCamera(fov, box.width / box.height, .1, 30000);
  camera.position.fromArray(metrics.camera); camera.lookAt(...metrics.target as [number, number, number]); camera.updateMatrixWorld();
  const p = new Vector3(...position as [number, number, number]).project(camera);
  await page.mouse.click(box.x + (p.x + 1) * box.width / 2, box.y + (1 - p.y) * box.height / 2);
}

test("ocean visual slice travels from a real planet, opens a saved memory and returns to exploration", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const seed = createSeed();
  seed.planets = [{ ...seed.planets[1], id: "visual-slice-review", isDemo: false, name: "隔离测试星球", galaxyId: "unclassified", position: [0, 1, 0], appearance: { ...seed.planets[1].appearance, size: 1.55 } }];
  await page.goto("/");
  await page.evaluate(({ seed, archiveKey }) => {
    localStorage.setItem(archiveKey, JSON.stringify(seed));
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify({ position: [0, 6, 28], target: [0, 0, 0] }));
  }, { seed, archiveKey });
  await page.reload();
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await ready(page, ".universe-canvas canvas");
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".universe-canvas canvas")?.dataset.travelPhase === "idle");
  await page.screenshot({ path: info.outputPath("01-exterior.png") });
  const clickAt = Date.now();
  await raycast(page, ".universe-canvas canvas", [0, 1, 0], 43);
  await expect(page).toHaveURL(/\/planet\/visual-slice-review$/);
  const routeMs = Date.now() - clickAt;
  await page.locator('.planet-world-canvas canvas[data-world-ready="true"]').waitFor({ timeout: 45_000 });
  await ready(page, ".planet-world-canvas canvas");
  await page.screenshot({ path: info.outputPath("02-empty-coast.png") });
  expect(await page.locator(".planet-world-canvas canvas").getAttribute("data-world-anchors")).toBe("[]");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).memories.length, archiveKey)).toBe(0);
  const metrics = JSON.parse((await page.locator(".planet-world-canvas canvas").getAttribute("data-render-metrics"))!);
  await info.attach("performance", { body: JSON.stringify({ routeMs, metrics }), contentType: "application/json" });

  const canvas = page.locator(".planet-world-canvas canvas"), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .56);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .35, box.y + box.height * .58, { steps: 15 }); await page.mouse.up();
  await page.screenshot({ path: info.outputPath("03-coast-second-view.png") });
  await page.getByRole("button", { name: "写一条记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("隔离测试：海岸时光");
  await page.getByLabel("写下你的记忆", { exact: true }).fill("仅由浏览器自动化保存的测试记忆，不是用户经历。");
  await page.getByLabel("添加照片或视频", { exact: true }).setInputFiles("tests/fixtures/memory.png");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.reload(); await ready(page, ".planet-world-canvas canvas");
  const anchorData = JSON.parse((await page.locator(".planet-world-canvas canvas").getAttribute("data-world-anchors"))!);
  expect(anchorData).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("04-memory-in-world.png") });
  await raycast(page, ".planet-world-canvas canvas", anchorData[0].position, 56);
  await expect(page.locator(".memory-detail-body")).toContainText("仅由浏览器自动化保存");
  await expect.poll(() => page.locator(".memory-detail-panel img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(640);
  await page.screenshot({ path: info.outputPath("05-open-memory.png") });
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).memories.length, archiveKey)).toBe(1);
  expect(errors).toEqual([]);
});
