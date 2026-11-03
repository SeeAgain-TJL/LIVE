import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.PINE_EVIDENCE||'artifacts-local/pine-batch3b/tree-review');await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
  const jobs=[
    ['pine_02','source',''],['pine_02','near',''],['pine_02','near','&alpha=coverage'],
    ['pine_04','source',''],['pine_04','near',''],['pine_04','near','&needles=double'],['pine_04','near','&needles=source'],['pine_04','near','&uv=float'],
    ['pine_04','far',''],['pine_04','far','&impostor=detail'],['pine_04','far','&impostor=smooth'],['pine_04','far','&impostor=source']];
  for(const [species,level,params] of jobs) {
    if(process.env.PINE_ONLY && `${species}/${level}/${params}`!==process.env.PINE_ONLY) continue;
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
    await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3311')+`/forest-lod-lab?species=${species}&level=${level}&view=near${params}`);
    await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(1000);
    const filename=`${species}-${level}-${params.replace(/[^a-z]/g,'')||'baseline'}.png`;
    await page.screenshot({path:path.join(root,filename)});
    const detail=await page.locator('canvas').evaluate(c=>({review:JSON.parse(c.dataset.pineReview),draw:JSON.parse(c.dataset.pineReviewDraw)}));
    const perf=await page.evaluate(async()=>{const f=[];let last=performance.now(),end=last+4000;await new Promise(resolve=>{function tick(t){f.push(t-last);last=t;if(t<end)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick)});f.sort((a,b)=>a-b);return {fps:f.length*1000/f.reduce((a,b)=>a+b,0),p95Ms:f[Math.floor(f.length*.95)]};});
    results.push({species,level,params,filename,detail,perf,errors});console.log(filename,perf,errors);
    await page.close();if(errors.length)throw Error(errors.join('\n'));
  }
} finally {await browser.close();await writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2));}
