"use client";

import { usePathname } from "next/navigation";
import { UniverseProvider } from "./universe-provider";
import { GuideProvider } from "@/components/guide/guide-provider";
import { GlobalGuide } from "@/components/guide/global-guide";

/** The lab must not mount production providers (which can migrate/write storage). */
export function ApplicationBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/forest-memory-lab") return children;
  if (pathname === "/guide-lab" || pathname === "/forest-lab" || pathname === "/forest-source-lab" || pathname === "/forest-origin-lab" || pathname === "/forest-runtime-lab" || pathname === "/forest-lod-lab" || pathname === "/single-tree-lab") return children;
  return <UniverseProvider><GuideProvider>{children}<GlobalGuide /></GuideProvider></UniverseProvider>;
}
