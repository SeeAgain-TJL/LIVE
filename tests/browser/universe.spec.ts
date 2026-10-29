import { expect, test } from "@playwright/test";

test("create a named world, fly into its archive and retain a text memory after reload", async ({ page }) => {
  const errors: string[] = [];
  let phase = "load";
  page.on("pageerror", error => errors.push(`${phase}: ${error.stack ?? error.message}`));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "创建星球", exact: true })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "创建星球", exact: true }).click();
  await page.getByLabel("星球名称", { exact: false }).fill("浏览器验收星球");
  phase = "save planet";
  await page.getByRole("button", { name: "诞生一颗星球" }).click();
  await expect(page.getByRole("heading", { name: "浏览器验收星球" })).toBeVisible();
  phase = "enter archive";
  await page.getByRole("button", { name: "进入记忆空间" }).click();
  await expect(page).toHaveURL(/\/planet\//);
  phase = "save memory";
  await page.getByRole("button", { name: "写一条记忆" }).click();
  await page.getByLabel("记忆标题").fill("验收记录");
  await page.getByLabel("写下你的记忆").fill("这是一条自动化验收文字，仅存在隔离测试浏览器中。");
  await page.getByRole("button", { name: "保存记忆" }).click();
  await expect(page.getByRole("heading", { name: "验收记录" })).toBeVisible();
  // A single result must not implicitly reopen after an explicit dismissal.
  await page.getByRole("button", { name: "关闭记忆详情" }).click();
  await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  phase = "reload";
  await page.reload();
  await page.getByRole("button", { name: "列表管理", exact: true }).click();
  await page.getByRole("button", { name: "打开记忆：验收记录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "验收记录" })).toBeVisible();
  await page.getByRole("button", { name: "关闭记忆详情" }).click();
  await page.getByRole("button", { name: "记忆球空间", exact: true }).click();
  await expect(page.locator(".memory-space-canvas canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/archive-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("mobile creation dialog stays inside the viewport and saves an unnamed draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "创建星球", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "诞生一颗星球" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "未命名草稿" })).toBeVisible();
  await page.screenshot({ path: "test-results/universe-mobile.png", fullPage: true });
});
