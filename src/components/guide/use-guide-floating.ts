"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { clamp, guidePosition, snapGuide, type GuidePreferences } from "@/domain/guide-companion";

/** Only the character moves; dialogue and search remain in their own safe viewport panels. */
export function useGuideFloating(preferences: GuidePreferences, update: (patch: Partial<GuidePreferences>) => void, compact: boolean) {
  const element = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [dragging, setDragging] = useState(false);
  const pathname = usePathname();
  const [safePlacement, setSafePlacement] = useState<{ key: string; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; distance: number; lastX: number; lastY: number } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    const frame = requestAnimationFrame(resize);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  const position = guidePosition(preferences, viewport.width, viewport.height, compact);
  const placementKey = `${pathname}/${preferences.edge}/${preferences.heightRatio}/${viewport.width}/${viewport.height}/${compact}`;
  useEffect(() => {
    const measure = () => {
      const b = guidePosition(preferences, viewport.width, viewport.height, compact);
      const obstacles = [...document.querySelectorAll("main .topbar, main .world-hud, main .world-management, main .galaxy-intro, main .intro, main .galaxy-library, main .planet-library, main .selection-card, main .scene-tools, main .galaxy-back-navigation, main .memory-detail-panel, main .memory-toolbar, main .planet-info-menu")]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0")
        .map(el => el.getBoundingClientRect()).filter(r => r.right > b.x && r.left < b.x + b.w);
      const candidates = [b.y, b.minY, b.maxY, ...obstacles.flatMap(r => [r.top - b.h - 12, r.bottom + 12])].map(y => clamp(y, b.minY, b.maxY));
      const score = (y: number) => obstacles.reduce((sum, r) => sum + Math.max(0, Math.min(y + b.h, r.bottom) - Math.max(y, r.top)) * Math.min(b.w, r.width) * 100, 0) + Math.abs(y - b.y);
      const y = candidates.sort((a, c) => score(a) - score(c))[0];
      setSafePlacement(previous => previous?.key === placementKey && previous.y === y ? previous : { key: placementKey, y });
    };
    let frame = requestAnimationFrame(measure);
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    const main = document.querySelector("main");
    if (main) observer.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-expanded", "data-hud-mode"] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [placementKey, preferences, viewport.width, viewport.height, compact]);
  const top = safePlacement?.key === placementKey ? safePlacement.y : position.y;
  const style: CSSProperties = { left: position.x, top, width: position.w, height: position.h };
  const reset = () => {
    drag.current = null; setDragging(false);
    if (element.current) { element.current.style.left = `${position.x}px`; element.current.style.top = `${top}px`; }
  };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // Touch emulation reports button=-1 on some Chromium versions; it is still a
    // primary drag gesture and must remain distinguishable from a click.
    if (!event.isPrimary || (event.button !== 0 && event.pointerType !== "touch") || drag.current || !element.current) return;
    const r = element.current.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, distance: 0, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || d.id !== event.pointerId || !element.current) return;
    d.distance += Math.hypot(event.clientX - d.lastX, event.clientY - d.lastY); d.lastX = event.clientX; d.lastY = event.clientY;
    if (d.distance <= 7) return;
    suppressClick.current = true; setDragging(true);
    element.current.style.left = `${clamp(d.left + event.clientX - d.x, position.minX, position.maxX)}px`;
    element.current.style.top = `${clamp(d.top + event.clientY - d.y, position.minY, position.maxY)}px`;
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || d.id !== event.pointerId || !element.current) return;
    const r = element.current.getBoundingClientRect();
    if (d.distance > 7) update(snapGuide(r.x, r.y, viewport.width, viewport.height, compact));
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const pointerCancel = () => { suppressClick.current = true; reset(); };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") suppressClick.current = false;
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") update({ edge: event.key === "ArrowLeft" ? "left" : "right" });
    else update({ heightRatio: clamp(preferences.heightRatio + (event.key === "ArrowUp" ? -0.1 : 0.1), 0, 1) });
  };
  const consumeDragClick = () => { const suppressed = suppressClick.current; suppressClick.current = false; return suppressed; };
  return { element, style, dragging, consumeDragClick, events: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: pointerCancel, onLostPointerCapture: () => { if (drag.current) pointerCancel(); }, onKeyDown: keyDown } };
}
