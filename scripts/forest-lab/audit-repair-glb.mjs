import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const toolroot=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/tools/gltf-transform-batch2');
const require=createRequire(path.join(toolroot,'package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
await MeshoptDecoder.ready;
export const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const source=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion');
const files=[source+'/batch6/landmarks-source.glb','public/forest-origin-assets/batch6/landmarks.glb','public/forest-origin-assets/optimized/landmarks.glb',source+'/trees-realized/pine_02_unreduced.glb','public/forest-origin-assets/batch2/trees/pine_02-near.gltf','public/forest-origin-assets/optimized/pine_02.glb'];
const report=[];
for(const file of files){
 const d=await io.read(file);const meshes=d.getRoot().listMeshes().map(m=>({name:m.getName(),parts:m.listPrimitives().map(p=>{
  const uv=p.getAttribute('TEXCOORD_0'),bounds=uv ? {min:uv.getMinNormalized([]),max:uv.getMaxNormalized([])}:null;
  const mat=p.getMaterial();return {material:mat?.getName(),triangles:p.getIndices().getCount()/3,uv:bounds,alpha:mat?.getAlphaMode(),alphaCutoff:mat?.getAlphaCutoff(),transform:mat?.getBaseColorTextureInfo()?.getExtension('KHR_texture_transform')?.getScale()};
 })}));
 report.push({file,meshes});console.log(file,JSON.stringify(meshes));
}
await mkdir('artifacts-local/pine-scene-repair',{recursive:true});await writeFile('artifacts-local/pine-scene-repair/glb-audit.json',JSON.stringify(report,null,2));
