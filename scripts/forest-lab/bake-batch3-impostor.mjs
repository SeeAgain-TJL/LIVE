// One representative source tree only. Reuses Batch 2's full-source review scene
// and Sharp image packaging, without simplifying or changing any forest matrix.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const name='pine_04',views=16,width=512,height=1024;
const folder=path.resolve('public/forest-origin-assets/batch3/impostors');
const evidence=path.resolve('artifacts-local/pine-batch3/impostor-bake');
await mkdir(folder,{recursive:true});await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto(`${process.env.FOREST_LAB_URL||'http://127.0.0.1:3310'}/forest-lod-lab?species=${name}&level=source&bake=1&views=16`);
  await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(1000);
  const metadata=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.pineReview));
  const composite=[];
  for(let angle=0;angle<views;angle++) {
    await page.evaluate(angle=>window.dispatchEvent(new CustomEvent('pine-review-angle',{detail:angle})),angle);
    await page.waitForTimeout(220);
    const image=Buffer.from((await page.locator('canvas').evaluate(c=>c.toDataURL('image/png'))).split(',')[1],'base64');
    await writeFile(path.join(evidence,`${name}-${angle}.png`),image);
    composite.push({input:image,left:angle%4*width,top:Math.floor(angle/4)*height});
  }
  if(errors.length) throw Error(errors.join('\n'));
  const atlas=await sharp({create:{width:width*4,height:height*4,channels:4,background:'#00000000'}}).composite(composite).webp({quality:95,alphaQuality:100}).toBuffer();
  await writeFile(path.join(folder,`${name}.webp`),atlas);
  const json={...metadata,version:4,views,tile:[width,height],atlas:[width*4,height*4],bytes:atlas.length,
    source:'Full original Pine Forest pine_04 mesh with original verified 1K PBR atlases. No scene or geometry changes.',errors};
  await writeFile(path.join(folder,`${name}.json`),JSON.stringify(json,null,2));
  const archive=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch3-work/impostors');await mkdir(archive,{recursive:true});
  for(const ext of ['json','webp']) await copyFile(path.join(folder,`${name}.${ext}`),path.join(archive,`${name}.${ext}`));
  console.log(json);
} finally {await browser.close();}
