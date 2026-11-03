import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const folder=path.resolve('artifacts-local/pine-batch2/lod-review');await mkdir(folder,{recursive:true});
const results=[];
for(const species of ['pine_02','silver_fir_02']) for(const view of ['near','mid','far']) {
  const inputs=[];
  for(const level of ['source','near','far']) {
    const browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto(`${process.env.FOREST_LAB_URL || 'http://127.0.0.1:3310'}/forest-lod-lab?species=${species}&level=${level}&view=${view}`);
    await page.locator('canvas[data-pine-review-ready=true]').waitFor({timeout:120000});await page.waitForTimeout(600);
    const filename=`${species}-${view}-${level}.png`;
    await page.screenshot({path:path.join(folder,filename)});
    const metadata=await page.locator('canvas').evaluate(c=>({review:JSON.parse(c.dataset.pineReview),draw:JSON.parse(c.dataset.pineReviewDraw)}));
    results.push({species,view,level,...metadata,errors});
    const thumbnail=await sharp(path.join(folder,filename)).resize(720,450).png().toBuffer();
    inputs.push({input:thumbnail,left:inputs.length*720,top:40});
    await browser.close();
    if(errors.length) throw Error(errors.join('\n'));
  }
  const labels=Buffer.from(`<svg width="2160" height="40"><rect width="2160" height="40" fill="#172421"/><g fill="white" font-size="22" font-family="Arial"><text x="20" y="28">${species} / ${view} / SOURCE full geometry</text><text x="740" y="28">Near LOD / gltfpack 10%</text><text x="1460" y="28">Mid/far / full-source 8-view atlas</text></g></svg>`);
  await sharp({create:{width:2160,height:490,channels:3,background:'#172421'}}).composite([{input:labels,left:0,top:0},...inputs]).png().toFile(path.join(folder,`${species}-${view}-comparison.png`));
  await writeFile(path.join(folder,'results.json'),JSON.stringify(results,null,2));console.log(species,view,'captured');
}
