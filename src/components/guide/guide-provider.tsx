"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { GuideAction } from "@/domain/guide";

interface MemoryGuideBinding { act: (action: GuideAction) => string; reading: boolean }
interface GuideContextValue {
  binding: MemoryGuideBinding | null;
  bind: (value: MemoryGuideBinding | null) => void;
  message: string;
  say: (message: string) => void;
  planetPreview: boolean;
  setPlanetPreview: (active: boolean) => void;
  promptsEnabled: boolean;
  setPromptsEnabled: (enabled: boolean) => void;
  announce: (message: string) => void;
}
const GuideContext = createContext<GuideContextValue | null>(null);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [binding, setBinding] = useState<MemoryGuideBinding | null>(null);
  const [message, say] = useState("欢迎回来。今天想去哪里？");
  const [planetPreview, setPlanetPreview] = useState(false);
  const [promptsEnabled, setPromptsEnabled] = useState(true);
  const announce = useCallback((text: string) => { if (promptsEnabled) say(text); }, [promptsEnabled]);
  const bind = useCallback((value: MemoryGuideBinding | null) => setBinding(value), []);
  return <GuideContext.Provider value={{ binding, bind, message, say, planetPreview, setPlanetPreview, promptsEnabled, setPromptsEnabled, announce }}>{children}</GuideContext.Provider>;
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

/** Stable bridge so page-local filters stay outside the global companion's state. */
export function MemoryGuideBridge({ act, reading, planetId }: MemoryGuideBinding & { planetId: string }) {
  const { announce } = useGuide();
  const welcomed = useRef<string | null>(null);
  useEffect(() => {
    if (welcomed.current === planetId) return;
    welcomed.current = planetId;
    announce("欢迎回来，这里的记忆都在等着你。");
  }, [planetId, announce]);
  const handler = useRef(act);
  useEffect(() => { handler.current = act; }, [act]);
  const dispatch = useCallback((action: GuideAction) => handler.current(action), []);
  useMemoryGuide(dispatch, reading);
  return null;
}
