// All navigation goes through real mouse drags and WASD. No camera assignments.
import { chromium } from 'playwright';
import { mkdir,writeFile,copyFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder='artifacts-local/pine-batch5/sample-walk';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:folder,size:{width:1440,height:900}}});
const page=await context.newPage();const report={method:'Continuous real mouse drag / W and D; adaptive headings read diagnostic position only. No review parameter or pose events.',errors:[],samples:[],goals:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.addInitScript(()=>{
 window.__events=[];window.__archive=[];
 for(const t of ['webglcontextlost','webglcontextcreationerror'])window.addEventListener(t,()=>window.__events.push(t),true);
 for(const method of ['getItem','setItem','removeItem','clear']){const old=Storage.prototype[method];Storage.prototype[method]=function(...a){window.__archive.push({method,key:a[0]});return old.apply(this,a);};}
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...a)=>{window.__archive.push({method:'indexedDB.open'});return open(...a);};
});
const read=()=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.forestOriginMetrics));
const start=Date.now();
try {
 await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3331')+'/forest-runtime-lab?scale=0.8&sample=creek');
 await page.locator('canvas[data-forest-origin-ready=true][data-pine-terrain=layered]').waitFor({timeout:120000});
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas').dataset.forestStreaming||'null');return s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
 await page.locator('canvas').click({position:{x:720,y:450}});await page.waitForTimeout(2000);
 await page.evaluate(()=>{window.__frames=[];window.__run=true;let last=performance.now();function next(now){if(!window.__run)return;window.__frames.push(now-last);last=now;requestAnimationFrame(next);}requestAnimationFrame(next);});
 const initial=await read();report.initial=initial;let previous=initial.camera;let stuck=0;
 const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
 for(const target of [[5,43],[-18,34],[-25,62],[0,67],[20,60],[23,47]]) {
  const deadline=Date.now()+18000;let reached=false;
  await page.keyboard.down('w');
  while(Date.now()<deadline) {
   const state=await read(),p=state.camera,d=state.direction;
   report.samples.push({seconds:(Date.now()-start)/1000,...state});
   const dx=target[0]-p[0],dz=target[1]-p[2];
   if(Math.hypot(dx,dz)<3){reached=true;break;}
   const turn=Math.max(-.7,Math.min(.7,wrap(Math.atan2(-dx,-dz)-Math.atan2(-d[0],-d[2]))));
   const pitch=Math.asin(Math.max(-1,Math.min(1,d[1])));
   await page.mouse.move(720,450);await page.mouse.down();
   await page.mouse.move(720-turn/.0025,450+(pitch+.08)/.0025,{steps:18});await page.mouse.up();
   const moved=Math.hypot(p[0]-previous[0],p[2]-previous[2]);stuck=moved<.3?stuck+1:0;previous=p;
   if(stuck>=2){await page.keyboard.down('d');await page.waitForTimeout(1100);await page.keyboard.up('d');stuck=0;}
   await page.waitForTimeout(950);
  }
  await page.keyboard.up('w');report.goals.push({target,reached,actual:(await read()).camera});await page.waitForTimeout(1400);
 }
 await page.waitForTimeout(2000);report.final=await read();
 report.frameIntervals=await page.evaluate(()=>{window.__run=false;return window.__frames;});
 const f=[...report.frameIntervals].sort((a,b)=>a-b);
 report.recordedExploration={seconds:f.reduce((s,x)=>s+x,0)/1000,averageFps:f.length*1000/f.reduce((s,x)=>s+x,0),p95Ms:f[Math.floor(f.length*.95)],p99Ms:f[Math.floor(f.length*.99)]};
 report.contextEvents=await page.evaluate(()=>window.__events);report.archiveAccess=await page.evaluate(()=>window.__archive);
 report.travelledSampleDistance=report.samples.slice(1).reduce((s,x,i)=>s+Math.hypot(x.camera[0]-report.samples[i].camera[0],x.camera[2]-report.samples[i].camera[2]),0);
 report.stayedInCore=report.samples.every(s=>s.camera[0]>-40&&s.camera[0]<40&&s.camera[2]>15&&s.camera[2]<75);
 assert.ok(report.travelledSampleDistance>80,'Insufficient genuine exploration');assert.ok(report.stayedInCore);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.contextEvents,[]);assert.deepEqual(report.archiveAccess,[]);
 report.passed=true;
} catch(e){report.failed=String(e);process.exitCode=1;}
await page.close();const video=await page.video().path();await context.close();await browser.close();
await copyFile(video,folder+'/continuous-movement.webm');
await writeFile(folder+'/results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,samples:undefined,frameIntervals:undefined},null,2));
