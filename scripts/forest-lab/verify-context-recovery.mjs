import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.resolve(process.env.PINE_EVIDENCE || "artifacts-local/pine-batch1-recovery");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url = (process.env.FOREST_LAB_URL || "http://127.0.0.1:3311") + (process.env.PINE_ROUTE || "/forest-origin-lab?diagnostic=fir");
try {
  await page.goto(url);
  const ready = page.locator("canvas[data-forest-origin-ready='true']");
  await ready.waitFor({ timeout: 90000 });
  const supported = await page.evaluate(() => {
    const extension = document.querySelector("canvas").getContext("webgl2").getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  assert.ok(supported);
  await page.getByRole("alert").filter({ hasText: "WebGL 上下文已丢失" }).waitFor();
  assert.equal(await ready.count(), 0);
  await page.screenshot({ path: path.join(folder, "context-lost.png") });
  await Promise.all([page.waitForEvent("framenavigated", frame => frame === page.mainFrame()),
    page.getByRole("button", { name: "重新加载场景" }).click()]);
  await ready.waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(folder, "recovered.png") });
  assert.equal(await page.locator(".forest-lab-status[role='alert']:visible").count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector("canvas").getContext("webgl2").isContextLost()), false);
  await page.screenshot({ path: path.join(folder, "recovered.png") });
  await writeFile(path.join(folder, "results.json"), JSON.stringify({ intentionalContextLoss: true,
    alertShown: true, staleReadyCleared: true, reloadRecovered: true }, null, 2));
  console.log("Context loss alert, ready reset and reload recovery: passed");
} finally { await browser.close(); }
