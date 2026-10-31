"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { planetReturnUrl } from "@/data/exploration-session";
export function PlanetExitLink({ planetId, galaxyId, label = "返回所属星系" }: { planetId: string; galaxyId: string; label?: string }) {
  return <Link href={planetReturnUrl(planetId, galaxyId)} className="back-link"><ArrowLeft size={18} /><span>{label}</span></Link>;
}
