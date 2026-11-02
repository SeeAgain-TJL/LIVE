import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-evidence");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const tier of ["low", "medium", "high"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const start = Date.now();
  await page.goto("http://127.0.0.1:3311/forest-lab", { waitUntil: "domcontentloaded" });
  if (tier !== "medium") await page.getByRole("button", { name: tier === "low" ? "低" : "高", exact: true }).click();
  await page.locator("canvas[data-forest-ready='true']").waitFor({ timeout: 120000 });
  const loadedMs = Date.now() - start;
  await page.waitForTimeout(6000);
  const metrics = JSON.parse(await page.locator("canvas").getAttribute("data-forest-metrics") || "{}");
  await page.locator(".forest-lab-bar").evaluate(element => { element.style.display = "none"; });
  await page.screenshot({ path: path.join(folder, `production-${tier}-same-camera.png`) });
  results.push({ tier, loadedMs, metrics, errors });
  await context.close();
}
await browser.close();
await writeFile(path.join(folder, "quality-production.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
