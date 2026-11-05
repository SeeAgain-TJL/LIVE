// Downloads the CC BY "Pine trees pack (lowpoly, game ready, LODs)" by LOLIPOP from Sketchfab.
// Needs a free Sketchfab API token in SKETCHFAB_TOKEN (Settings > Password & API). The token is never printed or stored.
// Output: artifacts-local/pine-sketchfab/source/ (ignored by Git). Credit the author wherever the trees ship.
import { mkdir, writeFile } from 'node:fs/promises';
const token = process.env.SKETCHFAB_TOKEN;
if (!token) throw Error('Set SKETCHFAB_TOKEN first');
const uid = 'e1e9c07b8e2e445c943fec660beefba2';
const headers = { Authorization: `Token ${token}` };
const info = await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, { headers });
if (!info.ok) throw Error(`Sketchfab download lookup HTTP ${info.status}`);
const formats = await info.json();
const pick = formats.gltf ?? formats.source;
if (!pick) throw Error('No glTF or source archive offered: ' + Object.keys(formats).join(','));
const file = await fetch(pick.url);
if (!file.ok) throw Error(`Archive HTTP ${file.status}`);
await mkdir('artifacts-local/pine-sketchfab/source', { recursive: true });
const name = formats.gltf ? 'pine-pack-gltf.zip' : 'pine-pack-source.zip';
await writeFile(`artifacts-local/pine-sketchfab/source/${name}`, Buffer.from(await file.arrayBuffer()));
console.log({ saved: name, bytes: pick.size, offered: Object.keys(formats) });