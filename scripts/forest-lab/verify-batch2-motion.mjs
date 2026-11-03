import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve(process.env.PINE_EVIDENCE || 'artifacts-local/pine-batch2/motion');await mkdir(folder,{recursive:true});
const route=process.env.PINE_ROUTE || '/forest-runtime-lab';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,
  ...(process.env.PINE_VIDEO==='1' ? {recordVideo:{dir:folder,size:{width:1440,height:900}}}: {})});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED')) errors.push(r.url()+': '+r.failure()?.errorText);});
await page.addInitScript(()=>{
  window.__pineEvents=[];for(const type of ['webglcontextlost','webglcontextrestored','webglcontextcreationerror']) window.addEventListener(type,()=>window.__pineEvents.push({type,time:performance.now()}),true);
  // Any accidental archive access/write fails this isolated route test.
  window.__archiveAccess=[];
  for(const method of ['getItem','setItem','removeItem','clear']) {
    const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__archiveAccess.push({method,key:args[0]});return original.apply(this,args);};
  }
});
const result={route,errors,stages:[]};
const started=Date.now();
const read=()=>page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics || 'null'),streaming:JSON.parse(c.dataset.forestStreaming || 'null')}));
async function segment(name,seconds,action,cleanup) {
  await page.evaluate(()=>{window.__frames=[];window.__collect=true;let last=performance.now();function next(now){if(!window.__collect) return;window.__frames.push(now-last);last=now;requestAnimationFrame(next);}requestAnimationFrame(next);});
  if(action) await action();
  const samples=[];
  for(let i=0;i<seconds;i++){await page.waitForTimeout(1000);samples.push(await read());}
  if(cleanup) await cleanup();
  const frames=await page.evaluate(()=>{window.__collect=false;return window.__frames;});
  const sorted=[...frames].sort((a,b)=>a-b);
  const summary={name,seconds:frames.reduce((s,x)=>s+x,0)/1000,frames:frames.length,
    averageFps:1000*frames.length/frames.reduce((s,x)=>s+x,0),medianFps:1000/sorted[Math.floor(sorted.length/2)],
    p95Ms:sorted[Math.floor(sorted.length*0.95)],p99Ms:sorted[Math.floor(sorted.length*0.99)],maxMs:Math.max(...frames),over100ms:frames.filter(x=>x>100).length,
    trianglesRange:[Math.min(...samples.map(s=>s.metrics.triangles)),Math.max(...samples.map(s=>s.metrics.triangles))],
    callsRange:[Math.min(...samples.map(s=>s.metrics.calls)),Math.max(...samples.map(s=>s.metrics.calls))],samples};
  result.stages.push(summary);
  await page.screenshot({path:path.join(folder,`${name}.png`)});
  await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...summary,samples:undefined}));
}
try {
  await page.goto((process.env.FOREST_LAB_URL || 'http://127.0.0.1:3310')+route,{waitUntil:'domcontentloaded'});
  await page.locator('canvas[data-forest-origin-ready=true]').waitFor({timeout:120000});result.firstForestMs=Date.now()-started;
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');const s=JSON.parse(c?.dataset.forestStreaming || 'null');return s && s.trees>0 && s.props>0 && !s.pendingTiles.length && !s.pendingResources.length && !s.queued;},null,{timeout:120000});
  result.settledMs=Date.now()-started;await page.waitForTimeout(2500);
  result.renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);});
  result.canvasSize=await page.locator('canvas').evaluate(c=>({internal:[c.width,c.height],css:[c.clientWidth,c.clientHeight],devicePixelRatio:window.devicePixelRatio}));
  await page.locator('canvas').click({position:{x:720,y:450}});
  await segment('near-static',10);
  await segment('walk-forward',14,()=>page.keyboard.down('w'),()=>page.keyboard.up('w'));
  await segment('walk-diagonal',10,async()=>{await page.keyboard.down('w');await page.keyboard.down('a');},async()=>{await page.keyboard.up('w');await page.keyboard.up('a');});
  await segment('turn-and-walk',14,async()=>{await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(1130,410,{steps:36});await page.mouse.up();await page.keyboard.down('w');},()=>page.keyboard.up('w'));
  await segment('mid-static-release',16);
  await segment('continuous-turn',6,async()=>{await page.mouse.move(420,450);await page.mouse.down();await page.mouse.move(1120,375,{steps:100});await page.mouse.up();});
  await segment('far-static',10);
  result.final=await read();result.contextEvents=await page.evaluate(()=>window.__pineEvents);
  result.archiveAccess=await page.evaluate(()=>window.__archiveAccess);
  result.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('forest-origin-assets')).map(r=>({name:r.name.split('/forest-origin-assets/')[1],encoded:r.encodedBodySize,transfer:r.transferSize,duration:r.duration})));
  result.resourceBytes=result.resources.reduce((s,r)=>s+r.encoded,0);
  result.released=result.final.streaming.released;
  assert.equal(errors.length,0,'Browser errors');assert.equal(result.contextEvents.length,0,'Context events');
  assert.equal(result.archiveAccess.length,0,'Lab touched archive storage');
  assert.ok(result.released.resources>0,'No LOD resource release observed');
  assert.ok(result.released.tiles>0,'No tile release observed');
  const beginning=result.stages[0].samples[0].metrics.camera;const ending=result.final.metrics.camera;
  assert.ok(Math.hypot(beginning[0]-ending[0],beginning[2]-ending[2])>20,'Movement did not cross the representative area');
  result.passed=true;
} catch(error) {result.failed=String(error);result.final=await read().catch(()=>null);await page.screenshot({path:path.join(folder,'failed.png')}).catch(()=>{});}
await page.close();const video=await page.video()?.path();await context.close();await browser.close();
if(video) await copyFile(video,path.join(folder,'continuous-movement.webm'));
await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({firstForestMs:result.firstForestMs,settledMs:result.settledMs,renderer:result.renderer,released:result.released,errors,failed:result.failed,resourceBytes:result.resourceBytes}));
if(!result.passed) process.exitCode=1;
