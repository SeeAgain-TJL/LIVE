import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'artifacts-local/v4-2-r2/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const diagnostics = { pageErrors: [], consoleErrors: [], failedResponses: [] };
page.on('pageerror', e => diagnostics.pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') diagnostics.consoleErrors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) diagnostics.failedResponses.push({ status: r.status(), url: r.url() }); });
await page.goto('http://127.0.0.1:3301/coast-lab');
const canvas = page.locator('canvas');
await page.waitForFunction(() => !!document.querySelector('canvas[data-render-metrics]'), { timeout: 60000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/fixed-view.png` });
const metrics = [];
for (let i = 0; i < 5; i++) { await page.waitForTimeout(1100); metrics.push(JSON.parse((await canvas.getAttribute('data-render-metrics')) ?? '{}')); }
const bounds = await canvas.boundingBox();
await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .69, bounds.y + bounds.height * .51, { steps: 35 }); await page.mouse.up();
await page.waitForTimeout(700); await page.screenshot({ path: `${out}/lateral-view.png` });
await canvas.focus(); await page.keyboard.down('w'); await page.waitForTimeout(1700); await page.keyboard.up('w');
await page.waitForTimeout(500); await page.screenshot({ path: `${out}/walk-view.png` });
const device = await page.evaluate(() => {
  const gl = document.querySelector('canvas')?.getContext('webgl2'); const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    resources: performance.getEntriesByType('resource').filter(e => e.name.includes('/world-slice/')).map(e => ({ file: e.name.split('/').pop(), bytes: e.transferSize })) };
});
await writeFile(`${out}/measurements.json`, JSON.stringify({ metrics, device, diagnostics }, null, 2));
console.log(JSON.stringify({ metrics, device, diagnostics }, null, 2));
await context.close(); await browser.close();
