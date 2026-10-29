"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { UniverseData } from "@/domain/types";
import { travelUrl, type TravelTarget } from "@/domain/galaxy";
import { memoryDestinationUrl } from "@/domain/guide-companion";
import { useGuide } from "./guide-provider";

export function useGuideNavigation(data: UniverseData | null) {
  const router = useRouter();
  const pathname = usePathname();
  const { say, travelling } = useGuide();
  const pending = useRef(false);
  useEffect(() => { pending.current = false; }, [pathname]);
  const travel = (target: TravelTarget): boolean => {
    if (!data || pending.current || travelling) return false;
    const planet = target.kind === "planet" ? data.planets.find(p => p.id === target.id) : null;
    if (target.kind === "planet" ? !planet : !data.galaxies.some(g => g.id === target.id)) { say("这个目的地已经改变，请重新选择。"); return false; }
    pending.current = true;
    // Preserve the current galaxy when possible; all flights still use existing page coordinators.
    router.push(planet && pathname === `/galaxy/${encodeURIComponent(planet.galaxyId!)}`
      ? `${pathname}?travelPlanet=${encodeURIComponent(planet.id)}&trip=${Date.now()}` : travelUrl(target));
    // URL may stay on the same route. The actual flight owns the busy state after mounting.
    requestAnimationFrame(() => { pending.current = false; });
    return true;
  };
  const openMemory = (memoryId: string) => {
    if (!data || travelling) return false;
    const memory = data.memories.find(m => m.id === memoryId);
    if (!memory) { say("这段记忆已不存在，请重新查找。"); return false; }
    router.push(memoryDestinationUrl(memory.planetId, memory.id)); return true;
  };
  const activePlanet = data?.planets.find(p => pathname === `/planet/${encodeURIComponent(p.id)}`) ?? null;
  const inGalaxy = pathname.startsWith("/galaxy/");
  return { travel, openMemory, activePlanet, parentHref: activePlanet ? `/galaxy/${encodeURIComponent(activePlanet.galaxyId!)}` : inGalaxy ? "/" : null };
}
