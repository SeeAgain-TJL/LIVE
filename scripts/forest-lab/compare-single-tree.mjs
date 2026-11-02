import path from "node:path";
import sharp from "sharp";

const root = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "single-tree");
const labels = ["Blender source", "WebGL previous decimation", "WebGL complete tree (BLEND)"];
for (const view of ["near", "mid"]) {
  const names = [`blender-${view}.png`, `webgl-previous-cut-${view}.png`, `webgl-original-blend-${view}.png`];
  const width = 1440;
  const height = 900;
  const bar = 48;
  const labelImage = Buffer.from(`<svg width="${width * 3}" height="${bar}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#13201f"/>${labels.map((label, index) => `<text x="${index * width + 28}" y="32" font-family="Arial" font-size="24" fill="#ffffff">${label}</text>`).join("")}</svg>`);
  await sharp({ create: { width: width * 3, height: height + bar, channels: 3, background: "#13201f" } })
    .composite([{ input: labelImage, top: 0, left: 0 }, ...names.map((name, index) => ({ input: path.join(root, name), top: bar, left: index * width }))])
    .png().toFile(path.join(root, `comparison-${view}.png`));
}
