import type { CameraBookmark, Quality } from "../domain/types.ts";
import { validBookmark } from "./exploration-session.ts";

export const COSMIC_CAMERA_KEY = "universe-of-me:cosmic-camera:v1";
const QUALITY_KEY = "universe-of-me:cosmic-quality:v1";
const ARRIVAL_KEY = "universe-of-me:galaxy-arrival:v1";
export function readCosmicCamera(): CameraBookmark | null {
  try { const raw = localStorage.getItem(COSMIC_CAMERA_KEY); const value: unknown = raw ? JSON.parse(raw) : null; return validBookmark(value) ? value : null; } catch { return null; }
}
export function saveCosmicCamera(value: CameraBookmark) {
  try { localStorage.setItem(COSMIC_CAMERA_KEY, JSON.stringify(value)); } catch { /* Optional view only. */ }
}
export function readCosmicQuality(): Quality {
  try { const value = localStorage.getItem(QUALITY_KEY); return value === "high" || value === "medium" || value === "low" ? value : "auto"; } catch { return "auto"; }
}
export function saveCosmicQuality(value: Quality) {
  try { localStorage.setItem(QUALITY_KEY, value); } catch { /* Optional rendering preference. */ }
}
export function markGalaxyArrival(id: string) {
  try { sessionStorage.setItem(ARRIVAL_KEY, JSON.stringify({ id, time: Date.now() })); } catch { /* Direct navigation still works. */ }
}
export function consumeGalaxyArrival(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(ARRIVAL_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(ARRIVAL_KEY);
    const value = JSON.parse(raw);
    return value.id === id && typeof value.time === "number" && Date.now() - value.time >= 0 && Date.now() - value.time < 15000;
  } catch { return false; }
}
