"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { planetReturnUrl } from "@/data/exploration-session";

export function PlanetExitLink({ planetId, galaxyId }: { planetId: string; galaxyId: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const href = planetReturnUrl(planetId, galaxyId);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <>
    <Link href={href} className="back-link" aria-disabled={leaving} onNavigate={event => {
      event.preventDefault(); if (timer.current) return;
      setLeaving(true);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer.current = setTimeout(() => router.push(href), reduced ? 40 : 260);
    }}><ArrowLeft size={18} /><span>返回所属星系</span></Link>
    {leaving && <div className="planet-exit-transition" role="status">正在回到星球外部…</div>}
  </>;
}
