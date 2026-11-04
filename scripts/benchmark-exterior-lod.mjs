import { chromium } from "@playwright/test";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { createSeed } from "../src/data/seed.ts";
import { stellarSource } from "../src/domain/spatial-scene.ts";
import { Vector3 } from "three";

const label = process.argv[2] ?? "paired";
if (!/^[a-z0-9-]+$/.test(label)) throw Error("Use a new lowercase run label");
const urls = {
  before: process.env.EXTERIOR_BEFORE_URL ?? "http://127.0.0.1:3322",
  after: process.env.EXTERIOR_AFTER_URL ?? "http://127.0.0.1:3323",
};
const batch21 = process.env.EXTERIOR_REVIEW_BATCH === "2.1";
const batch2 = batch21 || process.env.EXTERIOR_REVIEW_BATCH === "2";
const batch = batch21 ? "exterior-batch-2.1" : batch2 ? "exterior-batch-2" : "exterior-batch-1.2";
const output = path.posix.join("artifacts-local", batch, label);
const docs = `docs/${batch}`;
await mkdir(docs, { recursive: true });
await mkdir(path.posix.dirname(output), { recursive: true });
await mkdir(output); // Refuse to overwrite any earlier run.
const rawPath = `${docs}/${label}.ndjson.gz`;
await writeFile(rawPath, Buffer.alloc(0), { flag: "wx" });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const root = await browser.newBrowserCDPSession();
const viewport = { width: 1600, height: 1000 };
const report = { date: new Date().toISOString(), baseline: batch21 ? "713fe73" : batch2 ? "4d9e9e0" : "1b41f5f", chrome: browser.version(), urls, viewport, dpr: 1.5, cpu: os.cpus()[0].model,
  ramBytes: os.totalmem(), gpu: (await root.send("SystemInfo.getInfo")).gpu, cases: [], images: [], failures: [] };

// Split GPU timers when the first draw switches between the nebula FBO and the
// default framebuffer. BLEND draws include stars, orbits and nebula composite.
async function install(context, config) {
  await context.addInitScript(({ raw, tier, bookmark }) => {
    if (location.pathname === "/galaxy/unclassified") {
      localStorage.setItem("universe-of-me:data:v1", raw);
      localStorage.setItem("universe-of-me:cosmic-quality:v1", tier);
      localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(bookmark));
      localStorage.setItem("universe-of-me:travel:v1", "fast");
    }
    const probe = window.__lodProbe = { first: null, ready: null, frames: [], gpu: [], tasks: [], disjoint: 0, lastExterior: null, visibility: [] };
    document.addEventListener("visibilitychange", () => probe.visibility.push([performance.now(), document.visibilityState]));
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) probe.tasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
    let frame, previous, active;
    const contexts = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => {
      frame = { time, draws: 0, blend: 0, offscreen: 0 };
      for (const ctx of contexts) {
        const { gl, ext, pending } = ctx;
        if (!pending.length) continue;
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          for (const q of pending.splice(0)) gl.deleteQuery(q.query);
          probe.disjoint++;
        }
        while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
          const q = pending.shift();
          probe.gpu.push([q.time, q.pass, gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6]);
          gl.deleteQuery(q.query);
        }
      }
      const start = performance.now();
      try { callback(time); } finally {
        const cpu = performance.now() - start;
        if (active) { active.gl.endQuery(active.ext.TIME_ELAPSED_EXT); active = undefined; }
        if (frame.draws && time !== previous) {
          probe.frames.push([time, previous === undefined ? null : time - previous, cpu, frame.draws, frame.blend, frame.offscreen]);
          previous = time;
          const canvas = document.querySelector(".universe-canvas canvas");
          if (canvas) {
            const data = canvas.dataset;
            // Both versions set travelPhase from CameraRig with mounted controls.
            if (probe.first === null && data.travelPhase === "idle" && document.querySelector(".planet-label")) probe.first = performance.now();
            if (probe.ready === null && data.exteriorReady === "true") {
              const s = JSON.parse(data.exteriorTextures ?? "{}");
              // This fixture starts in view. Never accept a transient zero-target
              // sample before the LOD planner has committed visible requests.
              if (s.targets === undefined || (s.targets > 0 && s.pending === 0 && s.targets === s.resident.low + s.resident.medium + s.resident.high)) {
                probe.ready = performance.now();
              }
            }
            if (data.exteriorTextures) probe.lastExterior = data.exteriorTextures;
          }
        }
        frame = undefined;
      }
    });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = getContext.apply(this, args);
      if (!gl || args[0] !== "webgl2" || contexts.some(ctx => ctx.gl === gl)) return gl;
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const ctx = { gl, ext, pending: [] };
      contexts.push(ctx);
      let framebuffer = null, blend = false;
      const bind = gl.bindFramebuffer.bind(gl);
      gl.bindFramebuffer = (target, value) => {
        if (target !== gl.READ_FRAMEBUFFER) framebuffer = value;
        return bind(target, value);
      };
      for (const [method, value] of [["enable", true], ["disable", false]]) {
        const original = gl[method].bind(gl);
        gl[method] = cap => { if (cap === gl.BLEND) blend = value; return original(cap); };
      }
      for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
        const draw = gl[method].bind(gl);
        gl[method] = (...args) => {
          if (frame) {
            const pass = framebuffer ? "offscreen" : "main";
            frame.draws++; frame.blend += +blend; frame.offscreen += +(pass === "offscreen");
            if (ext && (!active || active.pass !== pass)) {
              if (active) { active.gl.endQuery(active.ext.TIME_ELAPSED_EXT); active = undefined; }
              if (ctx.pending.length < 12) {
                const query = gl.createQuery();
                if (query) {
                  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
                  ctx.pending.push({ time: frame.time, pass, query }); active = { gl, ext, pass };
                }
              }
            }
          }
          return draw(...args);
        };
      }
      return gl;
    };
  }, config);
}

const snapshot = page => page.evaluate(() => {
  const canvas = document.querySelector(".universe-canvas canvas");
  return { at: performance.now(), metrics: JSON.parse(canvas?.dataset.renderMetrics ?? "null"),
    exterior: JSON.parse(canvas?.dataset.exteriorTextures ?? window.__lodProbe.lastExterior ?? "null"),
    ready: canvas?.dataset.exteriorReady, phase: canvas?.dataset.travelPhase };
});
const waitReady = (page, tier) => page.waitForFunction(tier => {
  const d = document.querySelector(".universe-canvas canvas")?.dataset;
  if (d?.exteriorReady !== "true" || JSON.parse(d.renderMetrics ?? "{}").tier !== tier) return false;
  if (d.exteriorPlan === undefined) return true;
  const s = JSON.parse(d.exteriorTextures ?? "{}");
  return d.exteriorPlan === tier && s.targets > 0 && s.pending === 0 && s.targets === s.resident.low + s.resident.medium + s.resident.high;
}, tier, { timeout: 65_000 });
const round = v => Number.isFinite(v) ? +v.toFixed(3) : null;
function distribution(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? { n: a.length, mean: round(a.reduce((n, v) => n + v, 0) / a.length), p95: round(a[Math.ceil(a.length * .95) - 1]), max: round(a.at(-1)) } : { n: 0, mean: null, p95: null, max: null };
}
function summarize(probe, start, end) {
  const frames = probe.frames.filter(row => row[0] >= start && row[0] <= end);
  const gpu = probe.gpu.filter(row => row[0] >= start && row[0] <= end);
  const tasks = probe.tasks.filter(row => row[0] >= start && row[0] <= end);
  const frame = distribution(frames.map(row => row[1]));
  const combined = new Map();
  for (const [time, , ms] of gpu) combined.set(time, (combined.get(time) ?? 0) + ms);
  return { fps: frame.mean === null ? null : round(1000 / frame.mean), frame, cpu: distribution(frames.map(row => row[2])),
    gpu: distribution([...combined.values()]), gpuMain: distribution(gpu.filter(row => row[1] === "main").map(row => row[2])),
    gpuOffscreen: distribution(gpu.filter(row => row[1] === "offscreen").map(row => row[2])),
    draws: distribution(frames.map(row => row[3])), blendedDraws: distribution(frames.map(row => row[4])),
    offscreenDraws: distribution(frames.map(row => row[5])), tasks: distribution(tasks.map(row => row[1])) };
}
const phases = { front: 29, side: 89, back: 151, near: 61 };
function fixture(count, closeType, phase) {
  const f = createSeed(), seeds = f.planets;
  if (closeType) {
    const p = seeds.find(p => p.appearance.type === closeType);
    f.planets = [{ ...p, id: "lod-close", name: "近景外观示例", isDemo: false, position: [0, 0, 0] }];
    const r = p.appearance.size;
    if (phase) {
      const sun = new Vector3(...stellarSource(f.planets).position).normalize();
      const up = new Vector3(0, .22, 1);
      const tangent = up.addScaledVector(sun, -up.dot(sun)).normalize();
      const angle = phases[phase] * Math.PI / 180;
      const direction = sun.multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle));
      const distance = p.appearance.rings ? phase === "near" ? 6.65 : 8.25 : phase === "near" ? 3.75 : 6;
      return { raw: JSON.stringify(f), bookmark: { position: direction.multiplyScalar(r * distance).toArray(), target: [0, 0, 0] } };
    }
    return { raw: JSON.stringify(f), bookmark: { position: [-r * 4, r * 3, r * 5.8], target: [0, 0, 0] } };
  }
  f.planets = Array.from({ length: count }, (_, i) => {
    const p = seeds[i % 5], row = Math.floor(i / 10), col = i % 10;
    return { ...p, id: `lod-example-${i}`, name: `外观压力示例 ${i + 1}`, isDemo: false, description: "隔离外观压力样本，不代表用户经历。",
      appearance: { ...p.appearance, seed: p.appearance.seed + Math.floor(i / 5) * 101, size: p.appearance.size * .7 },
      position: count === 5 ? p.position : [(col - 4.5) * 7, (row - (Math.ceil(count / 10) - 1) / 2) * 7, Math.sin(i * 2.4) * 4] };
  });
  return { raw: JSON.stringify(f), bookmark: count === 5 ? { position: [0, 12, 42], target: [-2, 0, -3] } : { position: [0, 13, 105], target: [0, 0, 0] } };
}

async function save() { await writeFile(`${docs}/${label}.json`, JSON.stringify(report, null, 2) + "\n"); }
async function run(version, count, tier, iteration, closeType, phase) {
  const name = closeType ? `${version}-${phase ?? "near"}-${closeType}${tier === "high" ? "" : `-${tier}`}` : `${version}-${count}-${tier}-r${iteration}`;
  const { raw, bookmark } = fixture(count, closeType, phase);
  const context = await browser.newContext({ viewport, deviceScaleFactor: report.dpr, reducedMotion: closeType ? "reduce" : "no-preference" });
  await install(context, { raw, tier, bookmark });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  const systemStart = { free: os.freemem(), cpus: os.cpus().map(c => c.times) };
  const windows = {};
  async function measure(stage, action) {
    const start = await snapshot(page);
    const detail = await action();
    const end = await snapshot(page);
    windows[stage] = { start, end, detail, elapsedMs: round(end.at - start.at) };
  }
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(`${urls[version]}/galaxy/unclassified`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__lodProbe.first !== null && window.__lodProbe.ready !== null, null, { timeout: 65_000 });
    await waitReady(page, tier);
    const cold = await snapshot(page);
    if (iteration === 1 || closeType) {
      const file = `${output}/${name}.png`;
      await page.screenshot({ path: file });
      report.images.push({ file, name, sample: cold, ...(phase && { bookmark, phaseDegrees: phases[phase] }) });
    }
    if (!closeType) {
      const bounds = await page.locator(".universe-canvas canvas").boundingBox();
      const x = bounds.x + bounds.width * .72, y = bounds.y + bounds.height * .72;
      const point = () => page.locator(".planet-label").first().evaluate(node => {
        const { x, y, width, height } = node.getBoundingClientRect(); return [x + width / 2, y + height / 2];
      });
      const moved = async start => {
        const [nx, ny] = await point();
        return round(Math.hypot(nx - start[0], ny - start[1]));
      };
      await page.waitForTimeout(850);
      await measure("still", () => page.waitForTimeout(1500));
      await measure("pan", async () => {
        const start = await point();
        let movedPx;
        await page.mouse.move(x, y); await page.mouse.down({ button: "right" });
        for (const offset of [70, 0, 70, 0, 70, 0]) {
          await page.mouse.move(x + offset, y, { steps: 10 }); await page.waitForTimeout(140);
          if (movedPx === undefined) movedPx = await moved(start);
        }
        await page.mouse.up({ button: "right" }); await page.waitForTimeout(450);
        if (movedPx < 1) errors.push("pan did not move the scene");
        return { movedPx };
      });
      await measure("zoom", async () => {
        const start = await point();
        let movedPx;
        for (const delta of [-420, -420, -420, 420, 420, 420]) {
          await page.mouse.wheel(0, delta); await page.waitForTimeout(160);
          if (movedPx === undefined) movedPx = await moved(start);
        }
        await page.waitForTimeout(450);
        if (movedPx < 1) errors.push("zoom did not move the scene");
        return { movedPx };
      });
      const change = async t => {
        await page.evaluate(t => {
          localStorage.setItem("universe-of-me:cosmic-quality:v1", t);
          window.dispatchEvent(new Event("cosmic-quality"));
        }, t);
        await waitReady(page, t);
      };
      await measure("switchAway", () => change(tier === "low" ? "high" : "low"));
      await measure("switchBack", () => change(tier));
      await page.getByRole("button", { name: /外观压力示例 1(?!\d)/ }).first().click();
      await measure("enter", async () => {
        await page.getByRole("button", { name: "进入记忆空间", exact: true }).click();
        await page.waitForURL("**/planet/lod-example-0", { timeout: 40_000 });
      });
      await page.getByRole("link", { name: "返回所属星系", exact: true }).click();
      await page.waitForURL("**/galaxy/unclassified?planet=lod-example-0");
    }
    const archiveUnchanged = await page.evaluate(raw => localStorage.getItem("universe-of-me:data:v1") === raw, raw);
    if (!archiveUnchanged) errors.push("archive changed");
    const probe = await page.evaluate(() => window.__lodProbe);
    const row = { name, version, count, tier, iteration, closeType, phase, firstInteractiveMs: round(probe.first), fullTextureMs: round(probe.ready),
      cold: { snapshot: cold, ...summarize(probe, 0, probe.ready) }, windows: Object.fromEntries(Object.entries(windows).map(([key, w]) => [key, { ...w, ...summarize(probe, w.start.at, w.end.at) }])),
      errors, archiveUnchanged, gpuDisjoint: probe.disjoint, visibility: probe.visibility,
      system: { freeStart: systemStart.free, freeEnd: os.freemem(), cpuPercent: (() => {
        const sum = (cpus, field) => cpus.reduce((s, c) => s + (field ? c[field] : Object.values(c).reduce((t, v) => t + v, 0)), 0);
        const end = os.cpus().map(c => c.times);
        return round(100 * (1 - (sum(end, "idle") - sum(systemStart.cpus, "idle")) / (sum(end) - sum(systemStart.cpus))));
      })() } };
    report.cases.push(row);
    if (errors.length) report.failures.push({ name, errors });
    await appendFile(rawPath, gzipSync(JSON.stringify({ ...row, probe }) + "\n"));
    console.log(JSON.stringify({ name, first: row.firstInteractiveMs, ready: row.fullTextureMs, pan: row.windows.pan?.fps, zoom: row.windows.zoom?.fps, errors }));
  } catch (error) {
    report.failures.push({ name, error: String(error), errors });
    await appendFile(rawPath, gzipSync(JSON.stringify({ name, windows, errors, error: String(error), probe: await page.evaluate(() => window.__lodProbe).catch(() => null) }) + "\n"));
    console.error(name, String(error));
  } finally {
    await save();
    await context.close();
  }
}

try {
  const mode = process.env.EXTERIOR_LOD_MODE;
  const focused = ["focus-fifty", "focus-fifty-low", "baseline-five"].includes(mode);
  const focusedTier = mode === "focus-fifty-low" ? "low" : "high";
  if (!["visual", "visual-check"].includes(mode)) for (const iteration of focused ? [1, 2, 3, 4] : mode === "smoke" ? [1] : [1, 2]) {
    const counts = iteration === 1 ? [5, 20, 50] : [50, 20, 5];
    const tiers = iteration === 1 ? ["high", "medium", "low"] : ["low", "medium", "high"];
    const cases = tiers.flatMap(tier => counts.map(count => ({ count, tier })));
    const selected = focused ? [{ count: mode === "baseline-five" ? 5 : 50, tier: focusedTier }] : mode === "smoke" ? [cases[2]] : cases;
    for (const { count, tier } of selected) {
      for (const version of mode === "baseline-five" ? ["before"] : iteration % 2 === 1 ? ["before", "after"] : ["after", "before"]) await run(version, count, tier, iteration);
    }
  }
  if (!focused && !["smoke", "matrix"].includes(mode)) for (const type of ["ice", "gas", "rocky", "ringed", "ocean"]) {
    if (batch2) {
      const angles = mode === "visual-check" ? ["back", "near"] : Object.keys(phases);
      for (const phase of angles) for (const version of ["before", "after"]) await run(version, 1, "high", 1, type, phase);
      if (mode !== "visual-check") for (const tier of ["medium", "low"]) await run("after", 1, tier, 1, type, "near");
    } else for (const version of ["before", "after"]) await run(version, 1, "high", 1, type);
  }
} finally { await browser.close(); }
if (report.failures.length) process.exitCode = 1;
