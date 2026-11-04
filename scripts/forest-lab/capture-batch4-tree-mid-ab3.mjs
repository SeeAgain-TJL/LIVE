import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts-local/pine-batch4/tree-mid-ab3');
await mkdir(root, { recursive: true });
const url = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const errors = [];
const results = [];
const poses = [
  { name: '18m', position: [-70, 2, 19], direction: [0, -0.04, -1] },
  { name: '25m', position: [-70, 2, 26], direction: [0, -0.04, -1] },
  { name: '35m', position: [-70, 2, 36], direction: [0, -0.04, -1] },
];

async function readState(page) {
  return page.locator('canvas').evaluate(c => ({
    streaming: JSON.parse(c.dataset.forestStreaming || 'null'),
    metrics: JSON.parse(c.dataset.forestOriginMetrics || 'null'),
  }));
}

// Waits until the resident-tile count AND prop/tree counts stop changing for
// `stableForMs`, so we measure steady-state roam rather than mid-stream-in.
async function waitForSteady(page, { timeoutMs = 60000, stableForMs = 3000, pollMs = 500 } = {}) {
  const start = Date.now();
  let lastSignature = null;
  let stableSince = null;
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await readState(page);
    const tiles = last.streaming?.tiles?.length ?? -1;
    const trees = last.streaming?.trees ?? -1;
    const props = last.streaming?.props ?? -1;
    const signature = `${tiles}/${trees}/${props}`;
    if (signature === lastSignature) {
      if (stableSince === null) stableSince = Date.now();
      if (Date.now() - stableSince >= stableForMs) return { ...last, warmupMs: Date.now() - start, timedOut: false };
    } else {
      lastSignature = signature;
      stableSince = null;
    }
    await page.waitForTimeout(pollMs);
  }
  return { ...last, warmupMs: Date.now() - start, timedOut: true };
}

try {
  for (const mode of ['far-forced', 'real-mid']) {
    const lodParam = mode === 'far-forced' ? '&lod=far' : '';
    for (const pose of poses) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      page.on('pageerror', e => errors.push(`${mode}/${pose.name}: ${e}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${mode}/${pose.name}: ${m.text()}`); });
      await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=1${lodParam}`);
      await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
      await page.waitForTimeout(1500);
      await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })),
        { position: pose.position, direction: pose.direction });

      // First-load stutter: snapshot immediately after the camera cut, before any settling wait.
      await page.waitForTimeout(600);
      const firstLoad = await readState(page);
      await page.screenshot({ path: path.join(root, `${mode}-${pose.name}-firstload.png`), timeout: 60000 });

      // Steady state: wait for resident tile/tree/prop counts to stop changing.
      const settled = await waitForSteady(page);
      // Metrics window is a rolling ~1s sample updated every 1s; sample twice more to be safe.
      await page.waitForTimeout(1200);
      const steady1 = await readState(page);
      await page.waitForTimeout(1200);
      const steady2 = await readState(page);
      await page.screenshot({ path: path.join(root, `${mode}-${pose.name}-steady.png`), timeout: 60000 });

      results.push({ mode, pose: pose.name, firstLoad, settledWarmupMs: settled.warmupMs, settledTimedOut: settled.timedOut, steady1, steady2 });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(root, 'results.json'), JSON.stringify({ errors, results }, null, 2));
}
console.log(JSON.stringify({ errors, results }, null, 2));



