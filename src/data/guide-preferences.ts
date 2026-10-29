import { DEFAULT_GUIDE_PREFERENCES, validGuidePreferences, type GuidePreferences } from "../domain/guide-companion.ts";

export const GUIDE_PREFERENCES_KEY = "universe-of-me:guide:v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
/** Independent UI preferences. Never reads or writes the personal archive or media. */
export function loadGuidePreferences(storage: PreferenceStorage): { preferences: GuidePreferences; writable: boolean; error: string } {
  try {
    const raw = storage.getItem(GUIDE_PREFERENCES_KEY);
    if (!raw) return { preferences: { ...DEFAULT_GUIDE_PREFERENCES }, writable: true, error: "" };
    const value: unknown = JSON.parse(raw);
    if (!validGuidePreferences(value)) throw Error("Invalid preferences");
    return { preferences: value, writable: true, error: "" };
  } catch {
    return { preferences: { ...DEFAULT_GUIDE_PREFERENCES }, writable: false, error: "无法读取角色偏好，本次调整仅在当前页面会话生效，原有存储未改写。" };
  }
}
export function saveGuidePreferences(storage: PreferenceStorage, preferences: GuidePreferences): string {
  try {
    if (!validGuidePreferences(preferences)) throw Error("Invalid preferences");
    storage.setItem(GUIDE_PREFERENCES_KEY, JSON.stringify(preferences));
    return "";
  } catch { return "角色偏好未能保存，本次调整仍可使用。你的记忆档案不受影响。"; }
}
