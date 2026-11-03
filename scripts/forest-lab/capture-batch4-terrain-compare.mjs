import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts-local/pine-batch4/terrain-compare');
await mkdir(root, { recursive: true });
const url = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const terrain of ['legacy', 'batch3b', 'layered']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${terrain}: ${e}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${terrain}: ${m.text()}`); });
    const terrainParam = terrain === 'layered' ? '' : `&terrain=${terrain}`;
    await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=terrain${terrainParam}`);
    await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
    if (terrain !== 'legacy') {
      const expected = terrain === 'batch3b' ? 'pbr' : 'layered';
      await page.locator(`canvas[data-pine-terrain=${expected}]`).waitFor({ timeout: 120000 });
    }
    // Fixed near-ground pose looking along the path, matching batch3b's terrain-only framing.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', {
      detail: { position: [23.155473709106445, 0.75, 47.55979919433594], direction: [0, 0, -1] },
    })));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(root, `${terrain}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(root, 'errors.json'), JSON.stringify(errors, null, 2));
}
console.log({ errors });
