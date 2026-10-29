"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FlightRequest } from "@/components/three/camera-rig";
import { useGuide } from "@/components/guide/guide-provider";

export type JourneyPhase = "idle" | "flying" | "approaching" | "transition" | "returning" | "cancelling";

/** One cancellable entry task; refs close the gap before the next React render. */
export function usePlanetJourney(returning: boolean) {
  const router = useRouter();
  const { announce } = useGuide();
  const [phase, setPhase] = useState<JourneyPhase>(returning ? "returning" : "idle");
  const [flight, setFlight] = useState<FlightRequest | null>(null);
  const [sceneAvailable, setSceneAvailable] = useState(true);
  const active = useRef<string | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = phase !== "idle";
  const fly = useCallback((id: string, enter = false) => {
    if (active.current || phase !== "idle") return;
    if (!sceneAvailable) {
      if (enter) router.push(`/planet/${encodeURIComponent(id)}`);
      return;
    }
    if (enter) {
      active.current = id; setPhase("flying"); announce("我们去这颗星球看看吧。");
      router.prefetch(`/planet/${encodeURIComponent(id)}`);
    }
    setFlight({ planetId: id, nonce: ++sequence.current, enter });
  }, [announce, router, phase, sceneAvailable]);
  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setFlight(null); setPhase("cancelling");
    announce("我们先留在这里。你可以继续探索。");
  }, [announce]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current || document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [cancel]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); active.current = null; }, []);
  const approach = useCallback((id: string) => {
    if (active.current !== id) return;
    setPhase("approaching"); announce("已经快到了。");
  }, [announce]);
  const arrive = useCallback((id: string) => {
    if (active.current !== id || timer.current) return;
    setPhase("transition");
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 380;
    timer.current = setTimeout(() => {
      if (active.current === id) router.push(`/planet/${encodeURIComponent(id)}`);
    }, delay);
  }, [router]);
  const overview = useCallback(() => { if (!active.current && phase === "idle") setFlight({ planetId: null, nonce: ++sequence.current }); }, [phase]);
  const returned = useCallback(() => setPhase("idle"), []);
  const unavailable = useCallback(() => {
    setSceneAvailable(false);
    const pending = active.current;
    active.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setFlight(null); setPhase("idle");
    if (pending) router.push(`/planet/${encodeURIComponent(pending)}`);
  }, [router]);
  return { phase, locked, flight, sceneAvailable, fly, cancel, approach, arrive, overview, returned, unavailable };
}
