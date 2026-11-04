import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const folder=process.env.PINE_EVIDENCE || 'artifacts-local/pine-template/runtime';
await mkdir(folder,{recursive:true});
const url=process.env.FOREST_LAB_URL || 'http://127.0.0.1:3214';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const result={errors:[],switches:[],assetRequests:[]};
page.on('pageerror',e=>result.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)result.errors.push(`${r.status()} ${r.url()}`);});
page.on('request',r=>{if(r.url().includes('/forest-origin-assets/'))result.assetRequests.push(new URL(r.url()).pathname.split('/forest-origin-assets/')[1]);});
await page.addInitScript(()=>{
 window.pineArchiveReads=[];
 for(const key of ['getItem','setItem','removeItem','clear']) {
  const prior=Storage.prototype[key];Storage.prototype[key]=function(...args){window.pineArchiveReads.push({key,args});return prior.apply(this,args);};
 }
 window.pineGpuDeletes={buffers:0,textures:0};
 for(const [key,name] of [['deleteBuffer','buffers'],['deleteTexture','textures']]){
  const prior=WebGL2RenderingContext.prototype[key];WebGL2RenderingContext.prototype[key]=function(...args){window.pineGpuDeletes[name]++;return prior.apply(this,args);};
 }
});
const settled=async()=>{
 await page.locator('canvas[data-forest-origin-ready=true][data-pine-outer-forest=ready][data-pine-landmarks=ready]').waitFor({timeout:120000});
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas')?.dataset.forestStreaming||'null');return s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
 await page.waitForTimeout(1200);
};
const state=()=>page.locator('canvas').evaluate(c=>({dimensions:[c.width,c.height],stream:JSON.parse(c.dataset.forestStreaming),metrics:JSON.parse(c.dataset.forestOriginMetrics),gpuDeletes:window.pineGpuDeletes}));
try {
 await page.goto(url+'/forest-runtime-lab');await settled();
 result.default=await state();
 assert.equal(await page.getByLabel('森林资源精度').inputValue(),'low');
 assert.equal(await page.getByLabel('内部渲染分辨率').inputValue(),'0.7');
 assert.ok(result.default.dimensions[0]<1020);
 for(const quality of ['mid','high','low']){
  await page.getByLabel('森林资源精度').selectOption(quality);await settled();
  result.switches.push({quality,...await state()});
  assert.equal(result.switches.at(-1).metrics.contextLost,false);
 }
 const end=result.switches.at(-1);
 assert.ok(end.gpuDeletes.buffers>result.default.gpuDeletes.buffers);
 assert.ok(end.gpuDeletes.textures>result.default.gpuDeletes.textures);
 assert.ok(end.stream.resources.every(r=>r==='props/far'||r.startsWith('props/')||r.endsWith('/far')||!r.endsWith('/mid')));
 // Reach an original boundary with real movement. No movement of the scenic
 // region is enabled; the pose only sets up this isolated collision check.
 await page.goto(url+'/forest-runtime-lab?review=1');await settled();
 const nav=JSON.parse(await readFile('public/forest-origin-assets/environment/navigation.json','utf8'));
 const x=89,z=50,i=Math.round((x-nav.origin[0])/nav.step),j=Math.round((-z-nav.origin[1])/nav.step);
 const y=nav.heights[i+j*nav.columns]+1.2;
 const pose={position:[x,y,z],direction:[1,0,0]};
 await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail})),pose);
 const canvas=page.locator('canvas');await canvas.click({position:{x:720,y:450}});
 await page.keyboard.down('w');await page.waitForTimeout(8500);await page.keyboard.up('w');
 result.boundary={start:pose,end:(await state()).metrics.camera};
 assert.ok(result.boundary.end[0]>89 && result.boundary.end[0]<100.5);
 assert.ok(Math.abs(result.boundary.end[2]-50)<.01);
 await page.screenshot({path:folder+'/boundary-walk.png'});
 result.archiveAccess=await page.evaluate(()=>window.pineArchiveReads);assert.deepEqual(result.archiveAccess,[]);
 assert.deepEqual(result.errors,[]);result.passed=true;
}finally{
 result.assetRequests=[...new Set(result.assetRequests)].sort();
 await browser.close();await writeFile(folder+'/results.json',JSON.stringify(result,null,2)+'\n');
}
