import path from "node:path";
import sharp from "sharp";

const root = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets");
const source = path.join(root, "pine-source-camera-1440.png");
const browser = path.join(root, "pine-evidence", "production-medium-same-camera.png");
const output = path.join(root, "pine-evidence", "blender-vs-webgl-same-camera.png");
const label = `<svg width="2880" height="82" xmlns="http://www.w3.org/2000/svg">
<rect width="2880" height="82" fill="#101717"/>
<text x="24" y="37" fill="#f3f1e9" font-size="26" font-family="Arial">BLENDER 4.4.3 / CYCLES / SOURCE CAMERA</text>
<text x="24" y="65" fill="#aebdb5" font-size="17" font-family="Arial">Local 2-sample render, fog composite disabled; not the full-quality official render</text>
<text x="1464" y="37" fill="#f3f1e9" font-size="26" font-family="Arial">THREE.JS / CHROME / SOURCE CAMERA</text>
<text x="1464" y="65" fill="#aebdb5" font-size="17" font-family="Arial">Production build, medium quality, Intel integrated graphics, 1440 x 900 / DPR 1</text>
</svg>`;
await sharp({ create: { width: 2880, height: 982, channels: 4, background: "#101717" } })
  .composite([{ input: await sharp(source).png().toBuffer(), left: 0, top: 82 },
    { input: await sharp(browser).png().toBuffer(), left: 1440, top: 82 },
    { input: Buffer.from(label), left: 0, top: 0 }])
  .png().toFile(output);
console.log(output);
