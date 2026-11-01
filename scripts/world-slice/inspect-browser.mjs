// Local visual inspection only: isolated Chrome context, never the user's browser profile.
// Run: node --experimental-strip-types scripts/world-slice/inspect-browser.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createSeed } from '../../src/data/seed.ts';

const out = 'artifacts-local/v4-2';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
const base = process.env.VISUAL_SLICE_URL ?? 'http://127.0.0.1:3301';
const seed = createSeed();
seed.planets = [{ ...seed.planets[1], id: 'slice-review', isDemo: false, name: '隔离视觉样板', appearance: { ...seed.planets[1].appearance, size: 1.55 }, position: [0, 1, 0] }];
await page.goto(base);
await page.evaluate(seed => localStorage.setItem('universe-of-me:data:v1', JSON.stringify(seed)), seed);
await page.goto(base + '/planet/slice-review');
await page.locator('.planet-world-canvas canvas[data-world-ready="true"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(2400);
console.log('metrics', await page.locator('.planet-world-canvas canvas').getAttribute('data-render-metrics'));
await page.screenshot({ path: `${out}/first-look.png` });
await browser.close();
