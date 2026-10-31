"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FlightRequest } from "@/components/three/camera-rig";
import { useGuide, useGuideTravelScope } from "@/components/guide/guide-provider";

export type JourneyPhase = "idle" | "flying" | "approaching" | "transition" | "returning" | "cancelling";

/** One cancellable entry task; refs close the gap before the next React render. */
export function usePlanetJourney(returning: boolean) {
  const router = useRouter();
  const { cue, settleTravel } = useGuide();
  useGuideTravelScope();
  // Announce before the scene's passive effects can complete a bookmark-less return.
  useLayoutEffect(() => { if (returning) cue("explorationReturning"); }, [returning, cue]);
  const [phase, setPhase] = useState<JourneyPhase>(returning ? "returning" : "idle");
  const [flight, setFlight] = useState<FlightRequest | null>(null);
  const [sceneAvailable, setSceneAvailable] = useState(true);
  const active = useRef<string | null>(null);
  const sequence = useRef(0);
  const committed = useRef(false);
  const locked = phase !== "idle";
  const fly = useCallback((id: string, enter = false) => {
    if (active.current || phase !== "idle") return;
    if (!sceneAvailable) {
      if (enter) router.push(`/planet/${encodeURIComponent(id)}`);
      return;
    }
    if (enter) {
      active.current = id; committed.current = false; setPhase("flying"); cue("planetDeparture");
      router.prefetch(`/planet/${encodeURIComponent(id)}`);
      void import("@/components/three/planet-world").catch(() => { /* The world has its own resource failure UI. */ });
    }
    setFlight({ planetId: id, nonce: ++sequence.current, enter });
  }, [cue, router, phase, sceneAvailable]);
  const cancel = useCallback(() => {
    if (!active.current || committed.current) return;
    active.current = null;
    setFlight(null); setPhase("cancelling");
    cue("travelCancelled");
  }, [cue]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current || document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [cancel]);
  useEffect(() => () => { active.current = null; }, []);
  const approach = useCallback((id: string) => {
    if (active.current !== id) return;
    setPhase("approaching"); cue("planetApproach");
  }, [cue]);
  const arrive = useCallback((id: string) => {
    if (active.current !== id || committed.current) return;
    committed.current = true;
    setPhase("transition");
    cue("planetArrived");
    router.push(`/planet/${encodeURIComponent(id)}`);
  }, [router, cue]);
  const overview = useCallback(() => { if (!active.current && phase === "idle") setFlight({ planetId: null, nonce: ++sequence.current }); }, [phase]);
  const returned = useCallback(() => { setPhase("idle"); cue("explorationReturned"); }, [cue]);
  const unavailable = useCallback(() => {
    settleTravel();
    setSceneAvailable(false);
    const pending = active.current;
    active.current = null;
    committed.current = false; setFlight(null); setPhase("idle");
    if (pending) router.push(`/planet/${encodeURIComponent(pending)}`);
  }, [router, settleTravel]);
  return { phase, locked, flight, sceneAvailable, fly, cancel, approach, arrive, overview, returned, unavailable };
}
