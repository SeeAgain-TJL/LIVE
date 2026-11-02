import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion", "shader-diagnostics");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (let attempt = 0; attempt < 4; attempt += 1) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const issues = [];
  page.on("pageerror", error => issues.push({ type: "pageerror", detail: error.stack || error.message }));
  page.on("console", message => {
    if (message.type() === "error") issues.push({ type: "console", detail: message.text() });
  });
  page.on("requestfailed", request => issues.push({ type: "request", detail: `${request.url()} ${request.failure()?.errorText}` }));
  const started = Date.now();
  try {
    await page.goto("http://127.0.0.1:3310/forest-source-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("canvas[data-forest-ready='true']").waitFor({ timeout: 90000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(folder, `attempt-${attempt + 1}.png`) });
    const metrics = JSON.parse(await page.locator("canvas").getAttribute("data-forest-metrics") || "{}");
    results.push({ attempt: attempt + 1, elapsedMs: Date.now() - started, metrics, issues });
  } catch (error) {
    results.push({ attempt: attempt + 1, elapsedMs: Date.now() - started, failed: String(error), issues });
  }
  await context.close();
}
await browser.close();
await writeFile(path.join(folder, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
