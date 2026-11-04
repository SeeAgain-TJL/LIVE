import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const folder=process.env.PINE_EVIDENCE || 'artifacts-local/pine-final';
await mkdir(folder,{recursive:true});
const root='public/forest-origin-assets';
const nav=JSON.parse(await readFile(root+'/environment/navigation.json'));
const trees=JSON.parse(await readFile(root+'/source-tree-placements.json'));
const free=(i,j)=>{
 const k=i+j*nav.columns;
 return [k,k+1,k+nav.columns,k+nav.columns+1].every(n=>nav.heights[n]!=null && !nav.blocked[n]);
};
// Find a clear eastward approach ending at a source ruin, with no tree trunk
// masking the collision. Camera placement is diagnostic; W is real input.
let approach;
outer: for(let j=1;j<nav.rows-1;j++) for(let i=7;i<nav.columns-2;i++) {
 if(free(i,j) || !nav.blocked[i+1+j*nav.columns]) continue;
 const z=-(nav.origin[1]+(j+.5)*nav.step);
 const wall=nav.origin[0]+i*nav.step;
 const start=wall-3.25;
 if(trees.some(({matrix:m})=>m[0][3]>start-1 && m[0][3]<wall+1 && Math.abs(z+m[1][3])<1.05)) continue;
 if(!Array.from({length:7},(_,k)=>free(i-1-k,j)).every(Boolean)) continue;
 const y=nav.heights[i-7+j*nav.columns]+1.2;
 approach={position:[start,y,z],direction:[1,0,0],wall};
 break outer;
}
assert.ok(approach,'No unmasked approach to a ruin boundary');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const result={approach,errors:[]};
page.on('pageerror',e=>result.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
try {
 await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3199')+'/forest-runtime-lab?review=1');
 const canvas=page.locator('canvas[data-pine-review-pose-ready=true][data-pine-landmarks=ready][data-forest-origin-ready=true]');
 await canvas.waitFor({timeout:120000});
 await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('pine-runtime-review-camera',{detail})),approach);
 await canvas.click({position:{x:720,y:450}});
 await page.keyboard.down('w');
 await page.waitForTimeout(4200);
 await page.keyboard.up('w');
 result.end=await canvas.evaluate(c=>JSON.parse(c.dataset.forestOriginMetrics).camera);
 assert.ok(result.end[0]>approach.wall-.4 && result.end[0]<approach.wall+.02, 'Expected the wall to stop eastward movement');
 assert.ok(Math.abs(result.end[2]-approach.position[2])<.04);
 assert.deepEqual(result.errors,[]);
 result.passed=true;
} finally {
 await browser.close();
 await writeFile(folder+'/ruin-collision.json',JSON.stringify(result,null,2)+'\n');
}
