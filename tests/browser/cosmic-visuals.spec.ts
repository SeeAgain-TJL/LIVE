import { expect, test } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { galaxyPosition } from "../../src/domain/galaxy";
import { galaxyOverview } from "../../src/domain/cosmic-visuals";

test("cosmic quality, drag rejection, cancellation and universe view restore preserve records", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".galaxy-scene-label")).toHaveCount(5);
  const raw = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  const canvas = page.locator("canvas").first();
  await expect.poll(() => canvas.getAttribute("data-render-metrics")).toContain('"tier":"medium"');
  await page.getByLabel("宇宙渲染质量").selectOption("low");
  await expect.poll(() => canvas.getAttribute("data-render-metrics")).toContain('"tier":"low"');
  const box = (await canvas.boundingBox())!;
  const view = galaxyOverview(5, box.width / box.height);
  const camera = new PerspectiveCamera(43, box.width / box.height, 0.1, 2500);
  camera.position.fromArray(view.position); camera.lookAt(...view.target); camera.updateMatrixWorld();
  const center = new Vector3(...galaxyPosition(0)).project(camera);
  const x = box.x + (center.x + 1) * box.width / 2, y = box.y + (1 - center.y) * box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 50, y + 30, { steps: 8 }); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up();
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "idle");
  // Wheel/orbit changes are real bookmarks, not a static test camera.
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65); await page.mouse.wheel(0, -140);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("universe-of-me:cosmic-camera:v1"))).not.toBeNull();
  await expect(page.locator("canvas").first()).toHaveAttribute("data-travel-phase", "idle");
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "flying");
  // Departure captures the actual camera, including the last damping movement.
  const origin = await page.evaluate(() => JSON.parse(localStorage.getItem("universe-of-me:cosmic-camera:v1")!));
  await page.getByRole("button", { name: "进入星系：成长", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveAttribute("data-galaxy-flight", "idle");
  await expect(page.locator("canvas").first()).toHaveAttribute("data-travel-phase", "idle");
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  await expect(page.locator(".planet-list-item")).toHaveCount(5);
  await page.getByRole("link", { name: "← 返回宇宙星系", exact: true }).click();
  await expect(page.locator(".galaxy-scene-label")).toHaveCount(5);
  await expect(page.getByLabel("宇宙渲染质量")).toHaveValue("low");
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("universe-of-me:cosmic-camera:v1")!));
  for (let i = 0; i < 3; i++) expect(restored.position[i]).toBeCloseTo(origin.position[i], 1);
  await expect.poll(async () => {
    const metrics = JSON.parse((await page.locator("canvas").first().getAttribute("data-render-metrics")) ?? "{}");
    return metrics.camera ? Math.hypot(...metrics.camera.map((n: number, i: number) => n - origin.position[i])) : Infinity;
  }).toBeLessThan(0.1);
  await page.reload(); await expect(page.getByLabel("宇宙渲染质量")).toHaveValue("low");
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
  expect(errors).toEqual([]);
});

test("mobile controls and reduced motion reach the same real galaxy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/"); await expect(page.locator(".galaxy-scene-label")).toHaveCount(5);
  await page.getByLabel("宇宙渲染质量").selectOption("medium");
  await expect.poll(() => page.locator("canvas").first().getAttribute("data-render-metrics")).toContain('"tier":"medium"');
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
