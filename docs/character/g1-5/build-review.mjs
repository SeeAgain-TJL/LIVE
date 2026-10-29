// Reproduce source crops and alignment evidence; never generates a character/model.
// Run from the repository root: node docs/character/g1-5/build-review.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(dir, 'source/turnaround-v1.png');
const out = path.join(dir, 'review');
await fs.mkdir(out, { recursive: true });
const views = [
  { id: 'front', label: '正面', crop: { left: 287, top: 18, width: 350, height: 700 }, crown: 61, floor: 695, centerX: 461 },
  { id: 'side', label: '侧面候选（非严格正侧）', crop: { left: 645, top: 30, width: 280, height: 689 }, crown: 80, floor: 687, centerX: 729 },
  { id: 'back', label: '背面', crop: { left: 906, top: 65, width: 314, height: 655 }, crown: 100, floor: 691, centerX: 1061 },
];
// Manual visual estimates, not anatomical measurements. Coordinates use the source PNG.
const landmarks = [
  { name: '头发冠顶', y: 61, confidence: '发型外轮廓估计；非裸头顶' },
  { name: '眼线', y: 114, confidence: '正面可见估计' },
  { name: '下巴', y: 148, confidence: '正面可见估计' },
  { name: '肩', y: 180, confidence: '肩点被发/袖部分遮挡' },
  { name: '腰', y: 265, confidence: '以腰饰附近估计，非骨盆/腰椎测量' },
  { name: '髋', y: 340, confidence: '衣物遮挡，推定线，待结构图确认' },
  { name: '膝', y: 480, confidence: '衣物遮挡，推定线，待结构图确认' },
  { name: '踝', y: 650, confidence: '鞋带附近估计，非赤足踝标定' },
  { name: '鞋底接地', y: 695, confidence: '不包含衣摆拖尾；非赤足身高' },
];
const W = 1500, H = 1150, panelW = 430, panelH = 900;
const targetCrown = 104, targetFloor = 864;
const layers = [];
const transforms = [];
for (const [index, v] of views.entries()) {
  const scale = (targetFloor - targetCrown) / (v.floor - v.crown);
  const width = Math.round(v.crop.width * scale);
  const height = Math.round(v.crop.height * scale);
  const x = Math.round(panelW / 2 - (v.centerX - v.crop.left) * scale);
  const y = Math.round(targetCrown - (v.crown - v.crop.top) * scale);
  const crop = await sharp(source).extract(v.crop).png().toBuffer();
  await fs.writeFile(path.join(out, `${v.id}-source-crop.png`), crop);
  const resized = await sharp(crop).resize(width, height, { fit: 'fill' }).png().toBuffer();
  // Uniform scale only (rounding at most a pixel); no warping or inpainting.
  const panel = await sharp({ create: { width: panelW, height: panelH, channels: 4, background: '#e8ebf2' } })
    .composite([{ input: resized, left: x, top: y }]).png().toBuffer();
  await fs.writeFile(path.join(out, `${v.id}-aligned.png`), panel);
  layers.push({ input: panel, left: 160 + index * 440, top: 170 });
  transforms.push({ ...v, scale, destination: { x, y, width, height }, note: 'Uniform crop resize + translation only. Does not correct perspective or anatomy.' });
}
const text = (x, y, content, size = 19, fill = '#dbe5f4') => `<text x="${x}" y="${y}" font-family="Microsoft YaHei, sans-serif" font-size="${size}" fill="${fill}">${content}</text>`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
svg += text(32, 42, 'G1.5 / 银蓝星灵 · 三视图比例对齐检查', 29);
svg += text(32, 80, '原图裁切 + 等比缩放；不是重绘三视图，不是 3D 渲染。侧面与隐藏结构仍需修订。', 20);
svg += text(32, 112, '青线：正面估计参考　橙虚线：髋 / 膝推定　冠顶不含狐耳，接地不含拖尾', 19);
views.forEach((v, i) => { svg += text(165 + i * 440, 152, v.label, 22); });
for (const l of landmarks) {
  const y = 170 + targetCrown + (l.y - 61) / (695 - 61) * (targetFloor - targetCrown);
  const uncertain = l.name === '髋' || l.name === '膝';
  const color = uncertain ? '#e79b2b' : '#148f9b';
  svg += `<line x1="152" y1="${y}" x2="1480" y2="${y}" stroke="${color}" stroke-opacity=".8" stroke-width="1.6" ${uncertain ? 'stroke-dasharray="7 6"' : ''}/>`;
  svg += text(20, y + 6, l.name, 18, uncertain ? '#ffc66a' : '#a3e4eb');
}
svg += text(32, 1110, '仅对齐冠顶与鞋底。其余线用于暴露偏差，不表示侧/背面关键点已经一致；邻近衣发重叠保留。', 19);
svg += '</svg>';
await sharp({ create: { width: W, height: H, channels: 4, background: '#101b2d' } })
  .composite([...layers, { input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(path.join(out, 'alignment-audit.png'));

const details = [
  { name: 'beauty-face', file: 'approved-beauty.png', box: { left: 478, top: 100, width: 188, height: 188 } },
  { name: 'sheet-face', file: 'turnaround-v1.png', box: { left: 0, top: 128, width: 314, height: 382 } },
  { name: 'front-head', file: 'turnaround-v1.png', box: { left: 389, top: 20, width: 146, height: 165 } },
  { name: 'side-head', file: 'turnaround-v1.png', box: { left: 677, top: 40, width: 130, height: 174 } },
  { name: 'back-head', file: 'turnaround-v1.png', box: { left: 997, top: 65, width: 128, height: 150 } },
];
for (const d of details) {
  await sharp(path.join(dir, 'source', d.file)).extract(d.box).png().toFile(path.join(out, `${d.name}.png`));
}
const manifest = {
  characterId: 'UOM-G01', baseline: 'G1-current-pair-v1', registeredAt: '2026-10-29',
  userDecision: 'Main art direction retained; G1.5 normalization and G2.1 base-model validation authorized.',
  sources: [],
  legacyReferences: 'Historical only; not additional visual input for current character.',
  alignment: { targetCrown, targetFloor, landmarks, transforms },
  details,
  limitations: ['Manual landmark estimates', 'Not orthographic redraw', 'Hidden anatomy not inferred as fact', 'No new model or 360-degree render'],
};
for (const file of ['approved-beauty.png', 'turnaround-v1.png']) {
  const bytes = await fs.readFile(path.join(dir, 'source', file));
  const metadata = await sharp(bytes).metadata();
  manifest.sources.push({ file: `source/${file}`, width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), origin: 'User supplied local PNG; unchanged copy', authorshipAndLicense: 'Not supplied; no independent rights determination' });
}
await fs.writeFile(path.join(dir, 'baseline.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Reference crops, alignment evidence and source hashes generated. No model generated.');
