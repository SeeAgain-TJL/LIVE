import sharp from "sharp";
import path from "node:path";

// Crops/resizes actual Chrome screenshots; captions sit outside screenshot pixels.
const directory = path.resolve("artifacts-local/exterior-batch-1/after");
const names = ["rocky", "ocean", "ice", "gas", "ringed", "overview"];
const layers = [];
for (const [i, name] of names.entries()) {
  let picture = sharp(path.join(directory, `${name}-high.png`));
  if (name === "ringed") picture = picture.extract({ left: 450, top: 300, width: 1500, height: 1050 });
  else if (name !== "overview") picture = picture.extract({ left: 600, top: 240, width: 1200, height: 1000 });
  const left = 12 + (i % 3) * 612, top = 12 + Math.floor(i / 3) * 548;
  layers.push({ input: await picture.resize(600, 500, { fit: "contain", background: "#080d17" }).png().toBuffer(), left, top: top + 36 });
  layers.push({ input: Buffer.from(`<svg width="600" height="36"><text x="0" y="25" fill="#dbe6f5" font-family="sans-serif" font-size="22">${name.toUpperCase()} · HIGH · Chrome capture</text></svg>`), left, top });
}
await sharp({ create: { width: 1848, height: 1108, channels: 3, background: "#080d17" } }).composite(layers).png().toFile(path.join(directory, "contact-sheet.png"));
console.log(path.join(directory, "contact-sheet.png"));
