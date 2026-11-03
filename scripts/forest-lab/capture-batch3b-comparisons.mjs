import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('artifacts-local/pine-batch3b/final-visuals');await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],results=[];
const url=process.env.FOREST_LAB_URL||'http://127.0.0.1:3312';
try {
  const pose=JSON.parse(await readFile('artifacts-local/pine-batch3b/blender/terrain-reference/camera.json'));
  for(const terrain of ['legacy','pbr']) {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=terrain&terrain=${terrain}`);
    await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({timeout:120000});
    if(terrain==='pbr')await page.locator('canvas[data-pine-terrain=pbr]').waitFor({timeout:120000});
    await page.evaluate(pose=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail:{position:pose.three_position,direction:pose.three_direction}})),pose);
    await page.waitForTimeout(12000);
    await page.screenshot({path:path.join(root,`terrain-only-${terrain}.png`)});
    results.push({terrain,pose,...await page.locator('canvas').evaluate(c=>({metrics:JSON.parse(c.dataset.forestOriginMetrics||'null')}))});
    await page.close();
  }
  for(const [name,params] of [['near','level=near'],['source','level=source'],['mid','level=far&impostor=smooth'],['cycles-atlas','level=far&impostor=source']]) {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/forest-lod-lab?species=pine_04&view=near&${params}`);
    await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(1000);
    await page.screenshot({path:path.join(root,`tree-${name}.png`)});await page.close();
  }
  // Uncut per-variant revolution of the actual browser camera/atlas. This is
  // source-view inspection, separate from the real WASD roaming recording.
  for(const variant of ['detail','smooth','source']) {
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:root,size:{width:1440,height:900}}});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/forest-lod-lab?species=pine_04&level=far&view=mid&impostor=${variant}`);
    await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(500);
    await page.evaluate(async()=>{const start=performance.now();await new Promise(resolve=>{function tick(now){const t=(now-start)/1000;window.dispatchEvent(new CustomEvent('pine-review-angle',{detail:t/12*16}));if(t<12)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick)});});
    await page.close();const video=await page.video().path();await context.close();await copyFile(video,path.join(root,`turn-${variant}.webm`));
  }
} finally {await browser.close();await writeFile(path.join(root,'results.json'),JSON.stringify({errors,results},null,2));}
if(errors.length)throw Error(errors.join('\n'));
console.log('Same-camera terrain, single-tree, and uncut camera-turn videos captured');
