import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.env.PINE_EVIDENCE||'artifacts-local/pine-batch3b/browser');
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const result={viewport:{width:1440,height:900},dpr:1,variants:[],errors:[]};
const errors=result.errors;
async function open(route,name,video=false) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,
    ...(video?{recordVideo:{dir:root,size:{width:1440,height:900}}}:{})});
  const page=await context.newPage();
  await page.addInitScript(()=>{window.__archiveAccess=[];for(const method of ['getItem','setItem','removeItem','clear']){const f=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__archiveAccess.push({method,key:args[0]});return f.apply(this,args)};}const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__archiveAccess.push({method:'indexedDB.open',key:args[0]});return open(...args)};});
  page.on('pageerror',e=>errors.push(`${name}: ${e.stack}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`${name}: ${m.text()}`);});
  page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))errors.push(`${name}: ${r.url()} ${r.failure()?.errorText}`);});
  await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3311')+route,{waitUntil:'domcontentloaded'});
  if(route.startsWith('/forest-lod-lab')) await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});
  else {
    await page.locator('canvas[data-forest-origin-ready=true]').waitFor({timeout:120000});
    await page.waitForFunction(()=>{const c=document.querySelector('canvas');const s=JSON.parse(c?.dataset.forestStreaming||'null');return s && !s.pendingTiles.length && !s.pendingResources.length && s.queued===0;},null,{timeout:120000});
  }
  await page.waitForTimeout(route.startsWith('/forest-lod-lab')?1000:8000);
  const camera=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.forestOriginMetrics||'null'));
  return {page,context,camera};
}
async function settleCanvas(page,selector='') {
  await page.waitForFunction(selector=>!selector || document.querySelector('canvas')?.dataset[selector]==='pbr',selector,{timeout:120000});
  await page.waitForTimeout(800);
  const base=await page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics||'null'),streaming:JSON.parse(c.dataset.forestStreaming||'null'),renderer:(()=>{const gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)})()}));
  base.motion=await page.evaluate(async()=>{const frames=[];let last=performance.now(),end=last+5000;await new Promise(resolve=>{function sample(now){frames.push(now-last);last=now;if(now<end)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample)});frames.sort((a,b)=>a-b);return {averageFps:1000*frames.length/frames.reduce((a,b)=>a+b,0),p95Ms:frames[Math.floor(frames.length*.95)],p99Ms:frames[Math.floor(frames.length*.99)],maxMs:Math.max(...frames)}});
  base.archiveAccess=await page.evaluate(()=>window.__archiveAccess);
  return base;
}
try {
  const base=await open('/forest-runtime-lab?scale=0.8&review=1','terrain-base');
  const initial=await settleCanvas(base.page);
  await base.page.screenshot({path:path.join(root,'terrain-before.png')});
  result.variants.push({name:'terrain-before',...initial});
  await base.page.close();await base.context.close();
  const after=await open('/forest-runtime-lab?scale=0.8&review=1&terrain=pbr','terrain-pbr');
  await after.page.waitForFunction(()=>document.querySelector('canvas')?.dataset.pineReviewPoseReady==='true');
  await after.page.evaluate(pose=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail:{position:pose.metrics.camera,direction:pose.metrics.direction}})),initial);
  await after.page.waitForTimeout(500);
  const pbr=await settleCanvas(after.page,'pineTerrain');
  await after.page.screenshot({path:path.join(root,'terrain-after-pbr.png')});
  result.variants.push({name:'terrain-after-pbr',...pbr});
  const upload=await after.page.evaluate(async()=>({resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/batch3b/terrain/')).map(x=>({url:x.name.split('/').pop(),bytes:x.encodedBodySize,duration:x.duration})),storage:window.__archiveAccess||[]}));
  result.terrainResources=upload.resources;
  await after.page.close();await after.context.close();

  const tree=await open('/forest-lod-lab?species=pine_04&level=far&view=near&impostor=smooth','pine04-smooth');
  await tree.page.waitForFunction(()=>document.querySelector('canvas')?.dataset.pineReviewReady==='true');
  const treeCanvas=tree.page.locator('canvas');
  for(const angle of [0,0.25,0.5,0.75]) {
    await tree.page.evaluate(value=>window.dispatchEvent(new CustomEvent('pine-review-angle',{detail:value})),angle);
    await tree.page.waitForTimeout(350);
    const filename=`pine04-smooth-${angle.toString().replace('.','_')}.png`;
    await tree.page.screenshot({path:path.join(root,filename)});
    result.variants.push({name:filename,review:await treeCanvas.evaluate(c=>JSON.parse(c.dataset.pineReview)),draw:await treeCanvas.evaluate(c=>JSON.parse(c.dataset.pineReviewDraw)),errors:[]});
  }
  await tree.page.close();await tree.context.close();

  const walk=await open('/forest-runtime-lab?scale=0.8&terrain=pbr','continuous-walk',true);
  await settleCanvas(walk.page,'pineTerrain');
  await walk.page.locator('canvas').click({position:{x:720,y:450}});
  await walk.page.keyboard.down('w');await walk.page.waitForTimeout(6500);await walk.page.keyboard.up('w');
  await walk.page.mouse.move(720,450);await walk.page.mouse.down();await walk.page.mouse.move(1120,390,{steps:80});await walk.page.mouse.up();
  await walk.page.keyboard.down('w');await walk.page.waitForTimeout(5500);await walk.page.keyboard.up('w');
  const movement=await walk.page.evaluate(()=>({metrics:JSON.parse(document.querySelector('canvas').dataset.forestOriginMetrics||'null'),streaming:JSON.parse(document.querySelector('canvas').dataset.forestStreaming||'null')}));
  result.movement=movement;result.archiveAccess=await walk.page.evaluate(()=>window.__archiveAccess||[]);
  await walk.page.close();const video=await walk.page.video().path();await walk.context.close();
  const {copyFile}=await import('node:fs/promises');await copyFile(video,path.join(root,'continuous-walk-and-turn.webm'));
} catch(error) {result.failed=String(error);}
await browser.close();
await writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({failed:result.failed,renderer:result.variants[0]?.renderer,terrain:result.variants.slice(0,2).map(v=>({name:v.name,triangles:v.metrics?.triangles,calls:v.metrics?.calls,textures:v.metrics?.textures,errors:v.errors})),treeViews:result.variants.slice(2,6).map(v=>v.name),errors}));
if(result.failed||errors.length)process.exitCode=1;
