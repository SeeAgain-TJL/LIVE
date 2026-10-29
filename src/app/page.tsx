import { Suspense } from "react";
import { GalaxyExplorer } from "@/components/galaxies/galaxy-explorer";

export default function Home() { return <Suspense fallback={<main className="storage-state">正在展开宇宙…</main>}><GalaxyExplorer /></Suspense>; }
