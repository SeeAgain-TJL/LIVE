import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const folder=path.resolve('artifacts-local/pine-batch3/lod-review');await mkdir(folder,{recursive:true});
const result=[];const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const view of ['near','mid','far']) for(const variant of ['source','near','atlas8','atlas16']) {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    const level=variant.startsWith('atlas')?'far':variant;
    await page.goto(`${process.env.FOREST_LAB_URL||'http://127.0.0.1:3310'}/forest-lod-lab?species=pine_04&level=${level}&view=${view}${variant==='atlas16'?'&impostor=detail':''}`);
    await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(600);
    const filename=`pine_04-${view}-${variant}.png`;
    await page.screenshot({path:path.join(folder,filename)});
    result.push({view,variant,filename,errors,...await page.locator('canvas').evaluate(c=>({review:JSON.parse(c.dataset.pineReview),draw:JSON.parse(c.dataset.pineReviewDraw)}))});
    await page.close();if(errors.length) throw Error(errors.join('\n'));console.log(view,variant);
  }
} finally {await browser.close();await writeFile(path.join(folder,'results.json'),JSON.stringify(result,null,2));}
for(const view of ['near','mid','far']) {
  const parts=await Promise.all(['source','near','atlas8','atlas16'].map(async(variant,i)=>({input:await sharp(path.join(folder,`pine_04-${view}-${variant}.png`)).resize(576,360).png().toBuffer(),left:i*576,top:32})));
  const labels=Buffer.from('<svg width="2304" height="32"><rect width="2304" height="32" fill="#172421"/><g fill="white" font-size="19" font-family="Arial"><text x="12" y="23">Full original source</text><text x="588" y="23">Existing near LOD</text><text x="1164" y="23">Original 8-view atlas</text><text x="1740" y="23">Derived 16-view atlas (higher)</text></g></svg>');
  await sharp({create:{width:2304,height:392,channels:3,background:'#172421'}}).composite([{input:labels,left:0,top:0},...parts]).png().toFile(path.join(folder,`${view}-comparison.png`));
}
// Real Cycles picture remains visibly labeled as a different renderer and
// environment. Side-by-side aids material review, never pixel-equivalence.
const blender=await readFile('artifacts-local/pine-batch3/blender/blender-pine_02-original-cycles.png');
const web=await sharp('artifacts-local/pine-batch3/alpha-review/pine_02-near-source-single.png').resize(720,450).png().toBuffer();
await sharp({create:{width:1440,height:482,channels:3,background:'#172421'}}).composite([
  {input:Buffer.from('<svg width="1440" height="32"><rect width="1440" height="32" fill="#172421"/><g fill="white" font-size="18" font-family="Arial"><text x="12" y="23">Original Blender Cycles / 8 samples / original world</text><text x="732" y="23">Three.js full-source geometry / converted PBR</text></g></svg>'),left:0,top:0},
  {input:blender,left:0,top:32},{input:web,left:720,top:32}]).png().toFile(path.join(folder,'blender-three-original-material.png'));
