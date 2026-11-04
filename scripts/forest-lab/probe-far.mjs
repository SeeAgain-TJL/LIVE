import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR', String(e)));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE-ERROR', m.text()); });
const t0 = Date.now();
await page.goto('http://127.0.0.1:3000/forest-runtime-lab?scale=0.8&review=1&lod=far');
console.log('goto done', Date.now()-t0);
await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
console.log('canvas ready', Date.now()-t0);
await page.waitForTimeout(1500);
await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })),
  { position: [-70,2,19], direction: [0,-0.04,-1] });
console.log('camera set', Date.now()-t0);
await page.waitForTimeout(600);
console.log('about to screenshot', Date.now()-t0);
await page.screenshot({ path: 'artifacts-local/probe.png', timeout: 15000 });
console.log('screenshot done', Date.now()-t0);
await browser.close();
