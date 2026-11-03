import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {packageSharedGlb} from './package-shared-gltf.mjs';
const out=path.resolve('artifacts-local/pine-batch4/mid-lod-trials');
const ratio=process.env.PINE_RATIO||'0.015';
const result=await packageSharedGlb(path.join(out,`pine_04-mid-${ratio}.glb`),path.resolve('public/forest-origin-assets/batch4/trees'),'pine_04-mid',1024);
await writeFile(path.join(out,`result-${ratio}.json`),JSON.stringify(result,null,2));
console.log(result);
