// Pack the already authored LODs. No whole-tree simplification in this step.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const [authoring,...species]=process.argv.slice(2);
assert.ok(authoring && species.length,'Pass authoring directory and source tree names.');
const pack=process.env.GLTFPACK || path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/tools/gltfpack-1.3/gltfpack.exe');
const output='public/forest-origin-assets/tree-rebuild';
await mkdir(output,{recursive:true});
const source=JSON.parse(await readFile(path.join(authoring,'production.json'),'utf8'));
const report={};
for(const name of species) {
 assert.match(name,/^(?:pine|silver_fir)_0[1-6]$/);
 assert.ok(source[name],`Missing Blender report for ${name}`);
 report[name]={};
 for(const tier of ['near','mid','far']) {
  const basename=`${name}-${tier}.glb`;
  const destination=path.join(output,basename);
  const result=spawnSync(pack,['-i',path.join(authoring,basename),'-o',destination,'-c','-tw','-km','-vp','16','-vt','16'],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(result.stderr || String(result.error));
  const glb=await readFile(destination);
  assert.equal(glb.toString('ascii',0,4),'glTF');
  const data=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  const primitives=data.meshes.flatMap(mesh=>mesh.primitives);
  const crown=primitives.find(p=>data.materials[p.material].name.includes(tier==='near' ? 'geometric_needles':'branch_cluster'));
  assert.ok(crown,`No ${tier} foliage primitive for ${name}`);
  if(tier==='near') {
   assert.ok(crown.attributes.COLOR_0!==undefined,`No source color on ${name} needles`);
   assert.equal(data.materials[crown.material].alphaMode,undefined);
  } else {
   assert.ok(crown.attributes.TEXCOORD_0!==undefined);
   assert.equal(data.materials[crown.material].alphaMode,'MASK');
  }
  const triangles=primitives.reduce((n,p)=>n+data.accessors[p.indices].count/3,0);
  report[name][tier]={bytes:glb.length,triangles,twigInstances:source[name][tier].twigInstances};
 }
 assert.ok(report[name].near.triangles>report[name].mid.triangles && report[name].mid.triangles>report[name].far.triangles);
}
await writeFile(path.join(authoring,'packed.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);
