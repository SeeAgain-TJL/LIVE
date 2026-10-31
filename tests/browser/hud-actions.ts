import { expect, type Page } from "@playwright/test";
export async function openNavigation(page: Page) {
  const button = page.getByRole("button", { name: "打开导航", exact: true });
  if (await button.isVisible()) await button.click();
}
export async function openSettings(page: Page) {
  if (!await page.getByLabel("宇宙渲染质量").isVisible()) await page.getByRole("button", { name: "设置与帮助", exact: true }).click();
}
export async function openPlanets(page: Page) {
  const button = page.getByRole("button", { name: "展开星球列表", exact: true });
  if (await button.isVisible()) await button.click();
}
export async function openManager(page: Page) {
  const button = page.getByRole("button", { name: "记忆管理", exact: true });
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
}
export async function openOrbSpace(page: Page) {
  if (await page.locator(".memory-space-canvas canvas").isVisible()) return;
  await openManager(page);
  await page.getByRole("button", { name: "记忆球空间", exact: true }).click();
  await expect(page.locator(".memory-space-canvas canvas")).toBeVisible();
}
