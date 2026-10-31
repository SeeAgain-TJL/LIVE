"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GuideAction } from "@/domain/guide";
import { DEFAULT_GUIDE_PREFERENCES, type GuidePreferences, type GuideState } from "@/domain/guide-companion";
import { GUIDE_LINES, type GuideCue } from "@/domain/guide-lines";
import { loadGuidePreferences, saveGuidePreferences, GUIDE_PREFERENCES_KEY } from "@/data/guide-preferences";

interface MemoryGuideBinding { act: (action: GuideAction) => string; reading: boolean }
interface GuideContextValue {
  binding: MemoryGuideBinding | null;
  bind: (value: MemoryGuideBinding | null) => void;
  message: string;
  say: (message: string, state?: GuideState) => void;
  cue: (event: GuideCue) => void;
  settleTravel: () => void;
  planetPreview: boolean;
  setPlanetPreview: (active: boolean) => void;
  promptsEnabled: boolean;
  setPromptsEnabled: (enabled: boolean) => void;
  preferences: GuidePreferences;
  updatePreferences: (patch: Partial<Omit<GuidePreferences, "version">>) => void;
  preferencesReady: boolean;
  preferenceError: string;
  state: GuideState;
  travelling: boolean;
  autoBubble: boolean;
  dismissBubble: () => void;
}
const GuideContext = createContext<GuideContextValue | null>(null);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [binding, setBinding] = useState<MemoryGuideBinding | null>(null);
  const [message, setMessage] = useState<string>(GUIDE_LINES.universeWelcome.text);
  const [state, setState] = useState<GuideState>("welcome");
  const [travelling, setTravelling] = useState(false);
  const [autoBubble, setAutoBubble] = useState(false);
  const [planetPreview, setPlanetPreview] = useState(false);
  const [preferences, setPreferences] = useState<GuidePreferences>({ ...DEFAULT_GUIDE_PREFERENCES });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const writable = useRef(false);
  const latestPreferences = useRef(preferences);
  const hydrated = useRef(false);
  const pendingCue = useRef<GuideCue | null>(null);
  const lastCue = useRef<{ event: GuideCue; time: number } | null>(null);
  useEffect(() => {
    const restore = () => {
      let loaded;
      try { loaded = loadGuidePreferences(window.localStorage); }
      catch { loaded = { preferences: { ...DEFAULT_GUIDE_PREFERENCES }, writable: false, error: "角色偏好存储不可用，本次会话仍可探索。" }; }
      latestPreferences.current = loaded.preferences;
      setPreferences(loaded.preferences); writable.current = loaded.writable;
      setPreferenceError(loaded.error); setPreferencesReady(true);
      hydrated.current = true;
      const deferred = pendingCue.current;
      pendingCue.current = null;
      if (!loaded.preferences.promptsEnabled) setAutoBubble(false);
      else if (deferred) { setMessage(GUIDE_LINES[deferred].text); setAutoBubble(true); }
    };
    const frame = requestAnimationFrame(restore);
    const sync = (event: StorageEvent) => { if (event.key === GUIDE_PREFERENCES_KEY) restore(); };
    window.addEventListener("storage", sync);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("storage", sync); };
  }, []);
  const updatePreferences = useCallback((patch: Partial<Omit<GuidePreferences, "version">>) => {
    const next = { ...latestPreferences.current, ...patch };
    latestPreferences.current = next; setPreferences(next);
    if (writable.current) {
      try { setPreferenceError(saveGuidePreferences(window.localStorage, next)); }
      catch { setPreferenceError("角色偏好未能保存，本次会话仍可使用。"); }
    }
  }, []);
  const setPromptsEnabled = useCallback((enabled: boolean) => {
    updatePreferences({ promptsEnabled: enabled }); if (!enabled) setAutoBubble(false);
  }, [updatePreferences]);
  const say = useCallback((text: string, nextState: GuideState = "speaking") => {
    setMessage(text); setState(nextState); setAutoBubble(true);
  }, []);
  const cue = useCallback((event: GuideCue) => {
    const line = GUIDE_LINES[event];
    setTravelling(line.busy); setState(line.state);
    if (!hydrated.current) { pendingCue.current = event; return; }
    const previous = lastCue.current;
    const now = Date.now();
    if (previous?.event === event && now - previous.time < 1500) return;
    lastCue.current = { event, time: now };
    if (latestPreferences.current.promptsEnabled) { setMessage(line.text); setAutoBubble(true); }
  }, []);
  useEffect(() => {
    if (!autoBubble && state === "idle") return;
    const timer = setTimeout(() => { setAutoBubble(false); if (!travelling) setState("idle"); }, 5000);
    return () => clearTimeout(timer);
  }, [message, state, autoBubble, travelling]);
  const dismissBubble = useCallback(() => setAutoBubble(false), []);
  const settleTravel = useCallback(() => { setTravelling(false); setState(current => current === "guiding" ? "idle" : current); }, []);
  const bind = useCallback((value: MemoryGuideBinding | null) => setBinding(value), []);
  return <GuideContext.Provider value={{ binding, bind, message, say, cue, settleTravel, planetPreview, setPlanetPreview, preferences, updatePreferences, preferencesReady, preferenceError, promptsEnabled: preferences.promptsEnabled, setPromptsEnabled, state, travelling, autoBubble, dismissBubble }}>{children}</GuideContext.Provider>;
}

export function useGuide() {
  const guide = useContext(GuideContext);
  if (!guide) throw new Error("GuideProvider is required");
  return guide;
}
export function useMemoryGuide(act: MemoryGuideBinding["act"], reading: boolean) {
  const { bind } = useGuide();
  useEffect(() => { bind({ act, reading }); return () => bind(null); }, [act, reading, bind]);
}
/** Leaving a page cancels its ownership of the global busy indicator, never the new page's camera. */
export function useGuideTravelScope() {
  const { settleTravel } = useGuide();
  useEffect(() => () => settleTravel(), [settleTravel]);
}
export function MemoryGuideBridge({ act, reading, planetId, worldReady = true }: MemoryGuideBinding & { planetId: string; worldReady?: boolean }) {
  const { cue } = useGuide();
  const welcomed = useRef<string | null>(null);
  useEffect(() => {
    if (!worldReady || welcomed.current === planetId) return;
    welcomed.current = planetId; cue("memoryEntered");
  }, [planetId, cue, worldReady]);
  const handler = useRef(act);
  useEffect(() => { handler.current = act; }, [act]);
  const dispatch = useCallback((action: GuideAction) => handler.current(action), []);
  useMemoryGuide(dispatch, reading);
  return null;
}
