import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public/forest-origin-assets/batch2/impostors');await mkdir(root,{recursive:true});
const evidence=path.resolve('artifacts-local/pine-batch2/impostor-bake');await mkdir(evidence,{recursive:true});
const inventory=JSON.parse(await readFile('public/forest-origin-assets/render-inventory.json'));
const species=process.env.PINE_SPECIES ? [process.env.PINE_SPECIES]:Object.keys(inventory.treeSpeciesCounts);
const report=[];
for(const name of species) {
  if(await stat(path.join(root,`${name}.json`)).catch(()=>null)) {
    const old=JSON.parse(await readFile(path.join(root,`${name}.json`)));
    if(old.version===3) continue;
  }
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:384,height:768},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto(`${process.env.FOREST_LAB_URL || 'http://127.0.0.1:3311'}/forest-lod-lab?species=${name}&level=source&bake=1`);
  await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});
  await page.waitForTimeout(1000);
  const metadata=JSON.parse(await page.locator('canvas').getAttribute('data-pine-review'));
  const composite=[];
  for(let angle=0;angle<8;angle++) {
    await page.evaluate(angle=>window.dispatchEvent(new CustomEvent('pine-review-angle',{detail:angle})),angle);
    await page.waitForTimeout(180);
    // Read the transparent WebGL drawing buffer itself. A browser compositor
    // screenshot can include the Next development indicator over the canvas.
    const dataUrl=await page.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
    const image=Buffer.from(dataUrl.split(',')[1],'base64');
    await writeFile(path.join(evidence,`${name}-${angle}.png`),image);
    composite.push({input:image,left:(angle%4)*384,top:Math.floor(angle/4)*768});
  }
  if(errors.length) throw Error(errors.join('\n'));
  const atlas=await sharp({create:{width:1536,height:1536,channels:4,background:'#00000000'}}).composite(composite).webp({quality:95,alphaQuality:100}).toBuffer();
  await writeFile(path.join(root,`${name}.webp`),atlas);
  const json={...metadata,version:3,views:8,tile:[384,768],atlas:[1536,1536],bytes:atlas.length,source:'Full realized original mesh, verified 1K source atlases, Three.js PBR lighting; no geometry simplification in bake.',errors};
  await writeFile(path.join(root,`${name}.json`),JSON.stringify(json,null,2));
  report.push(json);
  await browser.close();console.log(name,atlas.length,metadata.width,metadata.height);
}
const archive=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch2/impostors');await mkdir(archive,{recursive:true});
for(const name of species) for(const ext of ['json','webp']) await copyFile(path.join(root,`${name}.${ext}`),path.join(archive,`${name}.${ext}`));
await writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
