import { isTravelMode, type TravelMode } from "../domain/travel.ts";
export const TRAVEL_KEY = "universe-of-me:travel:v1";
export function readTravelMode(): TravelMode {
  try { const raw = localStorage.getItem(TRAVEL_KEY); return isTravelMode(raw) ? raw : "comfort"; } catch { return "comfort"; }
}
export function saveTravelMode(mode: TravelMode) {
  try { if (isTravelMode(mode)) localStorage.setItem(TRAVEL_KEY, mode); } catch { /* Optional preference, never archive data. */ }
}
