import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';

// Rasterize the real path/river vertex-color masks (exported from the source
// terrain_main evaluated mesh, same vertex order and UVs as terrain.glb) into
// a small UV-space grayscale texture pair. This lets the browser blend the
// three original materials with the exact masks the artist painted, instead
// of Batch3B's single pre-averaged bake.
function readGlb(buffer) {
  const jsonLen = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  return { json, binStart };
}
function readAccessor(json, buffer, binStart, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const start = binStart + (bv.byteOffset || 0);
  const compSize = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 }[acc.componentType];
  const numComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = bv.byteStride || numComp * compSize;
  const out = new Float32Array(acc.count * numComp);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < numComp; c++) {
      const off = start + i * stride + c * compSize;
      let v;
      if (acc.componentType === 5126) v = buffer.readFloatLE(off);
      else if (acc.componentType === 5123) v = buffer.readUInt16LE(off) / 65535;
      else if (acc.componentType === 5121) v = buffer.readUInt8(off) / 255;
      else if (acc.componentType === 5125) v = buffer.readUInt32LE(off);
      out[i * numComp + c] = v;
    }
  }
  return { data: out, numComp, count: acc.count };
}

const buffer = await readFile(path.resolve('public/forest-origin-assets/batch4/terrain/terrain-masks.glb'));
const { json, binStart } = readGlb(buffer);
const attrs = json.meshes[0].primitives[0].attributes;
const uv = readAccessor(json, buffer, binStart, attrs.TEXCOORD_0);
const pathMask = readAccessor(json, buffer, binStart, attrs.COLOR_1);
const riverMask = readAccessor(json, buffer, binStart, attrs.COLOR_2);
const indices = readAccessor(json, buffer, binStart, json.meshes[0].primitives[0].indices);

const size = 1024;
function rasterize(mask) {
  const canvas = new Float32Array(size * size);
  const weight = new Float32Array(size * size);
  const triCount = indices.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices.data[t * 3], i1 = indices.data[t * 3 + 1], i2 = indices.data[t * 3 + 2];
    const u0 = uv.data[i0 * 2] * size, v0 = (1 - uv.data[i0 * 2 + 1]) * size;
    const u1 = uv.data[i1 * 2] * size, v1 = (1 - uv.data[i1 * 2 + 1]) * size;
    const u2 = uv.data[i2 * 2] * size, v2 = (1 - uv.data[i2 * 2 + 1]) * size;
    const m0 = mask.data[i0 * 4], m1 = mask.data[i1 * 4], m2 = mask.data[i2 * 4];
    const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(u0, u1, u2)));
    const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(v0, v1, v2)));
    const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(area) < 1e-6) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((u1 - px) * (v2 - py) - (u2 - px) * (v1 - py)) / area;
        const w1 = ((u2 - px) * (v0 - py) - (u0 - px) * (v2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
        const value = w0 * m0 + w1 * m1 + w2 * m2;
        canvas[y * size + x] = value;
        weight[y * size + x] = 1;
      }
    }
  }
  // Fill any unseeded texels (UV seams) from nearest seeded neighbor.
  for (let pass = 0; pass < 4; pass++) {
    let remaining = 0;
    for (let i = 0; i < weight.length; i++) if (weight[i] === 0) remaining++;
    if (remaining === 0) break;
    const next = canvas.slice();
    const nextWeight = weight.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        if (weight[idx] !== 0) continue;
        let sum = 0, count = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const nIdx = ny * size + nx;
          if (weight[nIdx] !== 0) { sum += canvas[nIdx]; count++; }
        }
        if (count > 0) { next[idx] = sum / count; nextWeight[idx] = 1; }
      }
    }
    canvas.set(next); weight.set(nextWeight);
  }
  return canvas;
}

const pathData = rasterize(pathMask);
const riverData = rasterize(riverMask);
const rgba = Buffer.alloc(size * size * 4);
for (let i = 0; i < size * size; i++) {
  rgba[i * 4] = Math.round(Math.min(1, Math.max(0, pathData[i])) * 255);
  rgba[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, riverData[i])) * 255);
  rgba[i * 4 + 2] = 0;
  rgba[i * 4 + 3] = 255;
}
const output = path.resolve('public/forest-origin-assets/batch4/terrain');
await mkdir(output, { recursive: true });
const webp = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).webp({ quality: 95, nearLossless: true }).toBuffer();
await writeFile(path.join(output, 'blend-masks.webp'), webp);
console.log({ bytes: webp.length, size });
