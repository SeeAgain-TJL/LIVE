"use client";

import { useSyncExternalStore } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;

export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
}

function subscribeDevice(callback: () => void) {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getDevice = () => window.matchMedia("(max-width: 760px)").matches || navigator.hardwareConcurrency <= 4;
export function useLowPowerDevice() {
  return useSyncExternalStore(subscribeDevice, getDevice, () => true);
}
