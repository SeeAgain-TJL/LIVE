import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve(process.env.PINE_EVIDENCE || 'artifacts-local/pine-batch3/motion');await mkdir(folder,{recursive:true});
const route=process.env.PINE_ROUTE || '/forest-runtime-lab';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,
  ...(process.env.PINE_VIDEO==='1' ? {recordVideo:{dir:folder,size:{width:1440,height:900}}}: {})});
const page=await context.newPage();
const diagnostic=process.env.PINE_PROFILE==='1';
const cdp=await context.newCDPSession(page);
if(diagnostic) {await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});}
const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED')) errors.push(r.url()+': '+r.failure()?.errorText);});
await page.addInitScript(()=>{
  window.__pineEvents=[];for(const type of ['webglcontextlost','webglcontextrestored','webglcontextcreationerror']) window.addEventListener(type,()=>window.__pineEvents.push({type,time:performance.now()}),true);
  // Any accidental archive access/write fails this isolated route test.
  window.__archiveAccess=[];
  for(const method of ['getItem','setItem','removeItem','clear']) {
    const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__archiveAccess.push({method,key:args[0]});return original.apply(this,args);};
  }
  const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__archiveAccess.push({method:'indexedDB.open',key:args[0]});return open(...args);};
});
if(diagnostic) await page.addInitScript(()=>{
  window.__gpuTimes=[];
  const clear=WebGL2RenderingContext.prototype.clear;
  let pending=[],active=false;
  WebGL2RenderingContext.prototype.clear=function(...args){
    const ext=this.getExtension('EXT_disjoint_timer_query_webgl2');
    if(ext && window.__collect && !active) {
      const disjoint=this.getParameter(ext.GPU_DISJOINT_EXT);
      pending=pending.filter(q=>{
        if(!this.getQueryParameter(q,this.QUERY_RESULT_AVAILABLE)) return true;
        if(!disjoint) window.__gpuTimes.push(this.getQueryParameter(q,this.QUERY_RESULT)/1e6);
        this.deleteQuery(q);return false;
      });
      if(pending.length<8) {
        const q=this.createQuery();this.beginQuery(ext.TIME_ELAPSED_EXT,q);active=true;
        queueMicrotask(()=>{this.endQuery(ext.TIME_ELAPSED_EXT);pending.push(q);active=false;});
      }
    }
    return clear.apply(this,args);
  };
  window.__uploads={calls:0,bytes:0,cpuMs:0};
  for(const method of ['bufferData','bufferSubData']) {
    const original=WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method]=function(...args){
      const start=performance.now();const result=original.apply(this,args);
      const data=args[method==='bufferData'?1:2];const length=args[4];
      window.__uploads.calls++;window.__uploads.bytes+=typeof data==='number'?data:(length || data?.length || 0)*(data?.BYTES_PER_ELEMENT || 1);
      window.__uploads.cpuMs+=performance.now()-start;return result;
    };
  }
  window.__longTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries()) window.__longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
});
const result={route,diagnostic,errors,stages:[]};
const started=Date.now();
const read=()=>page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics || 'null'),streaming:JSON.parse(c.dataset.forestStreaming || 'null')}));
async function segment(name,seconds,action,cleanup) {
  if(diagnostic) await cdp.send('Profiler.start');
  const uploadStart=diagnostic ? await page.evaluate(()=>({...window.__uploads})):null;
  await page.evaluate(()=>{window.__frames=[];window.__gpuTimes=[];window.__collect=true;let last=performance.now();function next(now){if(!window.__collect) return;window.__frames.push(now-last);last=now;requestAnimationFrame(next);}requestAnimationFrame(next);});
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
    callsRange:[Math.min(...samples.map(s=>s.metrics.calls)),Math.max(...samples.map(s=>s.metrics.calls))],samples,frameIntervals:frames};
  if(diagnostic) {
    const {profile}=await cdp.send('Profiler.stop');await writeFile(path.join(folder,name+'.cpuprofile'),JSON.stringify(profile));
    const uploads=await page.evaluate(()=>({...window.__uploads}));summary.uploads=Object.fromEntries(Object.keys(uploads).map(k=>[k,uploads[k]-uploadStart[k]]));
    const nodes=new Map(profile.nodes.map(n=>[n.id,n]));const self=new Map();
    for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]);const key=n.callFrame.functionName+' @ '+n.callFrame.url+':'+n.callFrame.lineNumber;self.set(key,(self.get(key)||0)+profile.timeDeltas[i]/1000);}
    summary.cpuSelfMs=[...self].sort((a,b)=>b[1]-a[1]).slice(0,35);
    const gpu=await page.evaluate(()=>window.__gpuTimes);gpu.sort((a,b)=>a-b);
    summary.gpu={samples:gpu.length,medianMs:gpu[Math.floor(gpu.length/2)],p95Ms:gpu[Math.floor(gpu.length*.95)]};
  }
  result.stages.push(summary);
  await page.screenshot({path:path.join(folder,`${name}.png`)});
  await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...summary,samples:undefined,frameIntervals:undefined}));
}
try {
  await page.goto((process.env.FOREST_LAB_URL || 'http://127.0.0.1:3310')+route,{waitUntil:'domcontentloaded'});
  await page.locator('canvas[data-forest-origin-ready=true]').waitFor({timeout:120000});result.firstForestMs=Date.now()-started;
  await page.waitForFunction(()=>{const c=document.querySelector('canvas');const s=JSON.parse(c?.dataset.forestStreaming || 'null');return s && s.trees>0 && s.props>0 && !s.pendingTiles.length && !s.pendingResources.length && !s.queued;},null,{timeout:120000});
  result.settledMs=Date.now()-started;await page.waitForTimeout(2500);
  result.renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);});
  result.canvasSize=await page.locator('canvas').evaluate(c=>({internal:[c.width,c.height],css:[c.clientWidth,c.clientHeight],devicePixelRatio:window.devicePixelRatio}));
  result.gpuTimerSupported=await page.evaluate(()=>!!document.querySelector('canvas').getContext('webgl2').getExtension('EXT_disjoint_timer_query_webgl2'));
  await page.locator('canvas').click({position:{x:720,y:450}});
  await segment('near-static',10);
  await segment('walk-forward',14,()=>page.keyboard.down('w'),()=>page.keyboard.up('w'));
  await segment('walk-diagonal',10,async()=>{await page.keyboard.down('w');await page.keyboard.down('a');},async()=>{await page.keyboard.up('w');await page.keyboard.up('a');});
  await segment('turn-and-walk',14,async()=>{await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(1130,410,{steps:36});await page.mouse.up();await page.keyboard.down('w');},()=>page.keyboard.up('w'));
  await segment('mid-static-release',16);
  await segment('continuous-turn',6,async()=>{await page.mouse.move(420,450);await page.mouse.down();await page.mouse.move(1120,375,{steps:100});await page.mouse.up();});
  await segment('far-static',10);
  // Retrace actual input through resident and previously released partitions.
  await page.mouse.move(1120,375);await page.mouse.down();await page.mouse.move(420,450,{steps:100});await page.mouse.up();
  await segment('walk-return',14,()=>page.keyboard.down('s'),()=>page.keyboard.up('s'));
  await page.mouse.move(1130,410);await page.mouse.down();await page.mouse.move(720,450,{steps:36});await page.mouse.up();
  await segment('diagonal-return',10,async()=>{await page.keyboard.down('s');await page.keyboard.down('d');},async()=>{await page.keyboard.up('s');await page.keyboard.up('d');});
  await segment('dense-return',14,()=>page.keyboard.down('s'),()=>page.keyboard.up('s'));
  result.final=await read();result.contextEvents=await page.evaluate(()=>window.__pineEvents);
  result.archiveAccess=await page.evaluate(()=>window.__archiveAccess);
  if(diagnostic) result.longTasks=await page.evaluate(()=>window.__longTasks);
  result.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('forest-origin-assets')).map(r=>({name:r.name.split('/forest-origin-assets/')[1],encoded:r.encodedBodySize,transfer:r.transferSize,duration:r.duration})));
  result.resourceBytes=result.resources.reduce((s,r)=>s+r.encoded,0);
  result.released=result.final.streaming.released;
  const moving=result.stages.filter(s=>['walk-forward','walk-diagonal','turn-and-walk','continuous-turn','walk-return','diagonal-return','dense-return'].includes(s.name));
  const frames=moving.flatMap(s=>s.frameIntervals).sort((a,b)=>a-b);
  result.motion={seconds:frames.reduce((s,x)=>s+x,0)/1000,frames:frames.length,averageFps:1000*frames.length/frames.reduce((s,x)=>s+x,0),p95Ms:frames[Math.floor(frames.length*.95)],p99Ms:frames[Math.floor(frames.length*.99)],over100ms:frames.filter(x=>x>100).length};
  result.returnDistanceFromStart=Math.hypot(result.final.metrics.camera[0]-result.stages[0].samples[0].metrics.camera[0],result.final.metrics.camera[2]-result.stages[0].samples[0].metrics.camera[2]);
  result.qualityTargetMet=moving.every(s=>s.averageFps>=30 && s.p95Ms<=40);
  assert.equal(errors.length,0,'Browser errors');assert.equal(result.contextEvents.length,0,'Context events');
  assert.equal(result.archiveAccess.length,0,'Lab touched archive storage');
  assert.ok(result.released.resources>0,'No LOD resource release observed');
  assert.ok(result.released.tiles>0,'No tile release observed');
  const beginning=result.stages[0].samples[0].metrics.camera;const ending=result.stages.find(s=>s.name==='walk-diagonal').samples.at(-1).metrics.camera;
  assert.ok(Math.hypot(beginning[0]-ending[0],beginning[2]-ending[2])>20,'Movement did not cross the representative area');
  result.passed=true;
} catch(error) {result.failed=String(error);result.final=await read().catch(()=>null);await page.screenshot({path:path.join(folder,'failed.png')}).catch(()=>{});}
await page.close();const video=await page.video()?.path();await context.close();await browser.close();
if(video) await copyFile(video,path.join(folder,'continuous-movement.webm'));
await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({firstForestMs:result.firstForestMs,settledMs:result.settledMs,renderer:result.renderer,released:result.released,errors,failed:result.failed,resourceBytes:result.resourceBytes}));
if(!result.passed) process.exitCode=1;
