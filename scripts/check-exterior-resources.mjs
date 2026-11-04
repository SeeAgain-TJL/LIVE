import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { createSeed } from "../src/data/seed.ts";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { date: new Date().toISOString(), browser: browser.version(), cases: [], failures: [] };
try {
  for (const count of [5, 20, 50]) {
    const fixture = createSeed(), seeds = fixture.planets;
    fixture.planets = Array.from({ length: count }, (_, i) => ({ ...seeds[i % 5], id: `resource-example-${i}`, name: `资源验收示例 ${i + 1}`, isDemo: false, appearance: { ...seeds[i % 5].appearance, seed: seeds[i % 5].appearance.seed + Math.floor(i / 5) * 101 } }));
    const raw = JSON.stringify(fixture);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    await context.addInitScript(raw => {
      localStorage.setItem("universe-of-me:data:v1", raw);
      localStorage.setItem("universe-of-me:cosmic-quality:v1", "high");
      window.__resourceContexts = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = getContext.apply(this, args);
        if (gl && args[0] === "webgl2" && !gl.__tracked) {
          gl.__tracked = true;
          const stats = { texture: 0, buffer: 0, program: 0, createdTexture: 0, deletedTexture: 0, lost: false };
          window.__resourceContexts.push(stats);
          this.addEventListener("webglcontextlost", () => { stats.lost = true; });
          for (const kind of ["Texture", "Buffer", "Program"]) {
            const live = new WeakSet(), key = kind.toLowerCase();
            const create = gl[`create${kind}`].bind(gl), remove = gl[`delete${kind}`].bind(gl);
            gl[`create${kind}`] = (...args) => { const value = create(...args); if (value) { live.add(value); stats[key]++; if (kind === "Texture") stats.createdTexture++; } return value; };
            gl[`delete${kind}`] = value => { if (value && live.delete(value)) { stats[key]--; if (kind === "Texture") stats.deletedTexture++; } return remove(value); };
          }
        }
        return gl;
      };
    }, raw);
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on("pageerror", e => report.failures.push({ count, message: e.message }));
    await page.goto("http://127.0.0.1:3321/galaxy/unclassified");
    const wait = async tier => {
      await page.waitForFunction(({ tier, count }) => {
        const c = document.querySelector("canvas"), s = JSON.parse(c?.dataset.exteriorTextures ?? "{}");
        return c?.dataset.exteriorReady === "true" && s.total === count && JSON.parse(c.dataset.renderMetrics ?? "{}").tier === tier;
      }, { tier, count }, { timeout: 120000 });
      await page.waitForTimeout(1400);
    };
    const snapshot = async tier => {
      await cdp.send("HeapProfiler.collectGarbage");
      return page.evaluate(tier => {
        const c = document.querySelector("canvas");
        return { tier, metrics: JSON.parse(c.dataset.renderMetrics), pipeline: JSON.parse(c.dataset.exteriorTextures), gl: window.__resourceContexts, heapBytes: performance.memory.usedJSHeapSize };
      }, tier);
    };
    const samples = [];
    await wait("high"); samples.push(await snapshot("high"));
    for (const tier of ["low", "medium", "high", "low", "medium", "high", "low", "medium", "high"]) {
      await page.evaluate(tier => { localStorage.setItem("universe-of-me:cosmic-quality:v1", tier); window.dispatchEvent(new Event("cosmic-quality")); }, tier);
      await wait(tier); samples.push(await snapshot(tier));
    }
    // Cancel in-flight uncached work, then unmount the exterior through the real client link.
    for (const tier of ["medium", "low", "high", "medium"]) {
      await page.evaluate(tier => { localStorage.setItem("universe-of-me:cosmic-quality:v1", tier); window.dispatchEvent(new Event("cosmic-quality")); }, tier);
      await page.waitForTimeout(40);
    }
    await page.getByRole("link", { name: "← 返回宇宙星系", exact: true }).click();
    await page.waitForURL("http://127.0.0.1:3321/");
    await page.waitForTimeout(6500); // R3F deferred cleanup and pipeline idle termination.
    await cdp.send("HeapProfiler.collectGarbage");
    const unmounted = await page.evaluate(raw => ({ gl: window.__resourceContexts, heapBytes: performance.memory.usedJSHeapSize, archiveUnchanged: localStorage.getItem("universe-of-me:data:v1") === raw }), raw);
    for (const tier of ["low", "medium", "high"]) {
      // Initial high can compile one fewer variant before the first full quality cycle.
      // Retain it in the report; assert stability across every subsequent repeated tier.
      const group = samples.slice(1).filter(s => s.tier === tier), last = group.at(-1);
      // Compare settled repeated tiers, including actual GL allocations, not just scene membership.
      for (const s of group) {
        for (const field of ["textures", "geometries", "programs"]) if (s.metrics[field] !== last.metrics[field]) report.failures.push({ count, tier, field, first: s.metrics[field], last: last.metrics[field] });
        if (s.pipeline.materials !== last.pipeline.materials || s.pipeline.cacheBytes > 32 * 1024 * 1024) report.failures.push({ count, tier, error: "material/cache growth" });
        for (const field of ["texture", "buffer", "program"]) if (s.gl[0][field] !== last.gl[0][field]) report.failures.push({ count, tier, field, error: "GL allocation growth", first: s.gl[0][field], last: last.gl[0][field] });
      }
    }
    if (!unmounted.archiveUnchanged) report.failures.push({ count, error: "archive changed" });
    if (!unmounted.gl[0].lost && unmounted.gl[0].texture > 0) report.failures.push({ count, error: "exterior context did not release textures" });
    report.cases.push({ count, samples, unmounted });
    await fs.writeFile("docs/exterior-batch-1.1/resources.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ count, failures: report.failures, high: samples.at(-1), unmounted }));
    await context.close();
  }
} finally { await browser.close(); }
if (report.failures.length) process.exitCode = 1;
