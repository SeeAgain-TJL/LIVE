import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const folder='artifacts-local/pine-batch6/walk';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const result={browser:browser.version(),errors:[],legs:[]};
const read=()=>page.locator('canvas').evaluate(c=>({camera:JSON.parse(c.dataset.forestOriginMetrics).camera,stream:JSON.parse(c.dataset.forestStreaming)}));
page.on('pageerror',e=>result.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
try {
 const start=Date.now();
 await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3197')+'/forest-runtime-lab?scale=0.8');
 const canvas=page.locator('canvas[data-forest-origin-ready=true][data-pine-landmarks=ready]');
 await canvas.waitFor({timeout:120000});
 result.firstReadyMs=Date.now()-start;
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas').dataset.forestStreaming||'null');return s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
 result.firstSettledMs=Date.now()-start;
 result.initial=await read();
 await canvas.click({position:{x:720,y:450}});
 for(const [key,ms] of [['w',16000],['d',12000],['s',14000]]) {
  await page.evaluate(()=>{window.pineWalkFrames=[];window.pineWalkRunning=true;let last=performance.now();function tick(now){if(!window.pineWalkRunning)return;window.pineWalkFrames.push(now-last);last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);
  const frames=await page.evaluate(()=>{window.pineWalkRunning=false;return window.pineWalkFrames;});
  frames.sort((a,b)=>a-b);
  result.legs.push({key,ms,fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),p95Ms:frames[Math.floor(frames.length*.95)],...await read()});
  await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(1000,450,{steps:20});await page.mouse.up();
 }
 await page.waitForTimeout(9000);
 result.final=await read();
 result.contextLost=await canvas.evaluate(c=>c.getContext('webgl2').isContextLost());
 assert.equal(result.contextLost,false);
 assert.deepEqual(result.errors,[]);
 assert.ok(result.legs.some(l=>Math.hypot(l.camera[0]-result.initial.camera[0],l.camera[2]-result.initial.camera[2])>20));
 await page.screenshot({path:folder+'/end.png'});
 result.passed=true;
} finally {
 await browser.close();
 await writeFile(folder+'/results.json',JSON.stringify(result,null,2)+'\n');
}
