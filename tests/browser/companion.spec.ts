import { openNavigation } from "./hud-actions";
import { expect, test, type Page } from "@playwright/test";
import { createSeed } from "../../src/data/seed";
import { openGuide } from "./guide-actions";

const preferenceKey = "universe-of-me:guide:v1";
async function archive(page: Page) { return page.evaluate(() => localStorage.getItem("universe-of-me:data:v1")); }
async function preferences(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), preferenceKey); }

async function seedRecords(page: Page) {
  await page.goto("/"); await expect(page.locator(".galaxy-list article")).toHaveCount(5);
  const seed = createSeed();
  const planets = seed.planets.slice(0, 2).map((p, i) => ({ ...p, id: `companion-${i}`, name: `陪伴验收 ${i === 0 ? "A" : "B"}`, description: "仅用于隔离浏览器测试", isDemo: false }));
  const now = "2026-01-01T00:00:00.000Z";
  const raw = JSON.stringify({ ...seed, revision: 3, planets, memories: [
    { id: "memory-a", planetId: planets[0].id, title: "旧日海风", body: "海风关键词，真实测试正文", occurredOn: "2021-04-12", mediaIds: [], kind: "text", createdAt: now, updatedAt: now },
    { id: "memory-b", planetId: planets[1].id, title: "新的航程", body: "另一颗星球的测试正文", occurredOn: "2026-02-03", mediaIds: [], kind: "text", createdAt: now, updatedAt: now },
  ] });
  await page.evaluate(raw => localStorage.setItem("universe-of-me:data:v1", raw), raw); await page.reload();
  await expect(page.getByRole("button", { name: "展开记忆引导者", exact: true })).toBeVisible();
  return raw;
}

test("character-only default, 2D drag versus click, saved edge/height, dialogue/mute/hide survive refresh", async ({ page }) => {
  await page.goto("/");
  const guide = page.locator(".global-guide");
  const character = page.getByRole("button", { name: "展开记忆引导者", exact: true });
  await expect(character).toBeVisible();
  const raw = await archive(page);
  await expect(page.getByRole("region", { name: "引导者对话", exact: true })).toHaveCount(0);
  await expect(page.locator(".guide-asset-preview")).toHaveCount(0);
  const b = (await character.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(1160, 210, { steps: 12 }); await page.mouse.up();
  await expect(guide).toHaveClass(/at-right/);
  await expect(page.getByRole("region", { name: "引导者对话", exact: true })).toHaveCount(0);
  const saved = await preferences(page); expect(saved.heightRatio).toBeLessThan(.6);
  const position = (await guide.boundingBox())!;
  await page.reload();
  await expect(guide).toHaveClass(/at-right/);
  await expect.poll(async () => Math.abs((await guide.boundingBox())!.y - position.y)).toBeLessThan(1);
  await openGuide(page);
  await expect(page.locator(".global-guide-message")).toContainText("欢迎回来");
  await page.getByLabel("飞行与抵达时显示简短提示", { exact: true }).uncheck();
  await page.reload();
  await expect(page.getByRole("region", { name: "引导者对话", exact: true })).toBeVisible();
  await expect(page.getByLabel("飞行与抵达时显示简短提示", { exact: true })).not.toBeChecked();
  await page.screenshot({ path: "test-results/companion-dialogue-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "隐藏记忆引导者", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "显示记忆引导者", exact: true })).toBeVisible();
  await expect(page.locator(".guide-character-art")).toHaveCount(0);
  await openNavigation(page);  await page.getByRole("link", { name: "直接打开星系：成长", exact: true }).click();
  await expect(page.getByRole("button", { name: "显示记忆引导者", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "显示记忆引导者", exact: true }).click();
  await page.keyboard.press("Escape");
  await character.focus(); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowDown");
  await expect(guide).toHaveClass(/at-left/);
  expect((await preferences(page)).hidden).toBe(false);
  await expect.poll(() => character.evaluate(el => {
    const r = el.getBoundingClientRect();
    return [...document.querySelectorAll("main .search-box, main .galaxy-back-navigation")].every(node => {
      const b = node.getBoundingClientRect(); return !node.getClientRects().length || getComputedStyle(node).visibility === "hidden" || r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom;
    });
  })).toBe(true);
  expect(await archive(page)).toBe(raw);
  await page.screenshot({ path: "test-results/companion-character-desktop.png", fullPage: true });
});

test("guide follows actual galaxy/planet flight and searches real memories across planets, with parent navigation", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const raw = await seedRecords(page);
  const instance = await page.locator(".global-guide").elementHandle();
  await openGuide(page); await page.getByRole("button", { name: "带我去看看", exact: true }).click();
  await page.getByLabel("引导者目的地搜索", { exact: true }).fill("未分类");
  await page.getByRole("button", { name: /前往星系：未分类星系/ }).click();
  await expect(page.locator(".global-guide")).toHaveAttribute("data-state", "guiding");
  await expect(page.locator(".global-guide-message")).toHaveText("我们先去那片星系看看吧。");
  await expect(page).toHaveURL(/\/galaxy\/unclassified$/);
  await openGuide(page); await page.getByRole("button", { name: "带我去看看", exact: true }).click();
  await page.getByLabel("引导者目的地搜索", { exact: true }).fill("陪伴验收 B");
  await page.getByRole("button", { name: /前往星球：陪伴验收 B/ }).click();
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "flying");
  await expect(page.locator(".global-guide-message")).toHaveText("找到它了，我们出发吧。");
  await expect(page).toHaveURL(/\/planet\/companion-1$/);
  await expect(page.locator(".global-guide-message")).toHaveText("欢迎来到你的世界，可以慢慢探索。");
  expect(await instance!.evaluate(el => el.isConnected)).toBe(true);
  await openGuide(page); await page.getByRole("button", { name: "帮我寻找", exact: true }).click();
  await page.getByLabel("引导者记忆搜索", { exact: true }).fill("海风关键词");
  await page.getByLabel("引导者记忆年份", { exact: true }).fill("2021");
  await expect(page.locator(".guide-destinations")).toContainText("找到 1 条记忆");
  await page.getByRole("button", { name: /打开记忆：旧日海风/ }).click();
  await expect(page).toHaveURL(/\/planet\/companion-0$/);
  await expect(page.locator(".memory-detail-body")).toHaveText("海风关键词，真实测试正文");
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await page.reload(); await expect(page.locator(".memory-detail-panel")).toHaveCount(0);
  await openGuide(page); await page.getByRole("button", { name: "最近记忆", exact: true }).click();
  await expect(page.locator(".guide-destinations > button").first()).toContainText("新的航程");
  await page.getByRole("button", { name: /打开记忆：旧日海风/ }).click();
  await expect(page.locator(".memory-detail-panel h2")).toHaveText("旧日海风");
  await page.getByRole("button", { name: "关闭记忆详情", exact: true }).click();
  await openGuide(page);
  await page.getByRole("region", { name: "引导者对话", exact: true }).getByRole("link", { name: "返回上一级", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/unclassified/);
  await expect(page.locator("main")).toHaveAttribute("data-journey-phase", "idle");
  expect(await archive(page)).toBe(raw); expect(errors).toEqual([]);
  await openGuide(page);
  await expect(page.getByRole("button", { name: "带我去看看", exact: true })).toBeEnabled();
  await page.getByLabel("飞行与抵达时显示简短提示", { exact: true }).uncheck();
  await page.getByRole("button", { name: "收起记忆引导者", exact: true }).click();
  await page.goto("/planet/companion-1");
  await expect(page.getByRole("button", { name: "展开记忆引导者", exact: true })).toBeVisible();
  await expect(page.locator(".companion-bubble")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "展开记忆引导者", exact: true })).toBeVisible();
  await expect(page.locator(".companion-bubble")).toHaveCount(0);
  // Page navigation can interrupt a flight; it must release the guide's global busy state.
  await page.goto("/");
  await openNavigation(page);  await page.getByRole("button", { name: "进入星系：成长", exact: true }).click();
  await expect(page.locator(".global-guide")).toHaveAttribute("data-state", "guiding");
  await openNavigation(page);  await page.getByRole("link", { name: "直接打开星系：友情", exact: true }).click();
  await expect(page).toHaveURL(/\/galaxy\/friendship$/);
  await openGuide(page);
  await expect(page.getByRole("button", { name: "带我去看看", exact: true })).toBeEnabled();
  expect(await archive(page)).toBe(raw);
});

test("touch drag snaps without opening, survives rotation, and reduced motion disables character animation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const character = page.getByRole("button", { name: "展开记忆引导者", exact: true });
  await expect(character).toBeVisible();
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const b = (await character.boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 310, y: 220 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".global-guide")).toHaveClass(/at-right/);
  await expect(page.getByRole("region", { name: "引导者对话", exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.locator(".global-guide")).toHaveClass(/at-right/);
  await expect.poll(() => page.locator(".guide-character-visual").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await character.boundingBox())!.y + (await character.boundingBox())!.height <= 390).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page); await page.getByRole("button", { name: "帮我寻找", exact: true }).click();
  const panel = (await page.locator(".companion-search").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  expect(panel.y + panel.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/companion-mobile-search.png", fullPage: true });
});

test("unknown preferences are preserved and failed preference writes do not change personal data", async ({ page }) => {
  const raw = await seedRecords(page);
  const future = '{"version":99,"keep":"future UI"}';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: preferenceKey, value: future });
  await page.reload(); await openGuide(page);
  await expect(page.locator(".guide-preference-error")).toContainText("原有存储未改写");
  await page.getByLabel("飞行与抵达时显示简短提示", { exact: true }).uncheck();
  expect(await page.evaluate(key => localStorage.getItem(key), preferenceKey)).toBe(future);
  expect(await archive(page)).toBe(raw);
});
