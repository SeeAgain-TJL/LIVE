import { expect, test } from "@playwright/test";

test("isolated coastal asset lab renders real WebGL, moves the camera and leaves the archive alone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/coast-lab");
  const before = await page.evaluate(async () => ({ storage: { ...localStorage }, databases: await indexedDB.databases() }));
  const canvas = page.locator(".coast-lab canvas");
  await expect.poll(() => canvas.getAttribute("data-render-metrics"), { timeout: 60_000 }).toBeTruthy();
  const start = JSON.parse((await canvas.getAttribute("data-render-metrics"))!);
  expect(start.triangles).toBeGreaterThan(1_000_000);
  await canvas.focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(1500);
  await page.keyboard.up("w");
  await expect.poll(async () => JSON.parse((await canvas.getAttribute("data-render-metrics"))!).camera[2]).toBeLessThan(start.camera[2] - 1);
  const after = await page.evaluate(async () => ({ storage: { ...localStorage }, databases: await indexedDB.databases() }));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});
