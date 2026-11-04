// Decode existing LODs for Blender import; no geometry simplification or shading experiments.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const runtime=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/tools/gltf-transform-batch2');
const require=createRequire(path.join(runtime,'package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {MeshoptDecoder}=await import('three/examples/jsm/libs/meshopt_decoder.module.js');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const out=path.resolve('artifacts-local/pine-batch5/blender-inputs');await mkdir(out,{recursive:true});
for(const species of ['pine_01','pine_02','pine_03','pine_04','pine_05','silver_fir_01','silver_fir_02','silver_fir_03','silver_fir_04','silver_fir_05','silver_fir_06','props']) {
 const input=species==='props' ? 'batch2/props-mid.gltf':`batch2/trees/${species}-near.gltf`;
 const document=await io.read(path.resolve('public/forest-origin-assets',input));
 for(const extension of document.getRoot().listExtensionsUsed()) if(['EXT_meshopt_compression','EXT_texture_webp'].includes(extension.extensionName))extension.dispose();
 for(const texture of document.getRoot().listTextures()) {texture.setImage(await sharp(texture.getImage()).png().toBuffer());texture.setMimeType('image/png');}
 await io.write(path.join(out,species+'.glb'),document);console.log(species);
}
