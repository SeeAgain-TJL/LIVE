export type TravelMode = "comfort" | "standard" | "fast";
export const TRAVEL_PROFILES = {
  comfort: { galaxy: 6.8, planet: 5.2, arrival: 2.6, arrivalScale: 1.12, cancel: 1.2, returning: 1.8 },
  standard: { galaxy: 4.8, planet: 3.6, arrival: 1.8, arrivalScale: 1.2, cancel: .9, returning: 1.4 },
  fast: { galaxy: 2.8, planet: 2.2, arrival: 1.2, arrivalScale: 1.3, cancel: .65, returning: 1.1 },
} as const;
export function isTravelMode(value: unknown): value is TravelMode { return value === "comfort" || value === "standard" || value === "fast"; }
/** Integrated cosine velocity: launch 20%, cruise 50%, deceleration 30%. Zero endpoint velocity/acceleration. */
export function stagedProgress(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  if (t < .2) return .5 * (t - .2 / Math.PI * Math.sin(Math.PI * t / .2)) / .75;
  if (t < .7) return (t - .1) / .75;
  const r = t - .7;
  return (.6 + .5 * (r + .3 / Math.PI * Math.sin(Math.PI * r / .3))) / .75;
}
/** Hold more distance until late approach so a large planet never appears stalled. */
export function comfortableProgress(value: number, startDistance: number, endDistance: number): number {
  const p = stagedProgress(value), start = Math.max(.1, startDistance), end = Math.max(.1, endDistance);
  if (p === 0 || p === 1) return p;
  if (start <= end * 1.15) return p;
  const logarithmic = (start - Math.exp(Math.log(start) + Math.log(end / start) * p)) / (start - end);
  return p * .58 + logarithmic * .42;
}
export function journeyPhase(progress: number) {
  return progress < .2 ? "starting" : progress < .7 ? "cruising" : "slowing";
}
