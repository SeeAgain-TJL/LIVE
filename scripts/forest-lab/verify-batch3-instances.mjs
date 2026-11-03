import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve('artifacts-local/pine-batch3/instance-audit');await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];const samples=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.stack));page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3310')+'/forest-runtime-lab?audit=1');
  await page.locator('canvas[data-forest-origin-ready=true]').waitFor({timeout:120000});
  const read=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.forestStreaming));
  await page.waitForTimeout(4000);samples.push(await read());
  await page.locator('canvas').click({position:{x:720,y:450}});
  for(const keys of [['w'],['w','a'],['s','d'],['s']]) {
    for(const key of keys) await page.keyboard.down(key);
    for(let second=0;second<7;second++) {await page.waitForTimeout(1000);samples.push(await read());}
    for(const key of keys) await page.keyboard.up(key);
  }
  await page.mouse.move(420,450);await page.mouse.down();await page.mouse.move(1120,450,{steps:80});await page.mouse.up();
  await page.waitForTimeout(4000);samples.push(await read());
  const audit=samples.at(-1).audit;
  assert.equal(errors.length,0);assert.ok(audit.matrices>10000);assert.ok(audit.updates>10);assert.ok(audit.maxError<0.00005);
  assert.ok(samples.some(s=>s.timings.matrixWrites>0));
  // A separate action check, outside all performance sampling.
  await page.getByLabel('森林资源精度').selectOption('high');
  await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.forestStreaming||'null');return s && s.trees>0 && s.props>0 && !s.pendingResources.length && !s.queued;},null,{timeout:120000});
  await page.waitForTimeout(2000);
  const alerts=await page.locator('[role=alert]:visible').allTextContents();console.log('QUALITY ALERTS',alerts);
  await page.screenshot({path:path.join(folder,'quality-switch.png')});
  assert.equal(alerts.filter(text=>text.trim()).length,0,alerts.join('\n'));
  await page.getByLabel('森林资源精度').selectOption('low');
  await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.forestStreaming||'null');return s && s.trees>0 && s.props>0 && !s.pendingResources.length && !s.queued;},null,{timeout:120000});
  await page.waitForTimeout(2000);
  assert.deepEqual((await page.locator('[role=alert]:visible').allTextContents()).filter(text=>text.trim()),[]);assert.equal(errors.length,0);
  await writeFile(path.join(folder,'results.json'),JSON.stringify({passed:true,audit,errors,samples,qualitySwitch:'low→high→low completed'},null,2));
  console.log({passed:true,audit});
} catch(error) {await writeFile(path.join(folder,'failed.json'),JSON.stringify({error:String(error),errors,samples},null,2));throw error;}
finally {await browser.close();}
