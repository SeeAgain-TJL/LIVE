import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets");
const output = path.join(root, "pine-runtime", "textures");
const names = [
  "pine_bark_diff", "pine_bark_nor_gl", "pine_bark_rough",
  "pine_trunk_01_diff", "pine_trunk_01_nor_gl", "pine_trunk_01_rough",
  "pine_trunk_02_diff", "pine_trunk_02_nor_gl", "pine_trunk_02_rough",
  "pine_twig_diff", "pine_twig_nor_gl", "pine_twig_rough", "pine_twig_alpha",
  "fir_bark_diff", "fir_bark_nor_gl", "fir_bark_rough",
  "fir_twig_diff", "fir_twig_nor_gl", "fir_twig_rough", "fir_twig_alpha",
  "rock_moss_set_01_diff", "rock_moss_set_01_nor_gl", "rock_moss_set_01_rough",
  "fern_02_diff", "fern_02_nor_gl", "fern_02_rough", "fern_02_alpha",
];

await mkdir(output, { recursive: true });
for (const name of names) {
  const input = path.join(root, "textures", `${name}.png`);
  const destination = path.join(output, `${name}.${name.endsWith("alpha") ? "png" : "jpg"}`);
  const image = sharp(input, { limitInputPixels: false }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true });
  if (name.endsWith("alpha")) await image.png({ compressionLevel: 9 }).toFile(destination);
  else await image.jpeg({ quality: name.endsWith("diff") ? 88 : 83, mozjpeg: true }).toFile(destination);
  console.log(name, destination);
}
