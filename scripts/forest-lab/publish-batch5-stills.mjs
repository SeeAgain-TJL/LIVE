import sharp from 'sharp';
import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
const base='artifacts-local/pine-batch5',out='docs/reviews/pine-batch5';await mkdir(out,{recursive:true});
const panels=[];
function label(text,width=960) {
 return Buffer.from(`<svg width="${width}" height="36"><rect width="100%" height="100%" fill="#172421"/><text x="16" y="25" fill="white" font-size="20" font-family="Arial">${text}</text></svg>`);
}
for(const [i,name] of ['near','mid','far'].entries()) {
 const browser=await sharp(`${base}/final-stills/${name}-low.png`).resize(960,600).png().toBuffer();
 const blender=await sharp(`${base}/blender/blender-${name}.png`).resize(960,600).png().toBuffer();
 await sharp(`${base}/final-stills/${name}-low.png`).webp({quality:92}).toFile(`${out}/${name}-low.webp`);
 await sharp({create:{width:1920,height:636,channels:3,background:'#172421'}}).composite([
   {input:label(`Blender derivative / ${name}`),top:0,left:0},{input:blender,top:36,left:0},
   {input:label(`Chrome low 80% / ${name}`),top:0,left:960},{input:browser,top:36,left:960},
 ]).webp({quality:92}).toFile(`${out}/comparison-${name}.webp`);
 panels.push({input:label(name,480),top:0,left:i*480},{input:await sharp(browser).resize(480,300).png().toBuffer(),top:36,left:i*480});
}
await sharp({create:{width:1440,height:336,channels:3,background:'#172421'}}).composite(panels).webp({quality:92}).toFile(`${out}/browser-overview.webp`);
for(const [src,dest] of [['final-stills/results.json','stills.json'],['blender/comparison.json','blender-comparison.json'],['blender/sample.json','sample.json'],['phase2-startup/results.json','sample-startup.json']]) {
 const r=JSON.parse(await readFile(`${base}/${src}`,'utf8'));
 if(src==='phase2-startup/results.json') {delete r.blocked;delete r.ready;}
 await writeFile(`${out}/${dest}`,JSON.stringify(r,null,2)+'\n');
}
await copyFile(`${base}/blender/contact-ao.png`,`${base}/handoff/contact-ao-review.png`);
