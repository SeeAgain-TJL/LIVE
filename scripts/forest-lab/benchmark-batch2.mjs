import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve(process.env.PINE_EVIDENCE || 'artifacts-local/pine-batch2/experiments');
await mkdir(folder,{recursive:true});
const routes = JSON.parse(process.env.PINE_ROUTES || '["/forest-origin-lab?trees=170&props=18000&radius=65&audit=1","/forest-origin-lab?trees=170&props=18000&radius=65&alpha=single","/forest-origin-lab?trees=170&props=18000&radius=65&alpha=mask"]');
const results=[];
for (const [i,route] of routes.entries()) {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,
    ...(process.env.PINE_VIDEO ? {recordVideo:{dir:folder,size:{width:1440,height:900}}} : {})});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.addInitScript(()=>{
    window.__contextEvents=[];
    for(const type of ['webglcontextlost','webglcontextrestored','webglcontextcreationerror']) window.addEventListener(type,()=>window.__contextEvents.push({type,time:performance.now()}),true);
  });
  const start=Date.now();
  const result={route,errors};
  try {
    await page.goto((process.env.FOREST_LAB_URL || 'http://127.0.0.1:3310')+route,{waitUntil:'domcontentloaded'});
    const canvas=page.locator('canvas');
    await page.locator("canvas[data-forest-origin-ready='true']").waitFor({timeout:120000});
    result.readyMs=Date.now()-start;
    await page.waitForTimeout(5000);
    await page.evaluate(()=>{window.__benchFrames=[];window.__benchCollect=true;let last=performance.now();function frame(now){if(!window.__benchCollect) return;window.__benchFrames.push(now-last);last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
    result.samples=[];
    const seconds=Number(process.env.PINE_SECONDS || 12);
    for(let second=0;second<seconds;second++) {
      await page.waitForTimeout(1000);
      result.samples.push(JSON.parse(await canvas.getAttribute('data-forest-origin-metrics')));
    }
    const frames=await page.evaluate(()=>{window.__benchCollect=false;return window.__benchFrames;});
    const sortedFrames=[...frames].sort((a,b)=>a-b);
    result.frameSummary={frames:frames.length,seconds:frames.reduce((s,x)=>s+x,0)/1000,averageFps:1000*frames.length/frames.reduce((s,x)=>s+x,0),medianFps:1000/sortedFrames[Math.floor(sortedFrames.length/2)],p95Ms:sortedFrames[Math.floor(sortedFrames.length*0.95)],maxMs:Math.max(...frames)};
    result.audit=JSON.parse(await canvas.getAttribute('data-forest-submission-audit') || 'null');
    result.streaming=JSON.parse(await canvas.getAttribute('data-forest-streaming') || 'null');
    await page.screenshot({path:path.join(folder,`experiment-${i+1}.png`)});
    result.renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);});
    result.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('forest-origin-assets')).map(r=>({name:r.name.split('/forest-origin-assets/')[1],transfer:r.transferSize,encoded:r.encodedBodySize,duration:r.duration})));
    result.contextEvents=await page.evaluate(()=>window.__contextEvents);
  } catch(e) {result.failed=String(e);await page.screenshot({path:path.join(folder,`failed-${i+1}.png`)}).catch(()=>{});}
  await context.close();await browser.close();results.push(result);
  await writeFile(path.join(folder,'results.json'),JSON.stringify(results,null,2));
  const sorted=(result.samples||[]).map(s=>s.fps).sort((a,b)=>a-b);
  console.log(JSON.stringify({route,readyMs:result.readyMs,fps:sorted[Math.floor(sorted.length/2)],last:result.samples?.at(-1),errors,failed:result.failed}));
}
if(results.some(r=>r.failed || r.errors.length || r.contextEvents?.length)) process.exitCode=1;
