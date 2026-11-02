import path from "node:path";
import sharp from "sharp";

const root = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets");
const images = [path.join(root, "pine-source-camera-1440.png"),
  path.join(root, "pine-evidence", "production-medium-same-camera.png"),
  path.join(root, "source-forest-evidence", "source-camera.png")];
const labels = ["Blender source (Cycles 2 samples)", "Previous WebGL (green proxies)", "Source-tree WebGL partial conversion"];
const width = 1440;
const height = 900;
const bar = 48;
const labelImage = Buffer.from(`<svg width="${width * 3}" height="${bar}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#13201f"/>${labels.map((label, index) => `<text x="${index * width + 28}" y="32" font-family="Arial" font-size="22" fill="#ffffff">${label}</text>`).join("")}</svg>`);
await sharp({ create: { width: width * 3, height: height + bar, channels: 3, background: "#13201f" } })
  .composite([{ input: labelImage, top: 0, left: 0 }, ...images.map((input, index) => ({ input, top: bar, left: index * width }))])
  .png().toFile(path.join(root, "source-forest-evidence", "blender-vs-previous-vs-source-trees.png"));
