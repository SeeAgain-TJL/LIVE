import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.PINE_EVIDENCE || 'artifacts-local/pine-batch5/startup';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const result={errors:[]};
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>result.errors.push(String(e)));
  let release;const barrier=new Promise(r=>release=r);
  await page.route('**/batch4/terrain/blend-masks.webp',async route=>{await barrier;await route.continue();});
  await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3318')+(process.env.PINE_ROUTE || '/forest-runtime-lab?scale=0.8'));
  await page.locator('canvas[data-pine-terrain=loading]').waitFor({timeout:120000});
  await page.waitForTimeout(1500);
  result.blocked=await page.locator('canvas').evaluate(c=>({...c.dataset}));
  assert.equal(result.blocked.forestStreaming,undefined,'Vegetation started before surface');
  assert.equal(result.blocked.forestGeometryReady,undefined);
  assert.equal(result.blocked.forestOriginReady,undefined);
  await page.screenshot({path:out+'/waiting-for-ground.png'});
  release();
  await page.locator('canvas[data-pine-terrain=layered][data-forest-origin-ready=true]').waitFor({timeout:120000});
  result.ready=await page.locator('canvas').evaluate(c=>({...c.dataset}));
  await page.screenshot({path:out+'/ground-and-trees.png'});
  assert.equal(result.ready.forestStreamingRuntime,'true');assert.deepEqual(result.errors,[]);result.passed=true;
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify(result,null,2));}
console.log({passed:result.passed});
