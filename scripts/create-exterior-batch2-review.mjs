import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const run = process.argv[2];
if (!run || !/^[a-z0-9-]+$/.test(run)) throw Error("Specify a Batch 2 visual run label");
const batch = process.env.EXTERIOR_REVIEW_BATCH === "2.1" ? "exterior-batch-2.1" : "exterior-batch-2";
const source = path.join("artifacts-local", batch, run);
const output = process.argv.slice(3).find(arg => arg !== "--quick") ?? path.join(source, "review");
const quick = process.argv.includes("--quick");
await mkdir(output, { recursive: true });
const types = ["rocky", "ocean", "ice", "gas", "ringed"];
const angles = quick ? ["back", "near"] : ["front", "side", "back", "near"];
const cell = { width: 430, height: 355, caption: 28 };

async function sheet(name, rows) {
  const layers = [];
  for (const [y, row] of rows.entries()) for (const [x, entry] of row.entries()) {
    const left = x * cell.width, top = y * cell.height;
    // Crop actual Chrome pixels to the centered planet. Keep more width for rings.
    const crop = entry.file.includes("ringed")
      ? { left: 510, top: 236, width: 1380, height: 1028 }
      : { left: 668, top: 252, width: 1064, height: 996 };
    const picture = await sharp(path.join(source, entry.file + ".png"))
      .extract(crop).resize(cell.width, cell.height - cell.caption, { fit: "contain", background: "#090d17" }).png().toBuffer();
    const caption = Buffer.from(`<svg width="${cell.width}" height="${cell.caption}"><text x="12" y="19" fill="#e8eef8" font-family="Arial" font-size="15">${entry.label}</text></svg>`);
    layers.push({ input: picture, left, top: top + cell.caption }, { input: caption, left, top });
  }
  await sharp({ create: { width: rows[0].length * cell.width, height: rows.length * cell.height, channels: 3, background: "#090d17" } })
    .composite(layers).webp({ quality: 90 }).toFile(path.join(output, name + ".webp"));
}

for (const type of types) {
  await sheet(type, ["before", "after"].map(version =>
    angles.map(angle => ({ file: `${version}-${angle}-${type}`, label: `${version} / ${type} / ${angle}` }))));
}
if (!quick && batch !== "exterior-batch-2.1") for (const tier of ["medium", "low"]) {
  await sheet(tier, [types.map(type => ({ file: `after-near-${type}-${tier}`, label: `${tier} / ${type} / near` }))]);
}

if (!quick && batch === "exterior-batch-2.1") {
  await sheet("tiers", types.map(type => ["high", "medium", "low"].map(tier => ({
    file: `after-near-${type}${tier === "high" ? "" : "-" + tier}`, label: `${type} / ${tier} / near`,
  }))));
}
