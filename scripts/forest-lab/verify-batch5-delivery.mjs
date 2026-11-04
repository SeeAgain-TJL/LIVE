import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile,mkdir,writeFile,readdir,stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const base='artifacts-local/pine-batch5';const folder=path.resolve(base,'delivery-verification');await mkdir(folder,{recursive:true});
const assets=path.resolve(base,'remote-download/extracted/runtime');
const refusal=path.join(folder,'refusal');await mkdir(refusal,{recursive:true});
await writeFile(path.join(refusal,'terrain.glb'),'existing-content-must-survive');
const rejected=spawnSync(process.execPath,['scripts/forest-lab/transfer-batch4-assets.mjs','restore','--manifest','docs/reviews/pine-batch5/runtime-assets.json','--from',assets,'--to',refusal],{encoding:'utf8',windowsHide:true});
assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Refusing to overwrite different asset/);
assert.equal(await readFile(path.join(refusal,'terrain.glb'),'utf8'),'existing-content-must-survive');assert.deepEqual(await readdir(refusal),['terrain.glb']);
const summary=JSON.parse(await readFile('docs/reviews/pine-batch5/motion-summary.json','utf8'));
const videos={'/raw.webm':path.resolve(base,'sample-walk/continuous-movement.webm'),'/review.webm':path.resolve('docs/reviews/pine-batch5/continuous-walk-review.webm')};
const server=createServer(async(req,res)=>{
 const file=videos[req.url];if(!file){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><body><video muted controls></video></body></html>');return;}
 const data=await readFile(file),range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
 const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
 res.writeHead(range?206:200,{'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});res.end(data.subarray(start,end+1));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={assetSource:assets,source:'Downloaded GitHub runtime ZIP, SHA-256 checked, then extracted.',restoreRefusalPassed:true,errors:[],runtime:[],playback:[]};
try {
 for(const quality of ['low','high']) {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const requests=new Set();
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/forest-origin-assets/**',async route=>{
   const file=decodeURIComponent(new URL(route.request().url()).pathname.split('/forest-origin-assets/')[1]);
   const resolved=path.resolve(assets,file);assert.ok(resolved.startsWith(assets+path.sep));requests.add(file);
   if(!await stat(resolved).catch(()=>null)){report.errors.push('Missing transferred asset: '+file);await route.abort();return;}
   await route.fulfill({path:resolved});
  });
  const route=`/forest-runtime-lab?scale=0.8&sample=creek&review=1&quality=${quality}`;
  await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3331')+route);
  await page.locator('canvas[data-pine-review-pose-ready=true][data-pine-terrain=layered]').waitFor({timeout:120000});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail:{position:[-70,2,26],direction:[0,-.04,-1]}})));
  await page.waitForFunction(()=>{const c=document.querySelector('canvas'),s=JSON.parse(c?.dataset.forestStreaming||'null');return c?.dataset.forestOriginReady==='true'&&s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
  await page.waitForTimeout(2000);
  const state=await page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics),resources:JSON.parse(c.dataset.forestStreaming).resources}));
  assert.equal(state.metrics.contextLost,false);assert.equal(state.resources.includes('pine_04/mid'),quality==='high');
  for(const required of ['batch5/sample-terrain.glb','batch5/contact-ao.webp','batch5/collision-layout.json'])assert.ok(requests.has(required));
  report.runtime.push({quality,route,requests:[...requests].sort(),state});await page.close();
 }
 for(const file of Object.keys(videos)) {
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const playback=await page.evaluate(async({file,seconds})=>{
   const v=document.querySelector('video');v.src=file;
   await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(Error('Video metadata error'));});
   const metadata={duration:v.duration,width:v.videoWidth,height:v.videoHeight},seeks=[];
   for(const t of seconds){await new Promise((r,j)=>{v.onseeked=r;v.onerror=()=>j(Error('Seek/decode failed'));v.currentTime=t;});seeks.push({requested:t,actual:v.currentTime,readyState:v.readyState});}
   v.currentTime=20;await v.play();await new Promise(r=>setTimeout(r,800));v.pause();
   return {file,...metadata,seeks,playedTo:v.currentTime,error:v.error?.message||null};
  },{file,seconds:summary.review.seekSeconds});
  assert.ok(Math.abs(playback.duration-summary.review.duration)<.2);assert.ok(playback.playedTo>20.2);assert.equal(playback.error,null);
  assert.ok(playback.seeks.every(s=>Math.abs(s.actual-s.requested)<.1&&s.readyState>=2));report.playback.push(playback);await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
} finally {
 await browser.close();server.close();await writeFile('docs/reviews/pine-batch5/delivery-verification.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,runtime:report.runtime.map(r=>({quality:r.quality,requests:r.requests.length})),playback:report.playback},null,2));
