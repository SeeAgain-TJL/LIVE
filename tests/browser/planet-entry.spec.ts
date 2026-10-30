import { openGuide } from "./guide-actions";
import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { createSeed } from "../../src/data/seed";
import type { CameraBookmark } from "../../src/domain/types";

const origin: CameraBookmark = { position: [0, 6, 28], target: [0, 0, 0] };
const planets = createSeed().planets.slice(0, 2).map((p, i) => ({ ...p, id: `entry-${i}`, name: `进入验收 ${i === 0 ? "A" : "B"}`, isDemo: false, description: "仅用于隔离浏览器测试。", position: (i === 0 ? [-4, 1, 0] : [7, -1, -3]) as [number, number, number], appearance: { ...p.appearance, size: 1.5, rings: false } }));

async function prepare(page: Page, mobile = false) {
  await page.goto("/"); await expect(page.locator(".galaxy-list article")).toHaveCount(5);
  const bookmark = mobile ? { position: [-4, 4, 30], target: [-4, 1, 0] } as CameraBookmark : origin;
  const raw = JSON.stringify({ ...createSeed(), revision: 2, planets });
  await page.evaluate(({ raw, bookmark }) => {
    localStorage.setItem("universe-of-me:data:v1", raw);
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(bookmark));
  }, { raw, bookmark });
  await page.goto("/galaxy/unclassified");
  await expect(page.locator(".planet-label")).toHaveCount(2);
  return { raw, bookmark };
}

async function point(page: Page, index: number, bookmark: CameraBookmark) {
  const box = (await page.locator(".universe-canvas canvas").boundingBox())!;
  const camera = new PerspectiveCamera(43, box.width / box.height, 0.1, 30000);
  camera.position.fromArray(bookmark.position); camera.lookAt(...bookmark.target); camera.updateMatrixWorld();
  const p = new Vector3(...planets[index].position).project(camera);
  return { x: box.x + (p.x + 1) * box.width / 2, y: box.y + (1 - p.y) * box.height / 2 };
}
async function archive(page: Page) { return page.evaluate(() => localStorage.getItem("universe-of-me:data:v1")); }
async function bookmark(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem("universe-of-me:camera:v1:galaxy:unclassified")!)); }
function expectView(actual: CameraBookmark, expected: CameraBookmark) {
  for (const key of ["position", "target"] as const) expected[key].forEach((n, i) => expect(actual[key][i]).toBeCloseTo(n, 6));
}

test("single WebGL click enters automatically, ignores repeat clicks and returns to the exact prior view", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const { raw } = await prepare(page);
  const companion = await page.locator(".global-guide").elementHandle();
  const beforeLabels = await page.locator(".planet-label").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const a = await point(page, 0, origin), b = await point(page, 1, origin);
  await page.mouse.move(a.x, a.y);
  await expect(page.locator(".planet-hover-summary")).toContainText("进入验收 A");
  await page.mouse.click(a.x, a.y);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "flying");
  await expect(page.locator(".selection-card")).toHaveCount(0);
  await expect(page.locator(".global-guide-message")).toHaveText("找到它了，我们出发吧。");
  await page.mouse.click(b.x, b.y);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "approaching");
  await expect(page.locator(".global-guide-message")).toHaveText("已经快到了。");
  await page.screenshot({ path: "test-results/planet-approach-desktop.png" });
  await expect(page).toHaveURL(/\/planet\/entry-0$/);
  await expect(page.locator(".memory-space-canvas canvas")).toBeVisible();
  await expect(page.locator(".global-guide-message")).toHaveText("这些都是你曾经留下的时光。");
  expect(await companion!.evaluate(el => el.isConnected)).toBe(true);
  expect(await archive(page)).toBe(raw);
  expectView(await bookmark(page), origin);
  expect(await page.evaluate(() => sessionStorage.getItem("universe-of-me:visit:v1:entry-1"))).toBeNull();
  const visit = await page.evaluate(() => JSON.parse(sessionStorage.getItem("universe-of-me:visit:v1:entry-0")!));
  expectView(visit.origin, origin);
  await page.getByRole("button", { name: "写一条记忆", exact: true }).click();
  await page.getByLabel("记忆标题", { exact: true }).fill("进入后新增");
  await page.getByLabel("写下你的记忆", { exact: true }).fill("进入与返回不影响记忆保存。");
  await page.getByLabel("添加照片或视频", { exact: true }).setInputFiles("tests/fixtures/memory.png");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("写下你的记忆", { exact: true }).fill("进入后编辑仍可保存。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "列表管理", exact: true }).click();
  await page.getByRole("button", { name: "打开记忆：进入后新增", exact: true }).click();
  await expect(page.locator(".memory-detail-body")).toHaveText("进入后编辑仍可保存。");
  await expect.poll(() => page.locator(".memory-detail-panel img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await page.keyboard.press("Escape");
  const saved = await archive(page);
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "returning");
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  await expect(page).toHaveURL(/\/galaxy\/unclassified\?planet=entry-0$/);
  expectView(await bookmark(page), origin);
  expect(await archive(page)).toBe(saved);
  await expect.poll(async () => page.locator(".planet-label").evaluateAll((nodes, before) => Math.max(...nodes.map((node, i) => { const r = node.getBoundingClientRect(); return Math.hypot(r.x + r.width / 2 - before[i].x, r.y + r.height / 2 - before[i].y); })), beforeLabels)).toBeLessThan(1);
  await page.getByRole("button", { name: "关闭星球预览", exact: true }).click();
  await page.mouse.click(b.x, b.y);
  await expect(page).toHaveURL(/\/planet\/entry-1$/);
  expect(await archive(page)).toBe(saved);
  expect(errors).toEqual([]);
});

test("dragging out and back never enters; Escape cancels flight and transition, then another entry works", async ({ page }) => {
  const { raw } = await prepare(page);
  const a = await point(page, 0, origin);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 55, a.y + 6, { steps: 5 });
  await page.mouse.move(a.x, a.y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expect(await page.evaluate(() => sessionStorage.getItem("universe-of-me:visit:v1:entry-0"))).toBeNull();
  const current = await bookmark(page);
  const target = await point(page, 0, current);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "flying");
  const departure = await page.evaluate(() => JSON.parse(sessionStorage.getItem("universe-of-me:visit:v1:entry-0")!).origin);
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expectView(await bookmark(page), departure);
  const restored = await point(page, 0, departure);
  await page.mouse.click(restored.x, restored.y);
  await page.waitForFunction(() => document.querySelector("main")?.getAttribute("data-journey-phase") === "transition", undefined, { polling: "raf" });
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  expect(await archive(page)).toBe(raw);
  await page.mouse.click(restored.x, restored.y);
  await expect(page).toHaveURL(/\/planet\/entry-0$/);
});

test("mobile tap enters with reduced motion, direct URL return is safe, and automatic prompts can be muted", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { raw, bookmark: mobileOrigin } = await prepare(page, true);
  await page.getByRole("button", { name: "收起星球列表", exact: true }).click();
  await openGuide(page);
  await page.getByRole("button", { name: "带我去看看", exact: true }).click();
  await page.getByLabel("飞行与抵达时显示简短提示", { exact: true }).uncheck();
  await page.getByRole("button", { name: "关闭引导查找", exact: true }).click();
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  const p = await point(page, 0, mobileOrigin);
  // Touchscreen tap (not a synthetic click), retaining the same raycast path.
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }, { x: p.x + 18, y: p.y + 18 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expect(await page.evaluate(() => sessionStorage.getItem("universe-of-me:visit:v1:entry-0"))).toBeNull();
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page).toHaveURL(/\/planet\/entry-0$/);
  await expect(page.locator(".companion-bubble")).toHaveCount(0);
  await openGuide(page);
  await expect(page.getByLabel("飞行与抵达时显示简短提示", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  expect(await archive(page)).toBe(raw);
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expectView(await bookmark(page), mobileOrigin);
  // entry-1 has never been visited, so a direct URL has no visit/session return view.
  await page.goto("/planet/entry-1");
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified\?planet=entry-1$/);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expectView(await bookmark(page), mobileOrigin);
  expect(await archive(page)).toBe(raw);
  await page.screenshot({ path: "test-results/planet-return-mobile.png", fullPage: true });
});

test("missing WebGL never locks direct URL return or list-based archive access", async ({ page }) => {
  const { raw } = await prepare(page);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.includes("webgl")) return null;
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>);
    } as typeof getContext;
  });
  await page.goto("/planet/entry-0");
  await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified/);
  await expect(page.locator(".scene-fallback")).toContainText("3D 信号暂不可用");
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  await expect(page.getByRole("button", { name: "创建星球", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "关闭星球预览", exact: true }).click();
  await page.getByRole("button", { name: "展开星球列表", exact: true }).click();
  await page.locator(".planet-list-item").last().click();
  await expect(page.getByRole("button", { name: "靠近星球", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "进入记忆空间", exact: true }).click();
  await expect(page).toHaveURL(/\/planet\/entry-1$/);
  expect(await archive(page)).toBe(raw);
});
