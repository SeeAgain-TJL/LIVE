import { readFile, mkdir, stat, copyFile, writeFile } from 'node:fs/promises';
import { packageSharedGlb } from './package-shared-gltf.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const home=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME');
const source=path.join(home,'asset-audit/candidate-assets/pine-source-conversion/trees-realized');
const output=path.resolve('public/forest-origin-assets/batch2/trees');await mkdir(output,{recursive:true});
const inventory=JSON.parse(await readFile('public/forest-origin-assets/render-inventory.json'));
const manifest={};
for(const name of Object.keys(inventory.treeSpeciesCounts)) for(const level of ['source','near']) {
  const from=path.join(source,`${name}-${level==='source' ? 'meshopt':'lod10-meshopt'}-webp.glb`);
  const file=path.join(output,`${name}-${level}.glb`);
  if(!await stat(file).catch(()=>null)) {
    const run=spawnSync(path.join(home,'tools/gltfpack-1.3/gltfpack.exe'),['-i',from,'-o',file,'-c','-tw','-km','-tl','1024'],{encoding:'utf8'});
    if(run.status!==0) throw Error(run.stderr||run.stdout);
  }
  console.log(name,level,(await stat(file)).size);
  manifest[`${name}/${level}`]=await packageSharedGlb(file,output,`${name}-${level}`,1024);
  // Keep a reproducible derivative outside the repository as well.
  const archive=path.join(source,'../batch2/trees');await mkdir(archive,{recursive:true});await copyFile(file,path.join(archive,path.basename(file)));
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
