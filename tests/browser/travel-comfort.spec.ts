import { expect, test } from "@playwright/test";
import { createSeed } from "../../src/data/seed";

test("comfort is the persistent default, holds at arrival, cancels safely, and fast remains optional", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas").first(), select = page.getByLabel("旅行节奏", { exact: true });
  await expect(select).toHaveValue("comfort");
  await expect(canvas).toHaveAttribute("data-travel-phase", "idle");
  const archive = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(select).toBeDisabled();
  await expect(canvas).toHaveAttribute("data-travel-phase", "cruising");
  const fov = () => canvas.getAttribute("data-render-metrics").then(raw => JSON.parse(raw!).fov);
  expect(await fov()).toBe(43);
  await expect(canvas).toHaveAttribute("data-travel-phase", "settling");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-travel-phase", "idle");
  await expect(page).toHaveURL(/\/$/);
  await select.selectOption("fast"); await page.reload();
  await expect(select).toHaveValue("fast");
  await page.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
  await expect(select).toHaveValue("fast"); await select.selectOption("standard"); await page.keyboard.press("Escape");
  await page.reload(); await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
  await expect(select).toHaveValue("standard");
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(archive);
});

test("empty galaxies show a real environment without creating archive planets", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(raw => localStorage.setItem("universe-of-me:data:v1", raw), JSON.stringify(createSeed()));
  await page.goto("/galaxy/growth");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".list-empty")).toContainText("环境天体与碎片带不包含记忆档案");
  await expect.poll(async () => JSON.parse((await page.locator("canvas").first().getAttribute("data-render-metrics")) ?? "{}").textures).toBeGreaterThanOrEqual(3);
  const before = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  const data = JSON.parse(before!);
  expect(data.planets.filter((p: { galaxyId: string }) => p.galaxyId === "growth")).toHaveLength(0);
  await page.reload(); await expect(page.locator(".planet-label")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(before);
});
