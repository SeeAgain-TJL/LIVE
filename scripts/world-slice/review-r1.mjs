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
const metrics = {}, samples = {};
for (const quality of (pass === 'baseline' ? ['high', 'low'] : ['high', 'medium', 'low'])) {
  if (quality !== 'high') {
    await page.getByRole('button', { name: '世界设置与帮助' }).click();
    await page.getByLabel('世界渲染质量').selectOption(quality);
    await page.getByRole('button', { name: '关闭窗口' }).click();
    await page.locator('.planet-world-canvas canvas[data-world-ready="true"]').waitFor();
  }
  await page.waitForTimeout(1800);
  samples[quality] = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1100);
    samples[quality].push(JSON.parse((await canvas.getAttribute('data-render-metrics')) ?? '{}'));
  }
  const middle = [...samples[quality]].sort((a, b) => a.meanMs - b.meanMs)[2];
  metrics[quality] = middle;
  await page.screenshot({ path: `${out}/${quality}-arrival.png` });
}
if (pass !== 'baseline') {
  await page.getByRole('button', { name: '世界设置与帮助' }).click();
  await page.getByLabel('世界渲染质量').selectOption('high');
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await page.waitForTimeout(1200);
  await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(1040, 460, { steps: 35 }); await page.mouse.up();
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/coast-forest.png` });
  await page.mouse.move(800, 440); await page.mouse.down(); await page.mouse.move(300, 450, { steps: 40 }); await page.mouse.up();
  await page.waitForTimeout(600); await page.screenshot({ path: `${out}/coast-water.png` });
  await page.mouse.move(850, 460); await page.mouse.wheel(0, -540);
  await page.waitForTimeout(650); await page.screenshot({ path: `${out}/coast-near.png` });
}
await writeFile(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
await writeFile(`${out}/samples.json`, JSON.stringify(samples, null, 2));
await writeFile(`${out}/diagnostics.json`, JSON.stringify(diagnostics, null, 2));
await writeFile(`${out}/device.json`, JSON.stringify(await page.evaluate(() => {
  const gl = document.querySelector('.planet-world-canvas canvas')?.getContext('webgl2');
  const extension = gl?.getExtension('WEBGL_debug_renderer_info');
  return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory,
    renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    assets: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/world-slice/')).map(entry => ({ name: entry.name.split('/').pop(), transfer: entry.transferSize, decoded: entry.decodedBodySize })) };
}), null, 2));
console.log(JSON.stringify({ pass, metrics, diagnostics }, null, 2));
await context.close();
if (pass !== 'baseline') console.log(`Coast exploration recording: ${await page.video().path()}`);
await browser.close();
