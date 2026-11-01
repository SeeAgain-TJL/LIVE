// Isolated visual/performance review. Never opens the user's Chrome profile.
// Usage: node --experimental-strip-types scripts/world-slice/review-r1.mjs baseline|after
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSeed } from '../../src/data/seed.ts';

const pass = process.argv[2] ?? 'after';
const out = `artifacts-local/v4-2-r1/${pass}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const diagnostics = { pageErrors: [], consoleErrors: [], failedResponses: [], requestsFailed: [] };
page.on('pageerror', error => diagnostics.pageErrors.push(error.stack ?? error.message));
page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push({ text: message.text(), location: message.location() }); });
page.on('response', response => { if (response.status() >= 400) diagnostics.failedResponses.push({ status: response.status(), url: response.url() }); });
page.on('requestfailed', request => diagnostics.requestsFailed.push({ url: request.url(), error: request.failure()?.errorText }));
const base = process.env.VISUAL_SLICE_URL ?? 'http://127.0.0.1:3301';
const seed = createSeed();
seed.planets = [{ ...seed.planets[1], id: 'coast-r1-review', isDemo: false, name: '隔离海岸审阅', appearance: { ...seed.planets[1].appearance, size: 1.55 }, position: [0, 1, 0] }];
await page.goto(base);
await page.evaluate(seed => localStorage.setItem('universe-of-me:data:v1', JSON.stringify(seed)), seed);
await page.goto(`${base}/planet/coast-r1-review`);
await page.locator('.planet-world-canvas canvas[data-world-ready="true"]').waitFor({ timeout: 60000 });
const canvas = page.locator('.planet-world-canvas canvas');
const metrics = {};
for (const quality of (pass === 'baseline' ? ['high', 'low'] : ['high', 'medium', 'low'])) {
  if (quality !== 'high') {
    await page.getByRole('button', { name: '世界设置与帮助' }).click();
    await page.getByLabel('世界渲染质量').selectOption(quality);
    await page.getByRole('button', { name: '关闭窗口' }).click();
    await page.locator('.planet-world-canvas canvas[data-world-ready="true"]').waitFor();
  }
  await page.waitForTimeout(2800);
  metrics[quality] = JSON.parse((await canvas.getAttribute('data-render-metrics')) ?? '{}');
  await page.screenshot({ path: `${out}/${quality}-arrival.png` });
}
await writeFile(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
await writeFile(`${out}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
console.log(JSON.stringify({ pass, metrics, diagnostics }, null, 2));
await context.close();
await browser.close();
