import { Suspense } from "react";
import { UniverseExplorer } from "@/components/universe/explorer";

export default async function GalaxyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<main className="storage-state">正在展开星系…</main>}><UniverseExplorer key={id} galaxyId={id} /></Suspense>;
}
