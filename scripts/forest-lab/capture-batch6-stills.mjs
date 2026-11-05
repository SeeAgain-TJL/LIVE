import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const high=process.argv.includes('--high');
const folder=path.resolve(process.env.PINE_EVIDENCE || 'artifacts-local/pine-batch6',high ? 'stills-high':'stills');
await mkdir(folder,{recursive:true});
const poses={
  near:{position:[23.155473709106445,.9223032593727112,47.55979919433594],direction:[-.9821439487,.1260486988,-.1396602648]},
  ruins:{position:[-24,9,44],direction:[-1,.04,-.37]},
  far:{position:[10,18,60],direction:[.1,-.5,-1]},
  ...(process.env.PINE_REPAIR ? {
    pine02Near:{position:[13.8,2.2,57],direction:[-4.5,5,-2.1]},
    pine02Mid:{position:[22,2,62],direction:[-12.7,5.5,-7.1]},
    pine02Far:{position:[48,7,70],direction:[-38.7,1.5,-15.1]},
    river:{position:[17,2.5,39],direction:[-6,-1.5,-8]},
  }:{}),
  ...(process.env.PINE_TEMPLATE ? {
    crown:{position:[20.4,2.15,46.7],direction:[-4.5,4.6,-4.0]},
    walkMid:{position:[-9.3,2.6,31.1],direction:[-.84,.045,-.54]},
    walkFar:{position:[20.9,1.8,44.0],direction:[-.34,.035,-1]},
    edge:{position:[88,3.7,50],direction:[1,.015,.11]},
    raisedEdge:{position:[55,41,48],direction:[1,-.40,-.22]},
  } : {}),
  ...(process.env.PINE_PANORAMA ? {panorama:{position:[0,264,50],direction:[0,-261,-50]}} : {}),
};
const browser=await chromium.launch({channel:'chrome',headless:true});
const result={browser:browser.version(),viewport:[1440,900],verticalFov:48.5,errors:[],shots:[]};
try {
  for(const [name,pose] of Object.entries(poses)) {
    if(process.env.PINE_SHOT && !process.env.PINE_SHOT.split(',').includes(name)) continue;
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    if(process.env.PINE_LANDMARK_OVERRIDE) await page.route('**/forest-origin-assets/**/landmarks.glb',r=>r.fulfill({path:path.resolve(process.env.PINE_LANDMARK_OVERRIDE)}));
    page.on('pageerror',e=>result.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)result.errors.push(`${r.status()} ${r.url()}`);});
    const route=`/forest-runtime-lab?scale=${process.env.PINE_SCALE || '0.8'}&review=1`+(high ? '&quality=high':'')+(process.env.PINE_QUERY ? '&'+process.env.PINE_QUERY : '');
    await page.goto((process.env.FOREST_LAB_URL || 'http://127.0.0.1:3320')+route);
    await page.locator('canvas[data-pine-review-pose-ready=true][data-pine-terrain=layered][data-pine-landmarks=ready]').waitFor({timeout:120000});
    if(process.env.PINE_VISUAL_FINISH) await page.locator('canvas[data-pine-outer-forest=ready]').waitFor({timeout:120000});
    await page.locator('canvas[data-forest-origin-ready=true]').waitFor({timeout:120000});
    await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail})),pose);
    await page.waitForFunction(()=>{
      const c=document.querySelector('canvas');const s=JSON.parse(c?.dataset.forestStreaming || 'null');
      return c?.dataset.forestOriginReady==='true' && s && !s.pendingTiles.length && !s.pendingResources.length && !s.queued;
    },null,{timeout:120000});
    await page.waitForTimeout(4000);
    const state=await page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics),streaming:JSON.parse(c.dataset.forestStreaming),dimensions:[c.width,c.height]}));
    assert.ok(Math.hypot(...state.metrics.camera.map((v,i)=>v-pose.position[i]))<.00001);
    assert.equal(state.metrics.contextLost,false);
    if (!high) assert.ok(!state.streaming.resources.includes('pine_04/mid'));
    await page.screenshot({path:path.join(folder,`${name}.png`)});
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      const f=[];let last=performance.now();const start=last;
      function next(now){f.push(now-last);last=now;if(now-start<7000)requestAnimationFrame(next);else resolve(f);}requestAnimationFrame(next);
    }));
    frames.sort((a,b)=>a-b);
    result.shots.push({name,route,pose,...state,stationary:{seconds:frames.reduce((s,x)=>s+x,0)/1000,averageFps:frames.length*1000/frames.reduce((s,x)=>s+x,0),p95Ms:frames[Math.floor(frames.length*.95)]}});
    console.log(name,JSON.stringify(result.shots.at(-1).stationary));
    await page.close();
  }
  assert.ok(result.shots.length>0);
  assert.deepEqual(result.errors,[]);result.passed=true;
} finally {
  await browser.close();await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2)+'\n');
}
