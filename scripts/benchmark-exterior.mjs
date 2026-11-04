import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSeed } from "../src/data/seed.ts";

const phase = process.argv[2] ?? "after";
const baseURL = process.env.EXTERIOR_BENCH_URL ?? "http://127.0.0.1:3321";
const output = `artifacts-local/exterior-batch-1.1/${phase}`;
const relativeFile = name => path.posix.join(output, name);
await fs.mkdir(output, { recursive: true });
await fs.mkdir("docs/exterior-batch-1.1", { recursive: true });
const report = { phase, date: new Date().toISOString(), cpu: os.cpus()[0].model, ramBytes: os.totalmem(), viewport: { width: 1600, height: 1000 }, dpr: 1.5, cases: [], failures: [], network: [], traces: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const root = await browser.newBrowserCDPSession();
report.browser = browser.version();
report.gpu = (await root.send("SystemInfo.getInfo")).gpu;
const system = () => ({ freeMemory: os.freemem(), cpus: os.cpus().map(c => c.times) });
function cpuUsage(a, b) {
  const sum = (cpus, field) => cpus.reduce((s, c) => s + (field ? c[field] : Object.values(c).reduce((t, v) => t + v, 0)), 0);
  const total = sum(b.cpus) - sum(a.cpus);
  return +(100 * (1 - (sum(b.cpus, "idle") - sum(a.cpus, "idle")) / total)).toFixed(1);
}
// Both builds get the same rAF, long-task and WebGL timer instrumentation. No GPU finish/readback stalls.
async function probe(context, raw, tier, bookmark) {
  await context.addInitScript(({ raw, tier, bookmark }) => {
    localStorage.setItem("universe-of-me:data:v1", raw);
    localStorage.setItem("universe-of-me:cosmic-quality:v1", tier);
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(bookmark));
    const p = window.__exteriorProbe = { frames: [], cpu: [], gpu: [], longTasks: [], visibility: [], readyAt: null, gpuDisjoint: 0 };
    document.addEventListener("visibilitychange", () => p.visibility.push({ at: performance.now(), state: document.visibilityState }));
    new PerformanceObserver(list => { for (const e of list.getEntries()) p.longTasks.push({ at: e.startTime, ms: e.duration }); }).observe({ type: "longtask", buffered: true });
    const raf = window.requestAnimationFrame.bind(window);
    let previous = 0, gl, ext, queries = [];
    window.requestAnimationFrame = callback => raf(time => {
      if (time !== previous) {
        if (previous) p.frames.push({ at: time, ms: time - previous });
        previous = time;
      }
      if (!gl) { gl = document.querySelector("canvas")?.getContext("webgl2"); if (gl) ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"); }
      if (ext) {
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { queries.forEach(q => gl.deleteQuery(q.query)); queries = []; p.gpuDisjoint++; }
        while (queries.length && gl.getQueryParameter(queries[0].query, gl.QUERY_RESULT_AVAILABLE)) {
          const q = queries.shift(); p.gpu.push({ at: q.at, ms: gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6 }); gl.deleteQuery(q.query);
        }
      }
      const query = ext && queries.length < 8 ? gl.createQuery() : null;
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      const start = performance.now();
      try { callback(time); } finally {
        p.cpu.push({ at: start, ms: performance.now() - start });
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push({ query, at: start }); }
      }
      if (!p.readyAt && document.querySelector("canvas")?.dataset.renderMetrics) {
        if (document.querySelector("canvas").dataset.exteriorReady !== "false") p.readyAt = performance.now();
      }
    });
  }, { raw, tier, bookmark });
}
const quantile = (a, p) => a.length ? a.slice().sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
function stats(a) { const values = a.map(x => x.ms); return { n: a.length, mean: a.length ? values.reduce((a, b) => a + b, 0) / a.length : null, p95: quantile(values, .95), max: a.length ? Math.max(...values) : null }; }
async function snapshot(page, since = 0) {
  return page.evaluate(since => {
    const p = window.__exteriorProbe, canvas = document.querySelector("canvas");
    return { now: performance.now(), readyAt: p.readyAt, frames: p.frames.filter(x => x.at >= since), cpu: p.cpu.filter(x => x.at >= since), gpu: p.gpu.filter(x => x.at >= since), longTasks: p.longTasks.filter(x => x.at >= since), visibility: p.visibility, gpuDisjoint: p.gpuDisjoint,
      metrics: JSON.parse(canvas?.dataset.renderMetrics ?? "{}"), textures: JSON.parse(canvas?.dataset.exteriorTextures ?? "null"), heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null };
  }, since);
}
function summary(s) { return { ...s, frames: stats(s.frames), fps: s.frames.length ? 1000 / stats(s.frames).mean : null, cpu: stats(s.cpu), gpu: stats(s.gpu) }; }
async function waitReady(page, tier) {
  await page.waitForFunction(tier => {
    const canvas = document.querySelector("canvas");
    return JSON.parse(canvas?.dataset.renderMetrics ?? "{}").tier === tier && canvas?.dataset.exteriorReady !== "false";
  }, tier, { timeout: 120000 });
  await page.waitForTimeout(100); // Include the first committed render, not just a resource promise.
}
try {
  // Rotated order limits thermal/order bias. A new profile/context for each cold entry.
  const plans = [
    ...[5, 20, 50].map(count => ({ count, tier: "high", round: 1 })),
    ...[50, 20, 5].map(count => ({ count, tier: "medium", round: 1 })),
    ...[50, 20, 5].map(count => ({ count, tier: "high", round: 2 })),
    ...[5, 20, 50].map(count => ({ count, tier: "low", round: 1 })),
  ];
  if (process.env.EXTERIOR_BENCH_QUICK) plans.splice(1);
  if (process.env.EXTERIOR_BENCH_DIAGNOSTIC) plans.splice(0, plans.length, ...[5, 50].map(count => ({ count, tier: "high", round: 3 })));
  for (const plan of plans) {
    const fixture = createSeed(), seeds = fixture.planets;
    fixture.planets = Array.from({ length: plan.count }, (_, i) => {
      const p = seeds[i % 5], row = Math.floor(i / 10), col = i % 10;
      return { ...p, id: `exterior-perf-${i}`, name: `外观压力示例 ${i + 1}`, isDemo: false, description: "仅用于隔离性能测试，不代表用户经历。", appearance: { ...p.appearance, seed: p.appearance.seed + Math.floor(i / 5) * 101, size: p.appearance.size * .7 }, position: plan.count === 5 ? p.position : [(col - 4.5) * 7, (row - (Math.ceil(plan.count / 10) - 1) / 2) * 7, Math.sin(i * 2.4) * 4] };
    });
    const bookmark = plan.count === 5 ? { position: [0, 12, 42], target: [-2, 0, -3] } : { position: [0, 13, 105], target: [0, 0, 0] };
    const raw = JSON.stringify(fixture), label = `${plan.count}-${plan.tier}-r${plan.round}`;
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: report.dpr });
    await probe(context, raw, plan.tier, bookmark);
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    cdp.on("Network.responseReceived", e => { if (e.response.status >= 400) report.network.push({ label, status: e.response.status, url: e.response.url, type: e.type }); });
    cdp.on("Log.entryAdded", e => { if (e.entry.level === "error") report.network.push({ label, log: e.entry }); });
    await cdp.send("Log.enable");
    page.on("pageerror", e => report.failures.push({ label, error: e.message }));
    const diagnosticEvents = [];
    if (process.env.EXTERIOR_BENCH_DIAGNOSTIC) {
      cdp.on("Tracing.dataCollected", e => diagnosticEvents.push(...e.value));
      await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-v8.gc,gpu,cc", options: "record-as-much-as-possible" });
    }
    const a = system(), processStart = await root.send("SystemInfo.getProcessInfo");
    await cdp.send("Performance.enable");
    const start = performance.now();
    await page.goto(`${baseURL}/galaxy/unclassified`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitReady(page, plan.tier);
    const coldMs = performance.now() - start, cold = summary(await snapshot(page));
    await page.waitForTimeout(1800);
    const stillStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(4000);
    const still = summary(await snapshot(page, stillStart));
    const box = await page.locator("canvas").first().boundingBox();
    const moveStart = await page.evaluate(() => performance.now());
    await page.mouse.move(box.width * .72, box.height * .72); await page.mouse.down({ button: "right" });
    for (let i = 0; i < 8; i++) { await page.mouse.move(box.width * .72 + (i % 2 ? 0 : 50), box.height * .72, { steps: 15 }); await page.waitForTimeout(350); }
    await page.mouse.up({ button: "right" });
    const moving = summary(await snapshot(page, moveStart));
    if (process.env.EXTERIOR_BENCH_DIAGNOSTIC) {
      const done = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end"); await done;
      const file = relativeFile(`${label}-cold-moving-trace.json`);
      await fs.writeFile(file, JSON.stringify({ traceEvents: diagnosticEvents }));
      const mainThreads = diagnosticEvents.filter(e => e.name === "thread_name" && e.args.name === "CrRendererMain");
      const groups = new Map();
      for (const e of diagnosticEvents) if (e.ph === "X" && mainThreads.some(t => t.pid === e.pid && t.tid === e.tid)) {
        const group = groups.get(e.name) ?? { name: e.name, n: 0, maxMs: 0, totalMs: 0 };
        group.n++; group.maxMs = Math.max(group.maxMs, (e.dur ?? 0) / 1000); group.totalMs += (e.dur ?? 0) / 1000; groups.set(e.name, group);
      }
      report.traces.push({ label, file, note: "Cold-through-moving diagnostic; tracing overhead, excluded from acceptance matrix", mainEvents: [...groups.values()].sort((a, b) => b.maxMs - a.maxMs).slice(0, 25), gc: [...groups.values()].filter(e => /(?:MajorGC|MinorGC|V8\.GC|Scavenge)/.test(e.name)) });
    }
    const switches = [];
    if (plan.tier === "high" && plan.round === 1) {
      for (const tier of ["low", "medium", "high", "low", "medium", "high"]) {
        const at = await page.evaluate(tier => {
          const at = performance.now(); localStorage.setItem("universe-of-me:cosmic-quality:v1", tier); window.dispatchEvent(new Event("cosmic-quality")); return at;
        }, tier);
        await waitReady(page, tier); const s = summary(await snapshot(page, at));
        switches.push({ tier, elapsedMs: s.now - at, ...s });
        await page.waitForTimeout(300);
      }
    }
    const perf = await cdp.send("Performance.getMetrics"), processEnd = await root.send("SystemInfo.getProcessInfo"), b = system();
    const processes = processEnd.processInfo.map(p => ({ ...p, cpuSeconds: p.cpuTime - (processStart.processInfo.find(x => x.id === p.id)?.cpuTime ?? 0) }));
    const dataUnchanged = await page.evaluate(raw => localStorage.getItem("universe-of-me:data:v1") === raw, raw);
    const result = { ...plan, coldMs, cold, still, moving, switches, perf: Object.fromEntries(perf.metrics.map(m => [m.name, m.value])), system: { cpuPercent: cpuUsage(a, b), freeStart: a.freeMemory, freeEnd: b.freeMemory }, processes, dataUnchanged };
    if (!dataUnchanged) report.failures.push({ label, error: "archive changed" });
    if (plan.round === 1 && plan.tier === "high") await page.screenshot({ path: path.join(output, `${label}.png`) });
    // A trace of a warm, static window separates main-thread JS/GC from GPU/scheduler stalls.
    if (plan.tier === "high" && plan.count === 5) {
      const events = []; cdp.on("Tracing.dataCollected", e => events.push(...e.value));
      await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-v8.gc,gpu,cc", options: "record-as-much-as-possible" });
      await page.waitForTimeout(5000);
      const done = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve)); await cdp.send("Tracing.end"); await done;
      const file = relativeFile(`${label}-trace.json`); await fs.writeFile(file, JSON.stringify({ traceEvents: events }));
      const gc = events.filter(e => e.ph === "X" && /(?:MajorGC|MinorGC|V8\.GC|Scavenge)/.test(e.name));
      report.traces.push({ label, file, events: events.length, gcCount: gc.length, gcMaxMs: Math.max(0, ...gc.map(e => (e.dur ?? 0) / 1000)), gcTotalMs: gc.reduce((n, e) => n + (e.dur ?? 0) / 1000, 0) });
    }
    report.cases.push(result);
    await fs.writeFile(`docs/exterior-batch-1.1/${phase}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ label, coldMs: Math.round(coldMs), coldLongTask: Math.max(0, ...cold.longTasks.map(x => x.ms)), fps: still.fps?.toFixed(1), p95: still.frames.p95, max: still.frames.max, cpu: still.cpu.p95, gpu: still.gpu.p95, textures: still.metrics.textures }));
    await context.close();
  }
  console.log(JSON.stringify({ network: report.network, failures: report.failures, traces: report.traces }));
} finally { await browser.close(); }
