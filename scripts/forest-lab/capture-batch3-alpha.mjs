import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve(process.env.PINE_EVIDENCE||'artifacts-local/pine-batch3/alpha-review');
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {for(const species of ['pine_02']) for(const view of ['near','mid']) for(const level of ['source','near']) for(const alpha of ['single','coverage']) {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.stack));page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  const url=`${process.env.FOREST_LAB_URL||'http://127.0.0.1:3310'}/forest-lod-lab?species=${species}&level=${level}&view=${view}${alpha==='coverage'?'&alpha=coverage':''}`;
  try {
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(500);
  const filename=`${species}-${view}-${level}-${alpha}.png`;
  await page.screenshot({path:path.join(folder,filename)});
  const detail=await page.locator('canvas').evaluate(canvas=>({review:JSON.parse(canvas.dataset.pineReview),draw:JSON.parse(canvas.dataset.pineReviewDraw),renderer:canvas.getContext('webgl2').getParameter(canvas.getContext('webgl2').getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)}));
  results.push({species,view,level,alpha,filename,...detail,errors});
  await page.close();
  if(errors.length) throw Error(errors.join('\n'));
  console.log(species,view,level,alpha,detail.draw.triangles,detail.draw.calls);
  } catch(error) {await page.screenshot({path:path.join(folder,'failed.png')}).catch(()=>{});console.error(errors);throw error;}
}} finally {await browser.close();await writeFile(path.join(folder,'results.json'),JSON.stringify(results,null,2));}
