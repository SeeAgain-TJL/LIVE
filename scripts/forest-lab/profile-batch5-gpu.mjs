// Actual WebGL GPU elapsed-time queries; explicit review poses for static views.
// This is separate from the unmodified-input Walker recordings.
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder='artifacts-local/pine-batch5/final-gpu';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
const result={route:'/forest-runtime-lab?scale=0.8&sample=creek&review=1',diagnostic:true,browser:browser.version(),errors:[],stages:[]};
page.on('pageerror',e=>result.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
await page.addInitScript(()=>{
 window.__gpu=[];window.__disjoint=0;window.__collect=false;window.__uploads={calls:0,bytes:0,cpuMs:0};window.__longTasks=[];
 new PerformanceObserver(l=>{for(const x of l.getEntries())window.__longTasks.push({start:x.startTime,duration:x.duration});}).observe({type:'longtask',buffered:true});
 const clear=WebGL2RenderingContext.prototype.clear;let pending=[],active=false;
 WebGL2RenderingContext.prototype.clear=function(...args){
  const ext=this.getExtension('EXT_disjoint_timer_query_webgl2');
  if(ext&&!active) {
   if(this.getParameter(ext.GPU_DISJOINT_EXT)){window.__disjoint++;for(const q of pending)this.deleteQuery(q);pending=[];}
   pending=pending.filter(q=>{if(!this.getQueryParameter(q,this.QUERY_RESULT_AVAILABLE))return true;const ms=this.getQueryParameter(q,this.QUERY_RESULT)/1e6;if(window.__collect)window.__gpu.push(ms);this.deleteQuery(q);return false;});
   if(window.__collect&&pending.length<8){const q=this.createQuery();this.beginQuery(ext.TIME_ELAPSED_EXT,q);active=true;queueMicrotask(()=>{this.endQuery(ext.TIME_ELAPSED_EXT);pending.push(q);active=false;});}
  }
  return clear.apply(this,args);
 };
 for(const method of ['bufferData','bufferSubData']){const old=WebGL2RenderingContext.prototype[method];WebGL2RenderingContext.prototype[method]=function(...a){const start=performance.now(),r=old.apply(this,a),v=a[method==='bufferData'?1:2];window.__uploads.calls++;window.__uploads.bytes+=typeof v==='number'?v:(a[4]||v?.length||0)*(v?.BYTES_PER_ELEMENT||1);window.__uploads.cpuMs+=performance.now()-start;return r;};}
});
const poses={near:{position:[23.155473709106445,.9223032593727112,47.55979919433594],direction:[-.9821439487,.1260486988,-.1396602648]},mid:{position:[0,3,43],direction:[0,-.08,-1]},far:{position:[10,18,60],direction:[.1,-.5,-1]}};
try {
 await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3331')+result.route);
 await page.locator('canvas[data-pine-review-pose-ready=true][data-pine-terrain=layered]').waitFor({timeout:120000});
 result.renderer=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e.UNMASKED_RENDERER_WEBGL);});
 result.canvasSize=await page.locator('canvas').evaluate(c=>({internal:[c.width,c.height],css:[c.clientWidth,c.clientHeight],devicePixelRatio:devicePixelRatio}));
 result.gpuTimerSupported=await page.evaluate(()=>!!document.querySelector('canvas').getContext('webgl2').getExtension('EXT_disjoint_timer_query_webgl2'));assert.ok(result.gpuTimerSupported);
 for(const [name,pose] of Object.entries(poses)) {
  const before=await page.evaluate(()=>({...window.__uploads}));await cdp.send('Profiler.start');const start=Date.now();
  await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail})),pose);
  await page.waitForFunction(()=>{const c=document.querySelector('canvas'),s=JSON.parse(c?.dataset.forestStreaming||'null');return c?.dataset.forestOriginReady==='true'&&s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
  const settleMs=Date.now()-start;await page.waitForTimeout(3500);
  await page.evaluate(()=>{window.__gpu=[];window.__frames=[];window.__collect=true;let last=performance.now();function next(now){if(!window.__collect)return;window.__frames.push(now-last);last=now;requestAnimationFrame(next);}requestAnimationFrame(next);});
  const samples=[];for(let i=0;i<10;i++){await page.waitForTimeout(1000);samples.push(await page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics),streaming:JSON.parse(c.dataset.forestStreaming)})));}
  const data=await page.evaluate(()=>{window.__collect=false;return {gpu:window.__gpu,frames:window.__frames,uploads:window.__uploads,disjoint:window.__disjoint};});
  const {profile}=await cdp.send('Profiler.stop');await writeFile(`${folder}/${name}.cpuprofile`,JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
  for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),key=n.callFrame.functionName+' @ '+n.callFrame.url+':'+n.callFrame.lineNumber;self.set(key,(self.get(key)||0)+profile.timeDeltas[i]/1000);}
  data.gpu.sort((a,b)=>a-b);data.frames.sort((a,b)=>a-b);assert.ok(data.gpu.length>20);assert.equal(data.disjoint,0);
  result.stages.push({name,pose,settleMs,averageFps:data.frames.length*1000/data.frames.reduce((s,x)=>s+x,0),p95Ms:data.frames[Math.floor(data.frames.length*.95)],p99Ms:data.frames[Math.floor(data.frames.length*.99)],gpu:{samples:data.gpu.length,medianMs:data.gpu[Math.floor(data.gpu.length/2)],p95Ms:data.gpu[Math.floor(data.gpu.length*.95)],disjointEvents:data.disjoint},uploads:Object.fromEntries(Object.keys(before).map(k=>[k,data.uploads[k]-before[k]])),cpuSelfMs:[...self].sort((a,b)=>b[1]-a[1]).slice(0,20),samples,trianglesRange:[Math.min(...samples.map(s=>s.metrics.triangles)),Math.max(...samples.map(s=>s.metrics.triangles))],callsRange:[Math.min(...samples.map(s=>s.metrics.calls)),Math.max(...samples.map(s=>s.metrics.calls))]});
  console.log(JSON.stringify({name,gpu:result.stages.at(-1).gpu,settleMs}));
 }
 assert.deepEqual(result.errors,[]);result.longTasks=await page.evaluate(()=>window.__longTasks);result.passed=true;
} finally {await browser.close();await writeFile(folder+'/results.json',JSON.stringify(result,null,2)+'\n');}
