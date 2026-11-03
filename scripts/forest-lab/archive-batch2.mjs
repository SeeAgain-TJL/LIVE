import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const source=path.resolve('public/forest-origin-assets/batch2');
const target=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch2-delivery');
await mkdir(target,{recursive:true});
await cp(source,target,{recursive:true});
const files=[];
async function walk(directory) {
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);
    if(item.isDirectory()) await walk(file);
    else {
      const hash=createHash('sha256');let bytes=0;
      for await(const block of createReadStream(file)){hash.update(block);bytes+=block.length;}
      const relative=path.relative(source,file).replaceAll('\\','/');
      const copied=createHash('sha256').update(await readFile(path.join(target,relative))).digest('hex');
      const digest=hash.digest('hex');if(copied!==digest) throw Error('Archive mismatch '+relative);
      files.push({file:relative,bytes,sha256:digest});
    }
  }
}
await walk(source);
const manifest={source:'Poly Haven Pine Forest / original 08bec0f asset library retained',files,totalBytes:files.reduce((s,f)=>s+f.bytes,0)};
await writeFile(path.join(target,'delivery-sha256.json'),JSON.stringify(manifest,null,2));
await mkdir('artifacts-local/pine-batch2',{recursive:true});
await writeFile('artifacts-local/pine-batch2/delivery-sha256.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({target,files:files.length,totalBytes:manifest.totalBytes,verified:true}));
