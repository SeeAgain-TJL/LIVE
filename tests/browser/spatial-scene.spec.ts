import { expect, test } from "@playwright/test";
import { createSeed } from "../../src/data/seed";

test("real lateral pan separates foreground from distant stars and orbit visibility preserves the archive", async ({ page }) => {
  await page.goto("/");
  const fixture = createSeed(); fixture.planets = fixture.planets.map((planet, index) => ({ ...planet, id: `spatial-${index}`, name: `空间验收 ${index + 1}`, isDemo: false }));
  await page.evaluate(data => localStorage.setItem("universe-of-me:data:v1", JSON.stringify(data)), fixture);
  await page.reload();
  const canvas = page.locator("canvas").first();
  const metrics = async () => JSON.parse((await canvas.getAttribute("data-render-metrics")) ?? "{}");
  await expect.poll(async () => (await metrics()).landmarks?.length).toBe(2);
  const raw = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  const before = await metrics();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * .7, y = box.y + box.height * .75;
  await page.mouse.move(x, y); await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 65, y, { steps: 15 }); await page.mouse.up({ button: "right" });
  await expect.poll(async () => Math.abs((await metrics()).camera[0] - before.camera[0])).toBeGreaterThan(1);
  await page.waitForTimeout(1200);
  const after = await metrics();
  const shifts = after.landmarks.map((p: { x: number }, i: number) => Math.abs(p.x - before.landmarks[i].x));
  expect(shifts[0]).toBeGreaterThan(shifts[1] * 8);
  for (let i = 0; i < 3; i++) expect(after.camera[i] - before.camera[i]).toBeCloseTo(after.target[i] - before.target[i], 4);
  expect(after.fov).toBeCloseTo(43, 5);
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "idle");
  await page.getByRole("link", { name: "直接打开星系：未分类星系", exact: true }).click();
  await expect(page.locator(".planet-label")).toHaveCount(5);
  await expect.poll(async () => (await metrics()).calls).toBeGreaterThan(20);
  const withOrbits = (await metrics()).calls;
  await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
  await page.getByLabel("显示三维轨道", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await metrics()).calls).toBeLessThan(withOrbits);
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
});

test("fixed field of view stays steady on Escape and cancelling blocks conflicting trips", async ({ page }) => {
  await page.goto("/"); await expect(page.locator(".galaxy-scene-label")).toHaveCount(5);
  const metrics = async () => JSON.parse((await page.locator("canvas").first().getAttribute("data-render-metrics")) ?? "{}");
  await expect.poll(async () => (await metrics()).fov).toBe(43);
  const before = await metrics();
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page.locator("canvas").first()).toHaveAttribute("data-travel-phase", "cruising");
  expect((await metrics()).fov).toBe(43);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "进入星系：成长", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "idle");
  await expect.poll(async () => Math.hypot(...(await metrics()).camera.map((n: number, i: number) => n - before.camera[i]))).toBeLessThan(.1);
  expect((await metrics()).fov).toBeCloseTo(43, 5);
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
});

test("unavailable WebGL cannot leave cancellation locked and direct navigation remains available", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.includes("webgl")) return null;
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>);
    } as typeof getContext;
  });
  await page.goto("/");
  await expect(page.locator(".galaxy-render-fallback")).toBeVisible();
  const raw = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3200); // Fallback unlock is bounded when no camera can emit completion.
  await page.getByRole("button", { name: "进入星系：成长", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "flying");
  await page.getByRole("link", { name: "直接打开星系：友情", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/friendship$/);
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
});
