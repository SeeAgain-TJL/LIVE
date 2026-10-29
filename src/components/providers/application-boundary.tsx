"use client";

import { usePathname } from "next/navigation";
import { UniverseProvider } from "./universe-provider";
import { GuideProvider } from "@/components/guide/guide-provider";
import { GlobalGuide } from "@/components/guide/global-guide";

/** The lab must not mount production providers (which can migrate/write storage). */
export function ApplicationBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/guide-lab") return children;
  return <UniverseProvider><GuideProvider>{children}<GlobalGuide /></GuideProvider></UniverseProvider>;
}
