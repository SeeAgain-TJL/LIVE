// Prepare local review links and checksums, without copying binary assets to Git.
// Run: node scripts/blender/package-assets.mjs EXTERNAL_ASSET_DIRECTORY
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw new Error('Supply the existing external asset directory.');
const root = path.resolve(process.argv[2]);
const repo = path.resolve(scriptDir, '../..');
if (root === repo || root.startsWith(repo + path.sep)) {
  throw new Error('The asset package must remain outside the repository.');
}
const draft = 'silver-spirit-draft01';
const required = [
  `${draft}/${draft}.blend`, `${draft}/${draft}.glb`,
  `${draft}/front.png`, `${draft}/side.png`, `${draft}/back.png`,
  `${draft}/three-quarter.png`, `${draft}/head-front.png`,
  `${draft}/head-side.png`, `${draft}/head-three-quarter.png`,
  `${draft}/turntable-draft01.mp4`, `${draft}/draft-report.json`,
  `${draft}/verification.json`, 'pipeline-test/smoke-report.json',
  'pipeline-test/pipeline-test.blend', 'pipeline-test/pipeline-test.vrm',
  'pipeline-test/test-front.png', 'pipeline-test/test-side.png', 'pipeline-test/test-back.png',
];
const assets = [];
for (const name of required) {
  const data = await fs.readFile(path.join(root, name));
  if (!data.length) throw new Error(`Empty asset: ${name}`);
  assets.push({ file: name, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
const manifest = {
  characterId: 'UOM-G01', stage: 'G2.1', version: 'draft01',
  status: 'Procedural base study, NOT visually approved',
  blender: '4.2.23 LTS', addon: '4.10.2', assets,
  storage: 'Local external directory only; no remote backup or Git LFS configured',
};
await fs.writeFile(path.join(root, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.copyFile(path.join(scriptDir, 'review-template.html'), path.join(root, 'review.html'));
const launcher = `@echo off\r\nsetlocal\r\nset "UOM_BLENDER=%LOCALAPPDATA%\\UNIVERSE-OF-ME\\tools\\blender-4.2.23-windows-x64"\r\nset "BLENDER_USER_CONFIG=%UOM_BLENDER%\\4.2\\config"\r\nif not exist "%UOM_BLENDER%\\blender.exe" (\r\n echo Blender portable not found.\r\n pause\r\n exit /b 1\r\n)\r\nstart "" "%UOM_BLENDER%\\blender.exe" "%~dp0${draft}\\${draft}.blend"\r\n`;
await fs.writeFile(path.join(root, 'Open silver spirit draft.cmd'), launcher);
await fs.writeFile(path.join(root, 'README.txt'), [
  'UNIVERSE OF ME / Silver Spirit / G2.1 procedural base study 01',
  'NOT final character art. Face, eyes, hair, ears, hands and garment require manual refinement.',
  '',
  'Open review.html to view actual renders and the 4-second turntable.',
  'Double-click Open silver spirit draft.cmd to open the editable Blender project.',
  'The .blend packs the two user baseline images as non-rendering references.',
  'The .glb is a static model, not a rigged VRM.',
  'pipeline-test contains only a technical mannequin for VRM import/export validation.',
  '',
  'Before hand editing, use Save As in Blender to create a NEW version.',
  'Generated scripts must not overwrite a hand-edited project.',
  'Models, tools and movies are outside normal Git history. Back up this folder separately.',
  'asset-manifest.json records SHA-256 values for the current generated delivery.',
  '',
  `Source scripts and detailed limitations: ${path.join(repo, 'docs/character/g2-1/README.md')}`,
].join('\r\n') + '\r\n');
console.log(`Packaged ${assets.length} existing assets at ${root}; no model binaries copied into Git.`);
