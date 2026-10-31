import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { createSeed } from "../../src/data/seed";
import { planetApproach } from "../../src/domain/planet-flight";

test.use({ viewport: { width: 1440, height: 900 }, video: { mode: "on", size: { width: 1440, height: 900 } } });
const key = "universe-of-me:data:v1";
async function prepare(page: Page) {
  const seed = createSeed();
  seed.planets = [{ ...seed.planets[0], id: "review-world", name: "隔离验收世界", isDemo: false, position: [0, 1, 0], appearance: { ...seed.planets[0].appearance, size: 1.5, rings: false } }];
  await page.goto("/");
  await page.evaluate(({ seed, key }) => {
    localStorage.setItem(key, JSON.stringify(seed));
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify({ position: [0, 6, 28], target: [0, 0, 0] }));
  }, { seed, key });
  await page.reload();return JSON.stringify(seed);
}
async function ready(page: Page, selector = ".planet-world-canvas canvas") {
  await expect.poll(() => page.locator(selector).getAttribute("data-render-metrics")).toBeTruthy();
}
async function raycast(page: Page, selector: string, position: number[], fov = 43) {
  await ready(page, selector);
  const canvas = page.locator(selector), box = (await canvas.boundingBox())!;
  const metrics = JSON.parse((await canvas.getAttribute("data-render-metrics"))!);
  const camera = new PerspectiveCamera(fov, box.width / box.height, .1, 30000);
  camera.position.fromArray(metrics.camera);camera.lookAt(...metrics.target as [number, number, number]);camera.updateMatrixWorld();
  const p = new Vector3(...position as [number, number, number]).project(camera);
  await page.mouse.click(box.x + (p.x + 1) * box.width / 2, box.y + (1 - p.y) * box.height / 2);
}

test("continuous journey reaches world directly, reads actual memory anchors, persists edits and restores view", async ({ page }, info) => {
  const errors: string[] = [];page.on("pageerror", e => errors.push(e.message));
  const raw = await prepare(page);
  await ready(page, ".universe-canvas canvas");
  await expect(page.getByRole("textbox", { name: "搜索星系" })).not.toBeVisible();
  await expect(page.getByLabel("宇宙渲染质量")).toHaveCount(0);
  await page.getByRole("button", { name: "电影模式", exact: true }).click();
  await expect(page.locator(".guide-character-art")).toHaveCount(0);
  await page.getByRole("button", { name: "展开记忆引导者", exact: true }).click();
  await expect(page.locator(".companion-dialogue")).toBeVisible();
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  await page.screenshot({ path: info.outputPath("01-cinema.png") });
  await page.getByRole("button", { name: "返回探索界面", exact: true }).click();
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  await ready(page, ".universe-canvas canvas");
  await page.waitForFunction(() => document.querySelector("canvas")?.dataset.travelPhase === "idle");
  await page.screenshot({ path: info.outputPath("02-galaxy.png") });
  await raycast(page, ".universe-canvas canvas", [0, 1, 0]);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "flying");
  const clicked = Date.now();
  await expect(page).toHaveURL(/\/planet\/review-world$/);
  const elapsed = Date.now() - clicked;expect(elapsed).toBeLessThan(6500);
  await ready(page);await expect(page.locator(".world-management")).toHaveCount(0);
  await expect(page.locator(".palace-empty")).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await page.screenshot({ path: info.outputPath("03-empty-world.png") });
  await page.getByRole("button", { name: "写一条记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("隔离验收：湖岸记录");
  await page.getByLabel("写下你的记忆", { exact: true }).fill("这是自动化测试主动保存的记录，不是用户人生数据。");
  await page.getByLabel("添加照片或视频", { exact: true }).setInputFiles("tests/fixtures/memory.png");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.reload();await ready(page);
  const anchors = JSON.parse((await page.locator(".planet-world-canvas canvas").getAttribute("data-world-anchors"))!);
  expect(anchors).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("04-real-memory-world.png") });
  await raycast(page, ".planet-world-canvas canvas", anchors[0].position, 56);
  await expect(page.locator(".memory-detail-body")).toContainText("自动化测试主动保存");
  await expect.poll(() => page.locator(".memory-detail-panel img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await page.screenshot({ path: info.outputPath("05-read-original.png") });
  await page.getByRole("button", { name: "展开记忆引导者", exact: true }).click();
  await page.getByRole("button", { name: "隐藏记忆引导者", exact: true }).click();
  await page.getByRole("button", { name: "显示记忆引导者", exact: true }).click();
  await expect(page.locator(".companion-dialogue")).toBeVisible();
  await expect(page.locator(".memory-detail-panel")).toBeVisible();
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("写下你的记忆", { exact: true }).fill("修改后刷新仍保留，媒体也仍可读取。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page.keyboard.press("Escape");await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "记忆管理", exact: true }).click();
  await page.getByLabel("搜索记忆", { exact: true }).fill("不会匹配");
  await page.getByRole("button", { name: "返回世界", exact: true }).click();
  await raycast(page, ".planet-world-canvas canvas", anchors[0].position, 56);
  await expect(page.locator(".memory-detail-body")).toHaveText("修改后刷新仍保留，媒体也仍可读取。");
  await page.keyboard.press("Escape");
  const saved = await page.evaluate(key => localStorage.getItem(key), key);
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(saved);
  const camera = await page.evaluate(() => JSON.parse(localStorage.getItem("universe-of-me:camera:v1:galaxy:unclassified")!));
  camera.position.forEach((v: number, i: number) => expect(v).toBeCloseTo([0, 6, 28][i], 5));
  expect(errors).toEqual([]);
  await info.attach("journey-timing", { body: JSON.stringify({ clickToRouteMs: elapsed }), contentType: "application/json" });
});

test("ESC cancels before arrival, repeat entry is safe, and no fixed settling phase remains", async ({ page }) => {
  await prepare(page);await page.goto("/galaxy/unclassified");
  await raycast(page, ".universe-canvas canvas", [0, 1, 0]);
  await page.keyboard.press("Escape");await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  await raycast(page, ".universe-canvas canvas", [0, 1, 0]);
  await page.evaluate(() => {
    const phases: string[] = [];(window as unknown as { phases: string[] }).phases = phases;
    const collect = () => { if (location.pathname.startsWith('/galaxy')) { phases.push(document.querySelector('canvas')?.dataset.travelPhase ?? '');requestAnimationFrame(collect); } };collect();
  });
  await expect(page).toHaveURL(/\/planet\/review-world$/);await ready(page);
  expect(await page.evaluate(() => (window as unknown as { phases: string[] }).phases)).not.toContain("settling");
});

test("a planet already at entry distance routes immediately without a minimum flight timer", async ({ page }) => {
  await prepare(page);
  const planet = { ...createSeed().planets[0], position: [0, 1, 0] as [number, number, number], appearance: { ...createSeed().planets[0].appearance, size: 1.5, rings: false } };
  const near = planetApproach(planet, { position: [0, 6, 28], target: [0, 0, 0] }, [planet], 1440 / 900);
  await page.evaluate(near => localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(near)), near);
  await page.goto("/galaxy/unclassified");await ready(page, ".universe-canvas canvas");
  const start = Date.now();await raycast(page, ".universe-canvas canvas", [0, 1, 0]);
  await expect(page).toHaveURL(/\/planet\/review-world$/);
  expect(Date.now() - start).toBeLessThan(1200);
});

test("empty galaxy keeps scenery visible and guide recovers while reading, dragging and resizing", async ({ page }, info) => {
  await prepare(page);await page.goto("/galaxy/growth");await ready(page, ".universe-canvas canvas");
  await expect(page.locator('.empty-galaxy-state')).toHaveCount(0);await expect(page.locator('.empty-galaxy-hud')).toBeVisible();
  await page.screenshot({ path: info.outputPath('06-empty-galaxy.png') });
  const figure = page.getByRole('button', { name: '展开记忆引导者', exact: true });
  await figure.click();await page.getByRole('button', { name: '隐藏记忆引导者', exact: true }).click();
  await page.getByRole('button', { name: '显示记忆引导者', exact: true }).click();
  await expect(page.locator('.companion-dialogue')).toBeVisible();
  await page.getByRole('button', { name: '收起记忆引导者', exact: true }).click();
  const box = (await figure.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);await page.mouse.down();await page.mouse.move(1370, 480, { steps: 20 });await page.mouse.up();
  await expect(page.locator('.companion')).toHaveClass(/at-right/);await expect(page.locator('.companion-dialogue')).toHaveCount(0);
  await page.reload();await expect(page.locator('.companion')).toHaveClass(/at-right/);
  await page.setViewportSize({ width: 390, height: 844 });await page.goto('/planet/review-world');await ready(page);
  await page.screenshot({ path: info.outputPath('07-mobile-world.png') });
  await figure.click();await expect(page.locator('.companion-dialogue')).toBeVisible();
  await page.getByRole('button', { name: '收起记忆引导者', exact: true }).click();
  await page.getByRole('button', { name: '记忆管理', exact: true }).click();await expect(page.getByLabel('搜索记忆', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回世界', exact: true }).click();
  const canvas = page.locator('.planet-world-canvas canvas');
  const before = JSON.parse((await canvas.getAttribute('data-render-metrics'))!).camera;
  await canvas.focus();await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-render-metrics'))!).camera).not.toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
