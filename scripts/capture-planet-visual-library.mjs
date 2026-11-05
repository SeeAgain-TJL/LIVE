import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { visualPresets } from "../src/components/three/visual-library.ts";

const label = process.argv[2] ?? "gallery";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a new lowercase capture label");
const root = "artifacts-local/planet-visual-library-v1";
const output = `${root}/${label}`;
const url = process.env.EXTERIOR_AFTER_URL ?? "http://127.0.0.1:3359";
await mkdir(root, { recursive: true });
await mkdir(output);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1480, height: 1050 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
const errors = [], images = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
try {
  await page.goto(`${url}/planet-visual-library`, { waitUntil: "networkidle" });
  const area = page.locator(".pvl-viewport");
  const view = name => page.getByRole("group", { name: "观测视角" }).getByRole("button", { name, exact: true }).click();
  const tier = name => page.getByRole("group", { name: "画质" }).getByRole("button", { name, exact: true }).click();
  const ready = () => page.locator('.pvl-viewport[data-visual-status="ready"]').waitFor({ timeout: 15000 });
  await ready();
  await page.screenshot({ path: `${output}/gallery.png`, fullPage: true });
  async function capture(id, state, angle) {
    await ready();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = `${output}/${id}-${state}-${angle}.png`;
    await area.screenshot({ path: file });
    images.push({ id, state, angle, file });
  }
  for (const preset of visualPresets) {
    await page.locator(`[data-preset="${preset.id}"]`).click();
    await tier("高");
    for (const [name, angle] of [["正面", "front"], ["侧面", "side"], ["背光", "back"], ["近景", "near"], ["远景", "far"]]) {
      await view(name);
      await capture(preset.id, "high", angle);
    }
    await view("近景");
    for (const [name, state] of [["中", "medium"], ["低", "low"]]) {
      await tier(name);
      await capture(preset.id, state, "near");
    }
    console.log(preset.id, "7 Chrome images");
  }

  async function sheet(name, columns) {
    const width = 270, height = 164, labelHeight = 21;
    const labels = visualPresets.map((p, i) => `<text x="10" y="${i * (height + labelHeight) + 15}">${String(i + 1).padStart(2, "0")}   ${p.id.toUpperCase()}   /   ${columns.map(([t,a]) => `${t.toUpperCase()} ${a.toUpperCase()}`).join("    ·    ")}</text>`).join("");
    const fullWidth = width * columns.length, fullHeight = (height + labelHeight) * visualPresets.length;
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fullWidth}" height="${fullHeight}"><g font-family="monospace" font-size="10" fill="#c3ccd9">${labels}</g></svg>`);
    const cells = [];
    for (const [row,preset] of visualPresets.entries()) for (const [col,[t,a]] of columns.entries()) {
      const file = images.find(img => img.id === preset.id && img.state === t && img.angle === a)?.file;
      cells.push({ input: await sharp(file).resize(width - 2, height - 2).png().toBuffer(), left: col * width + 1, top: row * (height + labelHeight) + labelHeight });
    }
    await sharp({ create: { width: fullWidth, height: fullHeight, channels: 3, background: "#080b13" } })
      .composite([...cells, { input: overlay, top: 0, left: 0 }]).jpeg({ quality: 90 }).toFile(`${output}/${name}.jpg`);
  }
  await sheet("angles", ["front", "side", "back", "near", "far"].map(a => ["high", a]));
  await sheet("tiers", ["high", "medium", "low"].map(t => [t, "near"]));
} finally {
  await writeFile(`${output}/capture.json`, JSON.stringify({ chrome: browser.version(), url, errors, images }, null, 2) + "\n");
  await browser.close();
}
if (errors.length) { console.error(errors); process.exitCode = 1; }
