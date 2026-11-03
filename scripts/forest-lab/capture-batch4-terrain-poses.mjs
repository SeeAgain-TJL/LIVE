import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts-local/pine-batch4/terrain-compare');
await mkdir(root, { recursive: true });
const url = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const poses = [
  { name: 'layered-path-close', position: [0, 3.5, 10], direction: [0, -0.3, -1] },
  { name: 'layered-overview', position: [10, 18, 60], direction: [0.1, -0.5, -1] },
];
try {
  for (const pose of poses) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${pose.name}: ${e}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${pose.name}: ${m.text()}`); });
    await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=terrain`);
    await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
    await page.locator('canvas[data-pine-terrain=layered]').waitFor({ timeout: 120000 });
    await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })),
      { position: pose.position, direction: pose.direction });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(root, `${pose.name}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(root, 'errors2.json'), JSON.stringify(errors, null, 2));
}
console.log({ errors });
