import { expect, test } from "@playwright/test";
import { visualPresets } from "../../src/components/three/visual-library";

test("the standalone atlas renders all shipped appearances without touching browser storage", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("universe-of-me:data:v1", "test sentinel: no provider writes"));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/planet-visual-library");
  const viewport = page.locator(".pvl-viewport");
  const canvas = viewport.locator("canvas");
  await expect(canvas).toBeVisible();
  for (const preset of visualPresets) {
    await page.locator(`[data-preset="${preset.id}"]`).click();
    await expect(page.getByRole("heading", { name: preset.name })).toBeVisible();
    await expect(viewport).toHaveAttribute("data-visual-status", "ready");
  }
  for (const [name, tier] of [["中", "medium"], ["低", "low"], ["高", "high"]]) {
    await page.getByRole("group", { name: "画质" }).getByRole("button", { name, exact: true }).click();
    await expect(viewport).toHaveAttribute("data-visual-tier", tier);
    await expect(viewport).toHaveAttribute("data-visual-status", "ready");
  }
  await page.getByRole("button", { name: "背光", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-visual-view", "back");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .62, bounds.y + bounds.height * .53, { steps: 5 }); await page.mouse.up();
    await page.mouse.wheel(0, -200);
  }
  await page.locator(".pvl-catalog summary").click();
  await expect(page.getByText("极光寒霜星", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe("test sentinel: no provider writes");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("展示样例 · 不含个人记忆")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a missing asset is explicit and another tier can recover", async ({ page }) => {
  await page.route("**/red-wastes-high.pvl", route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/planet-visual-library");
  await expect(page.getByRole("status")).toContainText("未能加载");
  await page.getByRole("group", { name: "画质" }).getByRole("button", { name: "中", exact: true }).click();
  await expect(page.locator(".pvl-viewport")).toHaveAttribute("data-visual-status", "ready");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("applying an appearance in the editor keeps the planet unnamed and the existing schema", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "创建星球", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("外观预设").selectOption("verdant-world");
  await expect(dialog.getByLabel("星球名称", { exact: false })).toHaveValue("");
  await expect(dialog.getByRole("link", { name: /浏览星球视觉库/ })).toHaveAttribute("href", "/planet-visual-library");
  await dialog.getByRole("button", { name: "诞生一颗星球" }).click();
  await expect(page.getByRole("heading", { name: "未命名草稿" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("universe-of-me:data:v1") ?? "{}").planets);
  const created = stored.find((planet: { appearance: { seed: number } }) => planet.appearance.seed === 4100012);
  expect(created.name).toBeNull();
  expect(Object.keys(created.appearance).sort()).toEqual(["color", "rings", "seed", "size", "type"]);
});
