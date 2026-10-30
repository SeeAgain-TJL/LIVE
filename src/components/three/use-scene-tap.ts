"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { isPlanetTap } from "@/domain/planet-flight";

/** Accumulated travel rejects an out-and-back drag and a two-finger gesture. */
export function useSceneTap(locked: boolean) {
  const pointers = useRef(new Set<number>());
  const gesture = useRef({ x: 0, y: 0, distance: 0, count: 0, started: 0, tap: false });
  useEffect(() => {
    const reset = () => { pointers.current.clear(); gesture.current.tap = false; };
    const release = (e: globalThis.PointerEvent) => { pointers.current.delete(e.pointerId); };
    window.addEventListener("blur", reset); window.addEventListener("pointerup", release); window.addEventListener("pointercancel", reset);
    return () => { window.removeEventListener("blur", reset); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", reset); };
  }, []);
  const move = (e: PointerEvent) => {
    const g = gesture.current; g.distance += Math.hypot(e.clientX - g.x, e.clientY - g.y); g.x = e.clientX; g.y = e.clientY;
  };
  return {
    onPointerDownCapture: (e: PointerEvent) => {
      pointers.current.add(e.pointerId);
      if (pointers.current.size === 1) gesture.current = { x: e.clientX, y: e.clientY, distance: 0, count: 1, started: performance.now(), tap: false };
      else gesture.current.count = Math.max(gesture.current.count, pointers.current.size);
    },
    onPointerMoveCapture: (e: PointerEvent) => { if (pointers.current.has(e.pointerId)) move(e); },
    onPointerUpCapture: (e: PointerEvent) => { move(e); pointers.current.delete(e.pointerId); const g = gesture.current; g.tap = isPlanetTap(g.distance, g.count, performance.now() - g.started); },
    onClickCapture: (e: MouseEvent) => { if (e.target instanceof HTMLCanvasElement && (locked || !gesture.current.tap)) { e.preventDefault(); e.stopPropagation(); } },
  };
}
