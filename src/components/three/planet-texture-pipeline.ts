import type { PlanetAppearance } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { createPlanetBake, type PlanetPixels } from "./planet-texture";
import { PlanetPixelCache } from "./planet-pixel-cache";

type Appearance = Pick<PlanetAppearance, "type" | "color" | "seed">;
interface Consumer { resolve: (maps: PlanetPixels) => void; priority: () => number }
interface Job { key: string; appearance: Appearance; tier: RenderTier; consumers: Set<Consumer> }
const cache = new PlanetPixelCache();
const jobs = new Map<string, Job>();
let active: Job | undefined, worker: Worker | undefined, workerFailed = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const counters = { hits: 0, misses: 0, completed: 0, cancelled: 0, workerBakeMs: 0, fallbackBakeMs: 0, maxSliceMs: 0, workerErrors: 0 };
export const planetTextureKey = (a: Appearance, tier: RenderTier) => `${tier}:${a.type}:${a.color}:${a.seed}`;
export const exteriorTextureStats = () => ({ ...counters, cacheBytes: cache.bytes, cacheLimit: cache.limit, cacheEntries: cache.size, pending: jobs.size, worker: !!worker, fallback: workerFailed });
const abortError = () => new DOMException("Texture request cancelled", "AbortError");
const normalPriority = () => 0;

function complete(job: Job, maps: PlanetPixels) {
  if (job.consumers.size) cache.set(job.key, maps);
  for (const consumer of job.consumers) consumer.resolve(maps);
  jobs.delete(job.key); active = undefined; counters.completed++;
  pump();
}
function fallback(job: Job) {
  const bake = createPlanetBake(job.appearance, job.tier);
  const slice = () => {
    if (!job.consumers.size) { jobs.delete(job.key); active = undefined; pump(); return; }
    const start = performance.now();
    do { bake.advance(2); } while (!bake.done && performance.now() - start < 4);
    const elapsed = performance.now() - start;
    counters.fallbackBakeMs += elapsed; counters.maxSliceMs = Math.max(counters.maxSliceMs, elapsed);
    if (bake.done) complete(job, bake.maps); else setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
}
function pump() {
  if (active) return;
  clearTimeout(idleTimer);
  let job: Job | undefined, best = -Infinity;
  for (const candidate of jobs.values()) for (const consumer of candidate.consumers) {
    const score = consumer.priority();
    if (score > best) { job = candidate; best = score; }
  }
  if (!job) { idleTimer = setTimeout(() => { worker?.terminate(); worker = undefined; }, 5000); return; }
  active = job;
  if (!workerFailed && !worker) {
    try {
      worker = new Worker(new URL("./planet-texture.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ key: string; maps: PlanetPixels; bakeMs: number }>) => {
        if (active?.key !== event.data.key) return;
        counters.workerBakeMs += event.data.bakeMs; complete(active, event.data.maps);
      };
      worker.onerror = event => {
        event.preventDefault(); worker?.terminate(); worker = undefined; workerFailed = true; counters.workerErrors++;
        if (active) fallback(active);
      };
    } catch { workerFailed = true; counters.workerErrors++; }
  }
  if (worker) worker.postMessage({ key: job.key, appearance: job.appearance, tier: job.tier }); else fallback(job);
}

export function requestPlanetPixels(appearance: Appearance, tier: RenderTier, signal: AbortSignal, priority = normalPriority): Promise<PlanetPixels> {
  if (signal.aborted) return Promise.reject(abortError());
  const key = planetTextureKey(appearance, tier), hit = cache.get(key);
  if (hit) { counters.hits++; return Promise.resolve(hit); }
  return new Promise((resolve, reject) => {
    let job = jobs.get(key);
    if (!job) { job = { key, appearance, tier, consumers: new Set() }; jobs.set(key, job); counters.misses++; }
    const consumer: Consumer = { resolve: maps => { signal.removeEventListener("abort", abort); resolve(maps); }, priority };
    const abort = () => {
      job.consumers.delete(consumer); counters.cancelled++; reject(abortError());
      if (!job.consumers.size && active !== job) jobs.delete(key);
    };
    job.consumers.add(consumer); signal.addEventListener("abort", abort, { once: true });
    // Let all effects from this React commit enter the queue before picking the first job.
    if (!active && jobs.size === 1) queueMicrotask(pump);
  });
}

// One upload/commit per animation frame, including cache hits. A worker alone would still
// let 50 cached texture uploads land in one main-thread task on a quality round trip.
const uploads: { run: () => void; priority: () => number }[] = [];
let scheduled = false;
export function schedulePlanetUpload(run: () => void, signal: AbortSignal, priority = normalPriority) {
  if (signal.aborted) return;
  const item = { run: () => { signal.removeEventListener("abort", abort); run(); }, priority };
  const abort = () => { const i = uploads.indexOf(item); if (i !== -1) uploads.splice(i, 1); };
  signal.addEventListener("abort", abort, { once: true }); uploads.push(item);
  if (scheduled) return;
  scheduled = true;
  const next = () => {
    let best = -Infinity, index = -1;
    for (let i = 0; i < uploads.length; i++) {
      const score = uploads[i].priority();
      if (score > best) { best = score; index = i; }
    }
    if (index !== -1) uploads.splice(index, 1)[0].run();
    if (uploads.length) requestAnimationFrame(next); else scheduled = false;
  };
  requestAnimationFrame(next);
}
